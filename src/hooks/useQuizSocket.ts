import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  OptionIndex,
  Question,
  RoomSettings,
  RoomSnapshot,
  ServerMessage,
} from '../shared/types';
import { soundEngine } from '../utils/sound';

const TOKEN_STORAGE_KEY = 'quizduel_player_token';
const ROOM_STORAGE_KEY = 'quizduel_active_room';

function getOrCreatePlayerToken(): string {
  try {
    const existing = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (existing) return existing;
    const generated = `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `tok-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function isKnownStaticHost(): boolean {
  const host = window.location.hostname.toLowerCase();
  return (
    window.location.protocol === 'file:' ||
    host.endsWith('.github.io') ||
    host.endsWith('.gitlab.io') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.surge.sh')
  );
}

function resolveConfiguredWsUrl(): string | null {
  const configured = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (!configured) return null;

  let normalized = configured;
  if (normalized.startsWith('https://')) {
    normalized = `wss://${normalized.slice('https://'.length)}`;
  } else if (normalized.startsWith('http://')) {
    normalized = `ws://${normalized.slice('http://'.length)}`;
  } else if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
    const proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    normalized = `${proto}${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/ws';
    }
    return parsed.toString();
  } catch {
    return normalized;
  }
}

export function useQuizSocket() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const staticRelayRef = useRef<import('../static/staticRoomRelay').StaticRoomRelay | null>(null);
  const wsVerifiedRef = useRef(false);
  const tokenRef = useRef<string>(getOrCreatePlayerToken());
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const intentionalCloseRef = useRef(false);

  snapshotRef.current = snapshot;

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'room:error') {
      if (msg.code === 'SESSION_EXPIRED' || msg.code === 'ROOM_NOT_FOUND') {
        try {
          sessionStorage.removeItem(ROOM_STORAGE_KEY);
        } catch {
          // ignore
        }
        if (msg.code === 'SESSION_EXPIRED') {
          return;
        }
      }
      setError(msg.message);
      return;
    }

    if (msg.type === 'room:joined' || msg.type === 'room:state') {
      setError(null);
      setServerOffsetMs(msg.snapshot.serverNow - Date.now());
      setSnapshot(msg.snapshot);
      try {
        sessionStorage.setItem(ROOM_STORAGE_KEY, msg.snapshot.roomCode);
      } catch {
        // ignore
      }
      return;
    }

    if (msg.type === 'answer:locked_self') {
      soundEngine.playLockIn();
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              selfLockedOption: msg.optionIndex,
              lockedPlayerIds: prev.lockedPlayerIds.includes(prev.selfId)
                ? prev.lockedPlayerIds
                : [...prev.lockedPlayerIds, prev.selfId],
            }
          : prev
      );
      return;
    }

    if (msg.type === 'answer:locked_opponent') {
      soundEngine.playOpponentLocked();
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              opponentLocked: true,
              lockedPlayerIds: prev.lockedPlayerIds.includes(msg.playerId)
                ? prev.lockedPlayerIds
                : [...prev.lockedPlayerIds, msg.playerId],
            }
          : prev
      );
      return;
    }

    if (msg.type === 'round:started') {
      setServerOffsetMs(msg.serverNow - Date.now());
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              phase: 'QUESTION',
              players: prev.players.map((p) => ({ ...p, readyForNext: false })),
              currentQuestionIndex: msg.questionIndex,
              totalQuestions: msg.totalQuestions,
              currentQuestion: msg.question,
              questionStartedAt: msg.questionStartedAt,
              serverNow: msg.serverNow,
              selfLockedOption: null,
              opponentLocked: false,
              lockedPlayerIds: [],
              currentReview: null,
            }
          : prev
      );
      return;
    }

    if (msg.type === 'round:revealed') {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const selfPick = msg.review.picks[prev.selfId];
        if (selfPick?.isCorrect) {
          soundEngine.playCorrect();
        } else {
          soundEngine.playWrong();
        }
        return {
          ...prev,
          phase: 'REVEAL',
          players: msg.players,
          currentReview: msg.review,
          history: prev.history.some((r) => r.questionIndex === msg.review.questionIndex)
            ? prev.history
            : [...prev.history, msg.review],
        };
      });
      return;
    }

    if (msg.type === 'match:finished') {
      soundEngine.playVictoryFanfare();
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              phase: 'MATCH_OVER',
              players: msg.players,
              history: msg.history,
            }
          : prev
      );
      return;
    }

    if (msg.type === 'chat:message') {
      setSnapshot((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.message.id)) return prev;
        if (msg.message.senderId !== prev.selfId) {
          soundEngine.playChatPop();
        }
        return {
          ...prev,
          messages: [...prev.messages, msg.message].slice(-100),
        };
      });
    }
  }, []);

  const startStaticRelay = useCallback(async () => {
    if (staticRelayRef.current || intentionalCloseRef.current) return;
    setConnecting(true);
    const { StaticRoomRelay } = await import('../static/staticRoomRelay');
    if (staticRelayRef.current || intentionalCloseRef.current) return;

    const relay = new StaticRoomRelay(
      tokenRef.current,
      handleServerMessage,
      (isConn, isConnecting) => {
        setConnected(isConn);
        setConnecting(isConnecting);
      }
    );
    staticRelayRef.current = relay;
    relay.connect();
  }, [handleServerMessage]);

  const send = useCallback((msg: ClientMessage) => {
    if (staticRelayRef.current) {
      void staticRelayRef.current.send(msg);
      return;
    }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      setError('Connection not ready. Retrying...');
    }
  }, []);

  const connect = useCallback(() => {
    const configuredWsUrl = resolveConfiguredWsUrl();

    if (!configuredWsUrl && isKnownStaticHost()) {
      void startStaticRelay();
      return;
    }

    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = configuredWsUrl || `${protocol}//${window.location.host}/ws`;

    setConnecting(true);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      wsVerifiedRef.current = true;
      setConnected(true);
      setConnecting(false);
      setError(null);

      // Attempt session restoration if this tab was already in a room
      try {
        const savedRoom = sessionStorage.getItem(ROOM_STORAGE_KEY);
        const urlRoom = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
        const targetRoom = savedRoom || (snapshotRef.current?.roomCode ?? null);
        if (targetRoom && (!urlRoom || urlRoom === targetRoom)) {
          ws.send(
            JSON.stringify({
              type: 'room:reconnect',
              roomCode: targetRoom,
              playerToken: tokenRef.current,
            } satisfies ClientMessage)
          );
        }
      } catch {
        // ignore storage errors
      }
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      handleServerMessage(msg);
    };

    ws.onclose = () => {
      setConnected(false);
      setConnecting(false);
      if (intentionalCloseRef.current) return;

      // If no configured backend URL and the initial /ws probe failed, run zero-config static mode
      if (!configuredWsUrl && !wsVerifiedRef.current) {
        void startStaticRelay();
        return;
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, 1200);
    };
  }, [handleServerMessage, startStaticRelay]);

  useEffect(() => {
    intentionalCloseRef.current = false;
    connect();

    const handleWakeReconnect = () => {
      if (document.visibilityState === 'visible') {
        if (staticRelayRef.current) return;
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleWakeReconnect);
    window.addEventListener('online', handleWakeReconnect);

    return () => {
      intentionalCloseRef.current = true;
      document.removeEventListener('visibilitychange', handleWakeReconnect);
      window.removeEventListener('online', handleWakeReconnect);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      staticRelayRef.current?.destroy();
      staticRelayRef.current = null;
    };
  }, [connect]);

  const createRoom = useCallback(
    (playerName: string) => {
      setError(null);
      send({ type: 'room:create', playerName, playerToken: tokenRef.current });
    },
    [send]
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      setError(null);
      send({
        type: 'room:join',
        roomCode: roomCode.trim().toUpperCase(),
        playerName,
        playerToken: tokenRef.current,
      });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'room:leave' });
    try {
      sessionStorage.removeItem(ROOM_STORAGE_KEY);
    } catch {
      // ignore
    }
    const url = new URL(window.location.href);
    if (url.searchParams.has('room')) {
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }
    setSnapshot(null);
    setError(null);
  }, [send]);

  const updateSettings = useCallback(
    (settings: Partial<RoomSettings>) => {
      send({ type: 'room:update_settings', settings });
    },
    [send]
  );

  const updateDeck = useCallback(
    (title: string, questions: Question[]) => {
      send({ type: 'deck:update', title, questions });
    },
    [send]
  );

  const startMatch = useCallback(() => {
    setError(null);
    send({ type: 'match:start' });
  }, [send]);

  const lockAnswer = useCallback(
    (optionIndex: OptionIndex) => {
      send({ type: 'answer:lock', optionIndex });
    },
    [send]
  );

  const nextRound = useCallback(() => {
    send({ type: 'round:next' });
  }, [send]);

  const rematch = useCallback(() => {
    send({ type: 'match:rematch' });
  }, [send]);

  const sendChat = useCallback(
    (text: string, kind: 'message' | 'reaction' = 'message') => {
      const clean = text.trim();
      if (!clean) return;
      send({ type: 'chat:send', text: clean, kind });
    },
    [send]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    snapshot,
    connected,
    connecting,
    error,
    clearError,
    serverOffsetMs,
    createRoom,
    joinRoom,
    leaveRoom,
    updateSettings,
    updateDeck,
    startMatch,
    lockAnswer,
    nextRound,
    rematch,
    sendChat,
  };
}
