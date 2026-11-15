import mqtt, { type MqttClient } from 'mqtt';
import type { ClientMessage, ServerMessage } from '../shared/types';
import { openRoomPayload, sealRoomPayload } from './roomCrypto';
import { StaticRoomEngine } from './staticRoomEngine';

const PUBLIC_WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.freemqtt.com:8084/mqtt',
];

interface WireEnvelope {
  nonce: string;
  senderToken: string;
  targetToken?: string;
  payload: ClientMessage | ServerMessage;
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createNonce(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export class StaticRoomRelay {
  private selfToken: string;
  private onServerMessage: (msg: ServerMessage) => void;
  private onStatusChange: (connected: boolean, connecting: boolean) => void;

  private client: MqttClient | null = null;
  private brokerIndex = 0;
  private isConnected = false;
  private destroyed = false;

  private activeRoomCode: string | null = null;
  private hostEngine: StaticRoomEngine | null = null;
  private channel: BroadcastChannel | null = null;
  private seenNonces = new Set<string>();
  private subscribedTopics = new Set<string>();
  private pendingPublishes: Array<{ roomCode: string; topic: string; envelope: WireEnvelope }> = [];
  private wakeLock: WakeLockSentinel | null = null;
  private joinTimeoutTimer: number | null = null;
  private joinRetryTimer: number | null = null;

  constructor(
    selfToken: string,
    onServerMessage: (msg: ServerMessage) => void,
    onStatusChange: (connected: boolean, connecting: boolean) => void
  ) {
    this.selfToken = selfToken;
    this.onServerMessage = onServerMessage;
    this.onStatusChange = onStatusChange;
  }

  connect(): void {
    if (this.destroyed || this.client) return;
    this.connectToBroker(this.brokerIndex);
  }

  private connectToBroker(index: number): void {
    if (this.destroyed) return;
    const brokerUrl = PUBLIC_WSS_BROKERS[index % PUBLIC_WSS_BROKERS.length];
    this.onStatusChange(false, true);

    const client = mqtt.connect(brokerUrl, {
      clientId: `qd_${this.selfToken.slice(-8)}_${Math.random().toString(36).slice(2, 7)}`,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2000,
      keepalive: 25,
    });
    this.client = client;

    let failedBeforeConnect = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!this.isConnected && !this.destroyed && this.client === client) {
        failedBeforeConnect = true;
        client.end(true);
        this.client = null;
        this.brokerIndex = (index + 1) % PUBLIC_WSS_BROKERS.length;
        this.connectToBroker(this.brokerIndex);
      }
    }, 5500);

    client.on('connect', () => {
      window.clearTimeout(fallbackTimer);
      if (this.destroyed || this.client !== client) return;
      this.isConnected = true;
      this.onStatusChange(true, false);

      const topics = Array.from(this.subscribedTopics);
      const flushOutbox = () => {
        const queued = this.pendingPublishes.splice(0, this.pendingPublishes.length);
        for (const item of queued) {
          if (item.roomCode === this.activeRoomCode) {
            void this.publishToMqtt(item.roomCode, item.topic, item.envelope);
          }
        }
      };

      if (topics.length > 0) {
        client.subscribe(topics, { qos: 1 }, () => flushOutbox());
      } else {
        flushOutbox();
      }
    });

    client.on('reconnect', () => {
      if (this.destroyed || this.client !== client) return;
      this.isConnected = false;
      this.onStatusChange(false, true);
    });

    client.on('close', () => {
      window.clearTimeout(fallbackTimer);
      if (this.destroyed || failedBeforeConnect || this.client !== client) return;
      this.isConnected = false;
      this.onStatusChange(false, true);
    });

    client.on('error', () => {
      // Handled by timeout / reconnect lifecycle
    });

    client.on('message', async (_topic, payloadBuffer) => {
      if (this.destroyed || !this.activeRoomCode) return;
      const envelope = await openRoomPayload<WireEnvelope>(
        this.activeRoomCode,
        payloadBuffer.toString()
      );
      if (!envelope) return;
      await this.handleEnvelope(envelope);
    });
  }

  private markNonceSeen(nonce: string): boolean {
    if (this.seenNonces.has(nonce)) return false;
    this.seenNonces.add(nonce);
    if (this.seenNonces.size > 500) {
      const oldest = this.seenNonces.values().next().value;
      if (oldest) this.seenNonces.delete(oldest);
    }
    return true;
  }

  private async handleEnvelope(envelope: WireEnvelope): Promise<void> {
    if (!this.markNonceSeen(envelope.nonce)) return;

    if (this.hostEngine) {
      // Messages addressed to Host engine from remote participants
      if (envelope.senderToken !== this.selfToken) {
        this.hostEngine.handleClientMessage(
          envelope.senderToken,
          envelope.payload as ClientMessage
        );
      }
      return;
    }

    // Participant receiving Host broadcasts or unicast messages
    if (envelope.targetToken && envelope.targetToken !== 'broadcast' && envelope.targetToken !== this.selfToken) {
      return;
    }

    const msg = envelope.payload as ServerMessage;
    if (msg.type === 'room:joined' || msg.type === 'room:error') {
      this.clearJoinTimers();
    }
    this.onServerMessage(msg);
  }

  private openBroadcastChannel(roomCode: string): void {
    this.closeBroadcastChannel();
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(`quizduel-static-${roomCode}`);
    ch.onmessage = (event) => {
      const envelope = event.data as WireEnvelope;
      if (envelope && envelope.nonce) {
        void this.handleEnvelope(envelope);
      }
    };
    this.channel = ch;
  }

  private closeBroadcastChannel(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }

  private clearJoinTimers(): void {
    if (this.joinTimeoutTimer !== null) {
      window.clearTimeout(this.joinTimeoutTimer);
      this.joinTimeoutTimer = null;
    }
    if (this.joinRetryTimer !== null) {
      window.clearTimeout(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
  }

  private resetRoomState(): void {
    this.clearJoinTimers();
    this.releaseWakeLock();
    if (this.client) {
      for (const topic of this.subscribedTopics) {
        this.client.unsubscribe(topic);
      }
    }
    this.subscribedTopics.clear();
    this.pendingPublishes = [];
    this.closeBroadcastChannel();
    this.hostEngine?.destroy();
    this.hostEngine = null;
    this.activeRoomCode = null;
  }

  private async requestWakeLock(): Promise<void> {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {
      // Ignore unsupported or denied wake lock
    }
  }

  private releaseWakeLock(): void {
    if (this.wakeLock) {
      void this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  private subscribeTopics(topics: string[]): Promise<void> {
    for (const t of topics) {
      this.subscribedTopics.add(t);
    }
    if (!this.client || !this.isConnected) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.client!.subscribe(topics, { qos: 1 }, () => resolve());
    });
  }

  private async publishToMqtt(
    roomCode: string,
    topic: string,
    envelope: WireEnvelope
  ): Promise<void> {
    if (!this.client || !this.isConnected) return;
    const sealed = await sealRoomPayload(roomCode, envelope);
    this.client.publish(topic, sealed, { qos: 1 });
  }

  private async publishEnvelope(
    roomCode: string,
    topic: string,
    envelope: WireEnvelope
  ): Promise<void> {
    this.markNonceSeen(envelope.nonce);
    try {
      this.channel?.postMessage(envelope);
    } catch {
      // ignore closed channel
    }

    if (this.client && this.isConnected) {
      await this.publishToMqtt(roomCode, topic, envelope);
    } else {
      this.pendingPublishes.push({ roomCode, topic, envelope });
      if (this.pendingPublishes.length > 50) {
        this.pendingPublishes.shift();
      }
    }
  }

  private emitFromHost = (targetToken: string | 'broadcast', msg: ServerMessage): void => {
    if (msg.type === 'room:joined' || msg.type === 'room:state' || msg.type === 'room:error') {
      if (targetToken === this.selfToken || targetToken === 'broadcast') {
        this.onServerMessage(msg);
      }
      if (targetToken !== this.selfToken && this.activeRoomCode) {
        const topic =
          targetToken === 'broadcast'
            ? `quizduel/v1/room/${this.activeRoomCode}/h2c/broadcast`
            : `quizduel/v1/room/${this.activeRoomCode}/h2c/${targetToken}`;
        void this.publishEnvelope(this.activeRoomCode, topic, {
          nonce: createNonce(),
          senderToken: this.selfToken,
          targetToken,
          payload: msg,
        });
      }
      return;
    }

    // All other host->client events: deliver locally if addressed to self or broadcast, and publish to MQTT/BC
    if (targetToken === 'broadcast' || targetToken === this.selfToken) {
      this.onServerMessage(msg);
    }
    if (this.activeRoomCode && targetToken !== this.selfToken) {
      const topic =
        targetToken === 'broadcast'
          ? `quizduel/v1/room/${this.activeRoomCode}/h2c/broadcast`
          : `quizduel/v1/room/${this.activeRoomCode}/h2c/${targetToken}`;
      void this.publishEnvelope(this.activeRoomCode, topic, {
        nonce: createNonce(),
        senderToken: this.selfToken,
        targetToken,
        payload: msg,
      });
    }
  };

  async send(msg: ClientMessage): Promise<void> {
    if (this.destroyed) return;

    if (msg.type === 'room:create') {
      this.resetRoomState();
      const roomCode = generateRoomCode();
      this.activeRoomCode = roomCode;
      this.openBroadcastChannel(roomCode);
      await this.subscribeTopics([`quizduel/v1/room/${roomCode}/c2h`]);
      this.hostEngine = new StaticRoomEngine(
        roomCode,
        msg.playerName,
        this.selfToken,
        this.emitFromHost
      );
      return;
    }

    if (msg.type === 'room:join' || msg.type === 'room:reconnect') {
      const roomCode = msg.roomCode.trim().toUpperCase();
      if (!roomCode) return;

      this.resetRoomState();
      this.activeRoomCode = roomCode;
      this.openBroadcastChannel(roomCode);

      const h2cSelf = `quizduel/v1/room/${roomCode}/h2c/${this.selfToken}`;
      const h2cBroadcast = `quizduel/v1/room/${roomCode}/h2c/broadcast`;
      const c2hTopic = `quizduel/v1/room/${roomCode}/c2h`;

      await this.subscribeTopics([h2cSelf, h2cBroadcast]);

      const sendJoinPacket = () => {
        void this.publishEnvelope(roomCode, c2hTopic, {
          nonce: createNonce(),
          senderToken: this.selfToken,
          payload: msg,
        });
      };

      sendJoinPacket();
      this.joinRetryTimer = window.setTimeout(sendJoinPacket, 1500);
      this.joinTimeoutTimer = window.setTimeout(() => {
        if (msg.type === 'room:reconnect') {
          this.onServerMessage({
            type: 'room:error',
            code: 'SESSION_EXPIRED',
            message: 'Session expired. Please enter your name to join the room.',
          });
        } else {
          this.onServerMessage({
            type: 'room:error',
            code: 'ROOM_NOT_FOUND',
            message: `Room "${roomCode}" not found, or the host is offline.`,
          });
        }
        this.resetRoomState();
      }, 6000);
      return;
    }

    if (msg.type === 'room:leave') {
      if (this.activeRoomCode && !this.hostEngine) {
        await this.publishEnvelope(
          this.activeRoomCode,
          `quizduel/v1/room/${this.activeRoomCode}/c2h`,
          {
            nonce: createNonce(),
            senderToken: this.selfToken,
            payload: msg,
          }
        );
      }
      this.resetRoomState();
      return;
    }

    if (!this.activeRoomCode) {
      this.onServerMessage({
        type: 'room:error',
        message: 'Not connected to a room.',
      });
      return;
    }

    if (this.hostEngine) {
      if (msg.type === 'match:start') {
        void this.requestWakeLock();
      }
      this.hostEngine.handleClientMessage(this.selfToken, msg);
      return;
    }

    await this.publishEnvelope(
      this.activeRoomCode,
      `quizduel/v1/room/${this.activeRoomCode}/c2h`,
      {
        nonce: createNonce(),
        senderToken: this.selfToken,
        payload: msg,
      }
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.resetRoomState();
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }
}
