import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { STARTER_DECK_TITLE, STARTER_QUESTIONS } from './src/shared/starterQuestions.ts';
import type {
  ChatMessage,
  ClientMessage,
  ClientQuestion,
  MatchPhase,
  OptionIndex,
  PlayerInfo,
  Question,
  RoomSettings,
  RoomSnapshot,
  RoundPickResult,
  RoundReview,
  ServerMessage,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface ServerPlayer extends PlayerInfo {
  token: string;
  ws: WebSocket | null;
}

interface PendingPick {
  optionIndex: OptionIndex;
  elapsedMs: number;
}

interface ServerRoom {
  roomCode: string;
  phase: MatchPhase;
  players: ServerPlayer[];
  settings: RoomSettings;
  deckTitle: string;
  deckUpdatedBy: string;
  questions: Question[];
  activeQuestions: Question[];
  currentQuestionIndex: number;
  questionStartedAt: number | null;
  currentPicks: Map<string, PendingPick>;
  currentReview: RoundReview | null;
  history: RoundReview[];
  messages: ChatMessage[];
  roundTimer: NodeJS.Timeout | null;
  autoAdvanceTimer: NodeJS.Timeout | null;
  lastActivityAt: number;
}

const rooms = new Map<string, ServerRoom>();
const socketMeta = new WeakMap<WebSocket, { roomCode: string; playerId: string }>();

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sanitizeName(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
  return clean || 'Player';
}

function shuffleQuestionsList(questions: Question[]): Question[] {
  const copy = [...questions];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getParticipants(room: ServerRoom): ServerPlayer[] {
  return room.players.filter((p) => p.role === 'participant');
}

function toPublicPlayer(p: ServerPlayer): PlayerInfo {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    isHost: p.isHost,
    connected: p.connected,
    score: p.score,
    streak: p.streak,
    bestStreak: p.bestStreak,
    correctCount: p.correctCount,
    totalResponseMs: p.totalResponseMs,
    answeredCount: p.answeredCount,
    readyForNext: p.readyForNext,
  };
}

function toClientQuestion(q: Question): ClientQuestion {
  return {
    id: q.id,
    question: q.question,
    options: q.options,
    topic: q.topic,
  };
}

function buildSnapshot(room: ServerRoom, selfPlayer: ServerPlayer): RoomSnapshot {
  const selfPick = room.currentPicks.get(selfPlayer.id);
  const participants = getParticipants(room);
  const otherParticipant = participants.find((p) => p.id !== selfPlayer.id);
  const opponentLocked =
    selfPlayer.role === 'participant'
      ? Boolean(otherParticipant && room.currentPicks.has(otherParticipant.id))
      : room.currentPicks.size > 0;

  const canEditDeck =
    room.phase === 'LOBBY' && (selfPlayer.isHost || room.settings.allowGuestUpload);

  const topics = Array.from(
    new Set(
      room.questions
        .map((q) => q.topic?.trim())
        .filter((t): t is string => Boolean(t))
    )
  ).slice(0, 6);

  const deckForMatch = room.phase === 'LOBBY' ? room.questions : room.activeQuestions;

  const currentQ =
    room.phase === 'QUESTION' && deckForMatch[room.currentQuestionIndex]
      ? toClientQuestion(deckForMatch[room.currentQuestionIndex])
      : null;

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    selfId: selfPlayer.id,
    players: room.players.map(toPublicPlayer),
    settings: { ...room.settings },
    deckSummary: {
      title: room.deckTitle,
      count: room.questions.length,
      topics,
      updatedBy: room.deckUpdatedBy,
    },
    editableQuestions: canEditDeck ? room.questions : null,
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: deckForMatch.length,
    currentQuestion: currentQ,
    questionStartedAt: room.questionStartedAt,
    serverNow: Date.now(),
    selfLockedOption: selfPick ? selfPick.optionIndex : null,
    opponentLocked,
    lockedPlayerIds: Array.from(room.currentPicks.keys()),
    currentReview: room.currentReview,
    history: room.history,
    messages: room.messages,
  };
}

function sendToPlayer(player: ServerPlayer, payload: ServerMessage): void {
  if (player.ws && player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify(payload));
  }
}

function sendError(ws: WebSocket, message: string, code?: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    const payload: ServerMessage = { type: 'room:error', message, code };
    ws.send(JSON.stringify(payload));
  }
}

function broadcastSnapshot(room: ServerRoom): void {
  for (const player of room.players) {
    sendToPlayer(player, {
      type: 'room:state',
      snapshot: buildSnapshot(room, player),
    });
  }
}

function clearRoomTimers(room: ServerRoom): void {
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
  if (room.autoAdvanceTimer) {
    clearTimeout(room.autoAdvanceTimer);
    room.autoAdvanceTimer = null;
  }
}

function startQuestionRound(room: ServerRoom): void {
  clearRoomTimers(room);
  room.lastActivityAt = Date.now();

  if (room.currentQuestionIndex >= room.activeQuestions.length) {
    room.phase = 'MATCH_OVER';
    const players = room.players.map(toPublicPlayer);
    for (const player of room.players) {
      sendToPlayer(player, {
        type: 'match:finished',
        players,
        history: room.history,
      });
    }
    return;
  }

  room.phase = 'QUESTION';
  room.currentPicks.clear();
  room.currentReview = null;
  room.questionStartedAt = Date.now();
  for (const player of room.players) {
    player.readyForNext = false;
  }

  const question = room.activeQuestions[room.currentQuestionIndex];
  const clientQuestion = toClientQuestion(question);
  const serverNow = Date.now();

  for (const player of room.players) {
    sendToPlayer(player, {
      type: 'round:started',
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.activeQuestions.length,
      question: clientQuestion,
      questionStartedAt: room.questionStartedAt,
      serverNow,
      timeLimitSec: room.settings.timeLimitSec,
    });
  }

  room.roundTimer = setTimeout(() => {
    revealCurrentRound(room);
  }, room.settings.timeLimitSec * 1000);
}

function revealCurrentRound(room: ServerRoom): void {
  if (room.phase !== 'QUESTION') return;
  clearRoomTimers(room);
  room.lastActivityAt = Date.now();

  const q = room.activeQuestions[room.currentQuestionIndex];
  if (!q) return;

  const timeLimitMs = room.settings.timeLimitSec * 1000;
  const picks: Record<string, RoundPickResult> = {};
  const participants = getParticipants(room);

  for (const player of participants) {
    const pick = room.currentPicks.get(player.id);
    if (!pick) {
      player.streak = 0;
      picks[player.id] = {
        playerId: player.id,
        playerName: player.name,
        optionIndex: null,
        elapsedMs: null,
        isCorrect: false,
        basePoints: 0,
        speedBonus: 0,
        totalPoints: 0,
        streakAfter: 0,
      };
      continue;
    }

    const isCorrect = pick.optionIndex === q.correctIndex;
    player.answeredCount += 1;
    player.totalResponseMs += pick.elapsedMs;

    if (isCorrect) {
      const basePoints = 10;
      const ratio = Math.max(0, Math.min(1, 1 - pick.elapsedMs / timeLimitMs));
      const speedBonus = room.settings.speedBonusEnabled ? Math.round(5 * ratio) : 0;
      const totalPoints = basePoints + speedBonus;

      player.score += totalPoints;
      player.correctCount += 1;
      player.streak += 1;
      if (player.streak > player.bestStreak) {
        player.bestStreak = player.streak;
      }

      picks[player.id] = {
        playerId: player.id,
        playerName: player.name,
        optionIndex: pick.optionIndex,
        elapsedMs: pick.elapsedMs,
        isCorrect: true,
        basePoints,
        speedBonus,
        totalPoints,
        streakAfter: player.streak,
      };
    } else {
      player.streak = 0;
      picks[player.id] = {
        playerId: player.id,
        playerName: player.name,
        optionIndex: pick.optionIndex,
        elapsedMs: pick.elapsedMs,
        isCorrect: false,
        basePoints: 0,
        speedBonus: 0,
        totalPoints: 0,
        streakAfter: 0,
      };
    }
  }

  const review: RoundReview = {
    questionIndex: room.currentQuestionIndex,
    questionId: q.id,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    topic: q.topic,
    picks,
  };

  room.phase = 'REVEAL';
  room.currentReview = review;
  room.history.push(review);

  const isLastQuestion = room.currentQuestionIndex + 1 >= room.activeQuestions.length;
  const players = room.players.map(toPublicPlayer);

  for (const player of room.players) {
    sendToPlayer(player, {
      type: 'round:revealed',
      review,
      players,
      isLastQuestion,
    });
  }

  if (room.settings.autoAdvanceSec > 0) {
    room.autoAdvanceTimer = setTimeout(() => {
      advanceToNextRound(room);
    }, room.settings.autoAdvanceSec * 1000);
  }
}

function advanceToNextRound(room: ServerRoom): void {
  if (room.phase !== 'REVEAL') return;
  clearRoomTimers(room);
  room.currentQuestionIndex += 1;
  startQuestionRound(room);
}

function resetPlayerMatchStats(player: ServerPlayer): void {
  player.score = 0;
  player.streak = 0;
  player.bestStreak = 0;
  player.correctCount = 0;
  player.totalResponseMs = 0;
  player.answeredCount = 0;
  player.readyForNext = false;
}

function validateDeckQuestions(raw: unknown): Question[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null;
  const validated: Question[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') return null;
    const obj = item as Partial<Question>;
    const prompt = typeof obj.question === 'string' ? obj.question.trim() : '';
    if (!prompt) return null;
    if (!Array.isArray(obj.options) || obj.options.length !== 4) return null;
    const opts = obj.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
    if (opts.some((o) => !o)) return null;
    if (
      typeof obj.correctIndex !== 'number' ||
      !Number.isInteger(obj.correctIndex) ||
      obj.correctIndex < 0 ||
      obj.correctIndex > 3
    ) {
      return null;
    }

    validated.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `custom-${i + 1}`,
      question: prompt,
      options: [opts[0], opts[1], opts[2], opts[3]],
      correctIndex: obj.correctIndex as OptionIndex,
      explanation: typeof obj.explanation === 'string' && obj.explanation.trim() ? obj.explanation.trim() : undefined,
      topic: typeof obj.topic === 'string' && obj.topic.trim() ? obj.topic.trim() : undefined,
    });
  }
  return validated;
}

function handleDisconnectOrLeave(ws: WebSocket, explicitLeave: boolean): void {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  socketMeta.delete(ws);

  const room = rooms.get(meta.roomCode);
  if (!room) return;

  const idx = room.players.findIndex((p) => p.id === meta.playerId);
  if (idx === -1) return;

  const player = room.players[idx];
  if (player.ws !== ws) return;

  if (explicitLeave) {
    room.players.splice(idx, 1);
    if (room.players.length === 0) {
      clearRoomTimers(room);
      rooms.delete(room.roomCode);
      return;
    }
    // Only reset an active match if a playing participant leaves mid-duel;
    // Host leaving/stepping away lets the two participants finish automatically.
    if (
      player.role === 'participant' &&
      (room.phase === 'QUESTION' || room.phase === 'REVEAL')
    ) {
      clearRoomTimers(room);
      room.phase = 'LOBBY';
      room.currentQuestionIndex = 0;
      room.currentPicks.clear();
      room.currentReview = null;
      room.history = [];
      room.players.forEach(resetPlayerMatchStats);
    }
    if (room.phase === 'LOBBY' && !room.players.some((p) => p.isHost)) {
      room.players[0].isHost = true;
    }
    broadcastSnapshot(room);
  } else {
    player.connected = false;
    player.ws = null;
    broadcastSnapshot(room);
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, activeRooms: rooms.size });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const aliveMap = new WeakMap<WebSocket, boolean>();

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (aliveMap.get(client) === false) {
        client.terminate();
        continue;
      }
      aliveMap.set(client, false);
      client.ping();
    }
  }, 25_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws) => {
    aliveMap.set(ws, true);
    ws.on('pong', () => {
      aliveMap.set(ws, true);
    });

    ws.on('message', (rawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(rawData)) as ClientMessage;
      } catch {
        sendError(ws, 'Invalid message format.');
        return;
      }

      if (msg.type === 'room:create') {
        handleDisconnectOrLeave(ws, true);

        const roomCode = generateRoomCode();
        const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const host: ServerPlayer = {
          id: playerId,
          token: msg.playerToken || playerId,
          name: sanitizeName(msg.playerName),
          role: 'host',
          isHost: true,
          connected: true,
          score: 0,
          streak: 0,
          bestStreak: 0,
          correctCount: 0,
          totalResponseMs: 0,
          answeredCount: 0,
          readyForNext: false,
          ws,
        };

        const room: ServerRoom = {
          roomCode,
          phase: 'LOBBY',
          players: [host],
          settings: {
            timeLimitSec: 30,
            speedBonusEnabled: true,
            autoAdvanceSec: 6,
            allowGuestUpload: false,
            shuffleQuestions: true,
          },
          deckTitle: STARTER_DECK_TITLE,
          deckUpdatedBy: host.name,
          questions: [...STARTER_QUESTIONS],
          activeQuestions: [...STARTER_QUESTIONS],
          currentQuestionIndex: 0,
          questionStartedAt: null,
          currentPicks: new Map(),
          currentReview: null,
          history: [],
          messages: [],
          roundTimer: null,
          autoAdvanceTimer: null,
          lastActivityAt: Date.now(),
        };

        rooms.set(roomCode, room);
        socketMeta.set(ws, { roomCode, playerId });

        sendToPlayer(host, {
          type: 'room:joined',
          snapshot: buildSnapshot(room, host),
        });
        return;
      }

      if (msg.type === 'room:join' || msg.type === 'room:reconnect') {
        const code = msg.roomCode.trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendError(ws, `Room "${code}" not found or has expired.`, 'ROOM_NOT_FOUND');
          return;
        }
        room.lastActivityAt = Date.now();

        const existing = room.players.find((p) => p.token === msg.playerToken);
        if (existing) {
          if (existing.ws && existing.ws !== ws) {
            socketMeta.delete(existing.ws);
            try {
              existing.ws.close();
            } catch {
              // ignore
            }
          }
          existing.ws = ws;
          existing.connected = true;
          if (msg.type === 'room:join' && msg.playerName.trim()) {
            existing.name = sanitizeName(msg.playerName);
          }
          socketMeta.set(ws, { roomCode: code, playerId: existing.id });
          sendToPlayer(existing, {
            type: 'room:joined',
            snapshot: buildSnapshot(room, existing),
          });
          broadcastSnapshot(room);
          return;
        }

        if (msg.type === 'room:reconnect') {
          sendError(ws, 'Session expired. Please enter your name to join the room.', 'SESSION_EXPIRED');
          return;
        }

        // Room capacity: 1 Host + 2 Participants
        const participants = getParticipants(room);
        if (participants.length >= 2) {
          const disconnectedParticipant = participants.find((p) => !p.connected);
          if (room.phase === 'LOBBY' && disconnectedParticipant) {
            const removeIdx = room.players.findIndex((p) => p.id === disconnectedParticipant.id);
            if (removeIdx !== -1) {
              room.players.splice(removeIdx, 1);
            }
          } else {
            sendError(
              ws,
              'This session already has 2 participants seated (1 Host + 2 Participants).',
              'ROOM_FULL'
            );
            return;
          }
        }

        const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const guest: ServerPlayer = {
          id: playerId,
          token: msg.playerToken || playerId,
          name: sanitizeName(msg.playerName),
          role: 'participant',
          isHost: false,
          connected: true,
          score: 0,
          streak: 0,
          bestStreak: 0,
          correctCount: 0,
          totalResponseMs: 0,
          answeredCount: 0,
          readyForNext: false,
          ws,
        };

        room.players.push(guest);
        socketMeta.set(ws, { roomCode: code, playerId });

        sendToPlayer(guest, {
          type: 'room:joined',
          snapshot: buildSnapshot(room, guest),
        });
        broadcastSnapshot(room);
        return;
      }

      const meta = socketMeta.get(ws);
      if (!meta) {
        sendError(ws, 'Not connected to a room.');
        return;
      }

      const room = rooms.get(meta.roomCode);
      if (!room) {
        sendError(ws, 'Room no longer exists.');
        return;
      }

      const sender = room.players.find((p) => p.id === meta.playerId);
      if (!sender) return;
      room.lastActivityAt = Date.now();

      if (msg.type === 'room:leave') {
        handleDisconnectOrLeave(ws, true);
        return;
      }

      if (msg.type === 'room:update_settings') {
        if (!sender.isHost || room.phase !== 'LOBBY') return;
        const s = msg.settings;
        if (typeof s.timeLimitSec === 'number' && [10, 15, 20, 30, 45, 60].includes(s.timeLimitSec)) {
          room.settings.timeLimitSec = s.timeLimitSec;
        }
        if (typeof s.speedBonusEnabled === 'boolean') {
          room.settings.speedBonusEnabled = s.speedBonusEnabled;
        }
        if (typeof s.autoAdvanceSec === 'number' && [0, 4, 6, 8, 12].includes(s.autoAdvanceSec)) {
          room.settings.autoAdvanceSec = s.autoAdvanceSec;
        }
        if (typeof s.allowGuestUpload === 'boolean') {
          room.settings.allowGuestUpload = s.allowGuestUpload;
        }
        if (typeof s.shuffleQuestions === 'boolean') {
          room.settings.shuffleQuestions = s.shuffleQuestions;
        }
        broadcastSnapshot(room);
        return;
      }

      if (msg.type === 'deck:update') {
        if (room.phase !== 'LOBBY') {
          sendError(ws, 'Questions can only be updated while in the lobby.');
          return;
        }
        if (!sender.isHost && !room.settings.allowGuestUpload) {
          sendError(ws, 'Only the room host can modify questions.');
          return;
        }
        const validated = validateDeckQuestions(msg.questions);
        if (!validated) {
          sendError(ws, 'Invalid question deck. Ensure 1–100 questions, each with 4 options and an answer.');
          return;
        }
        room.questions = validated;
        room.deckTitle = msg.title.trim().slice(0, 60) || 'Custom MCQ Deck';
        room.deckUpdatedBy = sender.name;
        broadcastSnapshot(room);
        return;
      }

      if (msg.type === 'match:start') {
        if (!sender.isHost || room.phase !== 'LOBBY') return;
        const connectedParticipants = getParticipants(room).filter((p) => p.connected);
        if (connectedParticipants.length < 2) {
          sendError(ws, 'Wait for both participants (2/2) to join before starting the session.');
          return;
        }
        if (room.questions.length === 0) {
          sendError(ws, 'Upload at least 1 question before starting.');
          return;
        }

        room.players.forEach(resetPlayerMatchStats);
        room.activeQuestions = room.settings.shuffleQuestions
          ? shuffleQuestionsList(room.questions)
          : [...room.questions];
        room.currentQuestionIndex = 0;
        room.history = [];
        room.currentReview = null;
        startQuestionRound(room);
        return;
      }

      if (msg.type === 'answer:lock') {
        if (room.phase !== 'QUESTION') return;
        if (sender.role !== 'participant') return;
        if (room.currentPicks.has(sender.id)) return;
        if (![0, 1, 2, 3].includes(msg.optionIndex)) return;

        const elapsedMs = Math.min(
          room.settings.timeLimitSec * 1000,
          Math.max(0, Date.now() - (room.questionStartedAt ?? Date.now()))
        );

        room.currentPicks.set(sender.id, {
          optionIndex: msg.optionIndex,
          elapsedMs,
        });

        // Confirm secretly to sender ONLY
        sendToPlayer(sender, {
          type: 'answer:locked_self',
          optionIndex: msg.optionIndex,
        });

        // Notify other room members (other participant + observing host) WITHOUT revealing chosen option
        for (const other of room.players) {
          if (other.id !== sender.id) {
            sendToPlayer(other, {
              type: 'answer:locked_opponent',
              playerId: sender.id,
              playerName: sender.name,
            });
          }
        }

        // Instant simultaneous reveal the moment both participants lock in
        const participants = getParticipants(room);
        if (room.currentPicks.size >= participants.length) {
          revealCurrentRound(room);
        }
        return;
      }

      if (msg.type === 'round:next') {
        if (room.phase !== 'REVEAL') return;
        if (sender.isHost) {
          advanceToNextRound(room);
          return;
        }

        sender.readyForNext = true;
        const participants = getParticipants(room);
        const allParticipantsReady = participants.every((p) => p.readyForNext || !p.connected);
        if (allParticipantsReady) {
          advanceToNextRound(room);
        } else {
          broadcastSnapshot(room);
        }
        return;
      }

      if (msg.type === 'match:rematch') {
        if (room.phase !== 'MATCH_OVER') return;
        const hostConnected = room.players.some((p) => p.isHost && p.connected);
        if (!sender.isHost && hostConnected) return;
        clearRoomTimers(room);
        room.phase = 'LOBBY';
        room.currentQuestionIndex = 0;
        room.currentPicks.clear();
        room.currentReview = null;
        room.history = [];
        room.players.forEach(resetPlayerMatchStats);
        broadcastSnapshot(room);
        return;
      }

      if (msg.type === 'chat:send') {
        const cleanText = typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
        if (!cleanText) return;

        const chatMsg: ChatMessage = {
          id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          senderId: sender.id,
          senderName: sender.name,
          text: cleanText,
          kind: msg.kind === 'reaction' ? 'reaction' : 'message',
          createdAt: Date.now(),
        };

        room.messages.push(chatMsg);
        if (room.messages.length > 100) {
          room.messages = room.messages.slice(-100);
        }

        for (const player of room.players) {
          sendToPlayer(player, { type: 'chat:message', message: chatMsg });
        }
        return;
      }
    });

    ws.on('close', () => {
      handleDisconnectOrLeave(ws, false);
    });
  });

  // Periodically prune stale rooms
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      const anyConnected = room.players.some((p) => p.connected);
      if (!anyConnected && now - room.lastActivityAt > ROOM_IDLE_TTL_MS) {
        clearRoomTimers(room);
        rooms.delete(code);
      }
    }
  }, 15 * 60 * 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`QuizDuel server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
