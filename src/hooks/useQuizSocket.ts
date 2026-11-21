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

export function useQuizSocket() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string>(getOrCreatePlayerToken());
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const intentionalCloseRef = useRef(false);

  snapshotRef.current = snapshot;

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    if (msg.type === 'room:error') {
      if (
        msg.code === 'SESSION_EXPIRED' ||
        msg.code === 'ROOM_NOT_FOUND' ||
        msg.code === 'KICKED'
      ) {
        try {
          sessionStorage.removeItem(ROOM_STORAGE_KEY);
        } catch {
          // ignore
        }
        if (msg.code === 'KICKED') {
          setSnapshot(null);
        }
        if (msg.code === 'SESSION_EXPIRED') {
          return;
        }
      }
      setError(msg.message);
      return;
    }

    if (msg.type === 'room:joined' || msg.type === 'room:state') {
      const prev = snapshotRef.current;
      if (msg.type === 'room:joined') {
        if (!prev || prev.roomCode !== msg.snapshot.roomCode) {
          soundEngine.playRoomJoin();
        }
      } else if (
        prev &&
        msg.snapshot.players.filter((p) => !p.hasLeft).length >
          prev.players.filter((p) => !p.hasLeft).length
      ) {
        soundEngine.playPlayerJoined();
      }
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

    if (msg.type === 'presence:changed') {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((p) =>
                p.id === msg.playerId ? { ...p, presenceStatus: msg.presenceStatus } : p
              ),
            }
          : prev
      );
      return;
    }

    if (msg.type === 'answer:locked_self') {
      soundEngine.playLockIn();
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              selfLockedOption: msg.skipped ? null : msg.optionIndex,
              selfSkipped: Boolean(msg.skipped),
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
      if (msg.questionIndex === 0) {
        soundEngine.playMatchStart();
      } else {
        soundEngine.playNextRound();
      }
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
              selfSkipped: false,
              opponentLocked: false,
              lockedPlayerIds: [],
              currentReview: null,
            }
          : prev
      );
      return;
    }

    if (msg.type === 'round:revealed') {
      const prev = snapshotRef.current;
      if (prev) {
        const selfPick = msg.review.picks[prev.selfId];
        if (!selfPick || selfPick.skipped) {
          soundEngine.playRevealNeutral();
        } else if (selfPick.isCorrect) {
          soundEngine.playCorrect();
        } else {
          soundEngine.playWrong();
        }
      }
      setSnapshot((curr) =>
        curr
          ? {
              ...curr,
              phase: 'REVEAL',
              players: msg.players,
              currentReview: msg.review,
              history: curr.history.some((r) => r.questionIndex === msg.review.questionIndex)
                ? curr.history
                : [...curr.history, msg.review],
            }
          : curr
      );
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
      const prev = snapshotRef.current;
      if (
        prev &&
        !prev.messages.some((m) => m.id === msg.message.id) &&
        msg.message.senderId !== prev.selfId
      ) {
        soundEngine.playChatPop();
      }
      setSnapshot((curr) => {
        if (!curr) return curr;
        if (curr.messages.some((m) => m.id === msg.message.id)) return curr;
        return {
          ...curr,
          messages: [...curr.messages, msg.message].slice(-100),
        };
      });
    }
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      setError('Connection not ready. Retrying...');
    }
  }, []);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setConnecting(true);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
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
      if (!intentionalCloseRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, 1200);
      }
    };
  }, [handleServerMessage]);

  useEffect(() => {
    intentionalCloseRef.current = false;
    connect();

    const handleWakeReconnect = () => {
      if (document.visibilityState === 'visible') {
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
    };
  }, [connect]);

  // Live 3-color presence tracking (30s inactivity or tab hidden -> idle; activity/visible -> active)
  const roomCode = snapshot?.roomCode ?? null;
  useEffect(() => {
    if (!connected || !roomCode) return;

    const IDLE_TIMEOUT_MS = 30_000;
    let lastActivityAt = Date.now();
    let reportedStatus: 'active' | 'idle' | null = null;
    let idleTimerId: number | null = null;

    const emitPresence = (nextStatus: 'active' | 'idle') => {
      if (reportedStatus === nextStatus) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        reportedStatus = nextStatus;
        ws.send(JSON.stringify({ type: 'presence:update', status: nextStatus } satisfies ClientMessage));
      }
    };

    const scheduleIdleTimer = () => {
      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
      }
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt));
      idleTimerId = window.setTimeout(() => {
        if (document.visibilityState === 'hidden' || Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
          emitPresence('idle');
        }
      }, remaining);
    };

    const markActive = () => {
      if (document.visibilityState === 'hidden') return;
      lastActivityAt = Date.now();
      emitPresence('active');
      scheduleIdleTimer();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (idleTimerId !== null) {
          window.clearTimeout(idleTimerId);
          idleTimerId = null;
        }
        emitPresence('idle');
      } else {
        markActive();
      }
    };

    // Initial sync when entering room / connecting
    if (document.visibilityState === 'hidden') {
      emitPresence('idle');
    } else {
      emitPresence('active');
      scheduleIdleTimer();
    }

    const activityEvents: (keyof WindowEventMap)[] = [
      'pointerdown',
      'keydown',
      'touchstart',
      'mousemove',
    ];
    for (const evt of activityEvents) {
      window.addEventListener(evt, markActive, { passive: true });
    }
    window.addEventListener('scroll', markActive, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (idleTimerId !== null) {
        window.clearTimeout(idleTimerId);
      }
      for (const evt of activityEvents) {
        window.removeEventListener(evt, markActive);
      }
      window.removeEventListener('scroll', markActive, { capture: true });
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [connected, roomCode]);

  const createRoom = useCallback(
    (playerName: string) => {
      soundEngine.unlock();
      setError(null);
      send({ type: 'room:create', playerName, playerToken: tokenRef.current });
    },
    [send]
  );

  const joinRoom = useCallback(
    (roomCode: string, playerName: string) => {
      soundEngine.unlock();
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
    soundEngine.unlock();
    setError(null);
    send({ type: 'match:start' });
  }, [send]);

  const lockAnswer = useCallback(
    (optionIndex: OptionIndex) => {
      soundEngine.unlock();
      send({ type: 'answer:lock', optionIndex });
    },
    [send]
  );

  const skipAnswer = useCallback(() => {
    soundEngine.unlock();
    send({ type: 'answer:skip' });
  }, [send]);

  const nextRound = useCallback(() => {
    soundEngine.unlock();
    send({ type: 'round:next' });
  }, [send]);

  const rematch = useCallback(() => {
    soundEngine.unlock();
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

  const kickPlayer = useCallback(
    (playerId: string) => {
      send({ type: 'room:kick', playerId });
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
    kickPlayer,
    updateSettings,
    updateDeck,
    startMatch,
    lockAnswer,
    skipAnswer,
    nextRound,
    rematch,
    sendChat,
  };
}
