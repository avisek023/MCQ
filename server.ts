import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { STARTER_DECK_TITLE, STARTER_QUESTIONS } from './src/shared/starterQuestions.ts';
import {
  roundPoints,
  type ChatMessage,
  type ClientMessage,
  type ClientQuestion,
  type MatchPhase,
  type OptionIndex,
  type PlayerInfo,
  type PresenceStatus,
  type Question,
  type RoomSettings,
  type RoomSnapshot,
  type RoundPickResult,
  type RoundReview,
  type ServerMessage,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const AWAY_GRACE_MS = 5 * 60 * 1000; // 5 minutes
const AWAY_MAX_MISSED_QUESTIONS = 3;

interface ServerPlayer extends PlayerInfo {
  token: string;
  ws: WebSocket | null;
  disconnectedAt: number | null;
  questionsMissedWhileAway: number;
  awayKickTimer: NodeJS.Timeout | null;
}

interface PendingPick {
  optionIndex: OptionIndex | null;
  skipped: boolean;
  elapsedMs: number | null;
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

function getActivePlayers(room: ServerRoom): ServerPlayer[] {
  if (room.settings.hostMode === 'solo') {
    return room.players.filter((p) => p.isHost);
  }
  if (room.settings.hostMode === 'play_with') {
    return room.players;
  }
  return room.players.filter((p) => p.role === 'participant');
}

function isActivePlayer(room: ServerRoom, player: ServerPlayer): boolean {
  if (room.settings.hostMode === 'solo') return player.isHost;
  if (room.settings.hostMode === 'play_with') return true;
  return player.role === 'participant';
}

function toPublicPlayer(p: ServerPlayer): PlayerInfo {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    isHost: p.isHost,
    connected: p.connected,
    presenceStatus: p.presenceStatus,
    hasLeft: Boolean(p.hasLeft),
    score: roundPoints(p.score),
    streak: p.streak,
    bestStreak: p.bestStreak,
    correctCount: p.correctCount,
    wrongCount: p.wrongCount,
    unattemptedCount: p.unattemptedCount,
    totalResponseMs: p.totalResponseMs,
    answeredCount: p.answeredCount,
    readyForNext: p.readyForNext,
    questionsMissedWhileAway: p.questionsMissedWhileAway,
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
  const activePlayers = getActivePlayers(room);
  const otherActivePlayers = activePlayers.filter((p) => p.id !== selfPlayer.id);
  const opponentLocked = isActivePlayer(room, selfPlayer)
    ? otherActivePlayers.some((p) => room.currentPicks.has(p.id))
    : activePlayers.some((p) => room.currentPicks.has(p.id));

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
    selfLockedOption: selfPick && !selfPick.skipped ? selfPick.optionIndex : null,
    selfSkipped: Boolean(selfPick?.skipped),
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

function broadcastPresence(room: ServerRoom, playerId: string, presenceStatus: PresenceStatus): void {
  for (const player of room.players) {
    sendToPlayer(player, {
      type: 'presence:changed',
      playerId,
      presenceStatus,
    });
  }
}

function clearPlayerAwayTimer(player: ServerPlayer): void {
  if (player.awayKickTimer) {
    clearTimeout(player.awayKickTimer);
    player.awayKickTimer = null;
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

function clearAllRoomTimers(room: ServerRoom): void {
  clearRoomTimers(room);
  for (const player of room.players) {
    clearPlayerAwayTimer(player);
  }
}

function maybeRevealIfAllConnectedLocked(room: ServerRoom): boolean {
  if (room.phase !== 'QUESTION') return false;
  const connectedActive = getActivePlayers(room).filter((p) => p.connected && !p.hasLeft);
  if (
    connectedActive.length > 0 &&
    connectedActive.every((p) => room.currentPicks.has(p.id))
  ) {
    revealCurrentRound(room);
    return true;
  }
  return false;
}

function kickParticipant(
  room: ServerRoom,
  targetPlayerId: string,
  reason: 'host_kick' | 'away_timeout'
): boolean {
  const idx = room.players.findIndex(
    (p) => p.id === targetPlayerId && p.role === 'participant'
  );
  if (idx === -1) return false;

  const target = room.players[idx];
  clearPlayerAwayTimer(target);
  room.currentPicks.delete(target.id);

  if (target.ws) {
    socketMeta.delete(target.ws);
    if (target.ws.readyState === WebSocket.OPEN) {
      const msg =
        reason === 'host_kick'
          ? 'You were removed from the room by the Host.'
          : 'You were removed from the room after being away too long.';
      sendError(target.ws, msg, 'KICKED');
      try {
        target.ws.close();
      } catch {
        // ignore
      }
    }
    target.ws = null;
  }

  if (room.phase === 'LOBBY') {
    room.players.splice(idx, 1);
  } else {
    target.connected = false;
    target.presenceStatus = 'offline';
    target.hasLeft = true;
  }

  const remainingActive = getActivePlayers(room).filter((p) => !p.hasLeft);
  if (
    remainingActive.length === 0 &&
    (room.phase === 'QUESTION' || room.phase === 'REVEAL')
  ) {
    clearRoomTimers(room);
    room.phase = 'LOBBY';
    room.currentQuestionIndex = 0;
    room.currentPicks.clear();
    room.currentReview = null;
    room.history = [];
    room.players = room.players.filter((p) => !p.hasLeft);
    room.players.forEach(resetPlayerMatchStats);
    broadcastSnapshot(room);
    return true;
  }

  if (room.phase === 'QUESTION' && maybeRevealIfAllConnectedLocked(room)) {
    return true;
  }

  broadcastSnapshot(room);
  return true;
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

  const picks: Record<string, RoundPickResult> = {};
  const participants = getParticipants(room).filter((p) => !p.hasLeft);
  for (const participant of participants) {
    if (!participant.connected) {
      participant.questionsMissedWhileAway += 1;
    }
  }
  const activePlayers = getActivePlayers(room);
  const scoringMode = room.settings.scoringMode ?? 'exam';
  const timeLimitMs = room.settings.timeLimitSec * 1000;

  for (const player of activePlayers) {
    const pick = room.currentPicks.get(player.id);
    if (!pick || pick.skipped || pick.optionIndex === null) {
      player.streak = 0;
      player.unattemptedCount += 1;
      picks[player.id] = {
        playerId: player.id,
        playerName: player.name,
        optionIndex: null,
        skipped: Boolean(pick?.skipped),
        elapsedMs: null,
        isCorrect: false,
        basePoints: 0,
        speedBonus: 0,
        totalPoints: 0,
        streakAfter: 0,
      };
      continue;
    }

    const elapsedMs = pick.elapsedMs ?? timeLimitMs;
    const isCorrect = pick.optionIndex === q.correctIndex;
    player.answeredCount += 1;
    player.totalResponseMs += elapsedMs;

    if (isCorrect) {
      let basePoints = 1;
      let speedBonus = 0;

      if (scoringMode === 'speed') {
        basePoints = 10;
        speedBonus = Math.max(
          0,
          Math.min(5, Math.round(((timeLimitMs - elapsedMs) / Math.max(1, timeLimitMs)) * 5))
        );
      }

      const totalPoints = roundPoints(basePoints + speedBonus);

      player.score = roundPoints(player.score + totalPoints);
      player.correctCount += 1;
      player.streak += 1;
      if (player.streak > player.bestStreak) {
        player.bestStreak = player.streak;
      }

      picks[player.id] = {
        playerId: player.id,
        playerName: player.name,
        optionIndex: pick.optionIndex,
        skipped: false,
        elapsedMs,
        isCorrect: true,
        basePoints,
        speedBonus,
        totalPoints,
        streakAfter: player.streak,
      };
    } else {
      player.streak = 0;
      player.wrongCount += 1;
      const penalty = scoringMode === 'exam' ? -0.25 : 0;
      player.score = roundPoints(player.score + penalty);

      picks[player.id] = {
        playerId: player.id,
        playerName: player.name,
        optionIndex: pick.optionIndex,
        skipped: false,
        elapsedMs,
        isCorrect: false,
        basePoints: penalty,
        speedBonus: 0,
        totalPoints: penalty,
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

  // Kick any away participant who has missed 3 questions while away
  const timedOutAwayIds = participants
    .filter((p) => !p.connected && p.questionsMissedWhileAway >= AWAY_MAX_MISSED_QUESTIONS)
    .map((p) => p.id);
  for (const awayId of timedOutAwayIds) {
    kickParticipant(room, awayId, 'away_timeout');
  }

  if (room.settings.autoAdvanceSec > 0 && room.phase === 'REVEAL') {
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
  player.wrongCount = 0;
  player.unattemptedCount = 0;
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
    clearPlayerAwayTimer(player);
    room.currentPicks.delete(player.id);
    player.connected = false;
    player.presenceStatus = 'offline';
    player.ws = null;

    if (room.phase === 'LOBBY') {
      room.players.splice(idx, 1);
      if (room.players.length === 0) {
        clearAllRoomTimers(room);
        rooms.delete(room.roomCode);
        return;
      }
      if (!room.players.some((p) => p.isHost)) {
        room.players[0].isHost = true;
        room.players[0].role = 'host';
      }
      broadcastSnapshot(room);
      return;
    }

    // Match in progress or finished: persist departed participant record with 'Left' status
    player.hasLeft = true;
    const remainingNonLeft = room.players.filter((p) => !p.hasLeft);
    if (remainingNonLeft.length === 0) {
      clearAllRoomTimers(room);
      rooms.delete(room.roomCode);
      return;
    }

    const remainingActive = getActivePlayers(room).filter((p) => !p.hasLeft);
    if (
      remainingActive.length === 0 &&
      (room.phase === 'QUESTION' || room.phase === 'REVEAL')
    ) {
      clearRoomTimers(room);
      room.phase = 'LOBBY';
      room.currentQuestionIndex = 0;
      room.currentPicks.clear();
      room.currentReview = null;
      room.history = [];
      room.players = room.players.filter((p) => !p.hasLeft);
      room.players.forEach(resetPlayerMatchStats);
      if (room.players.length > 0 && !room.players.some((p) => p.isHost)) {
        room.players[0].isHost = true;
        room.players[0].role = 'host';
      }
    } else if (room.phase === 'QUESTION' && maybeRevealIfAllConnectedLocked(room)) {
      return;
    }

    broadcastSnapshot(room);
  } else {
    player.connected = false;
    player.presenceStatus = 'offline';
    player.ws = null;
    player.disconnectedAt = Date.now();
    clearPlayerAwayTimer(player);

    if (player.role === 'participant' && !player.hasLeft) {
      player.awayKickTimer = setTimeout(() => {
        if (!player.connected) {
          kickParticipant(room, player.id, 'away_timeout');
        }
      }, AWAY_GRACE_MS);
    }

    if (room.phase === 'QUESTION' && maybeRevealIfAllConnectedLocked(room)) {
      return;
    }
    broadcastSnapshot(room);
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
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
          presenceStatus: 'active',
          hasLeft: false,
          score: 0,
          streak: 0,
          bestStreak: 0,
          correctCount: 0,
          wrongCount: 0,
          unattemptedCount: 0,
          totalResponseMs: 0,
          answeredCount: 0,
          readyForNext: false,
          ws,
          disconnectedAt: null,
          questionsMissedWhileAway: 0,
          awayKickTimer: null,
        };

        const room: ServerRoom = {
          roomCode,
          phase: 'LOBBY',
          players: [host],
          settings: {
            hostMode: 'moderator',
            scoringMode: 'exam',
            timeLimitSec: 45,
            speedBonusEnabled: false,
            autoAdvanceSec: 4,
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
          existing.hasLeft = false;
          existing.presenceStatus = 'active';
          existing.disconnectedAt = null;
          existing.questionsMissedWhileAway = 0;
          clearPlayerAwayTimer(existing);
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

        // Room capacity: 1 Host + 3 Active Participants (open for mid-quiz joining too)
        const activeParticipants = getParticipants(room).filter((p) => !p.hasLeft);
        if (activeParticipants.length >= 3) {
          const disconnectedParticipant = activeParticipants.find((p) => !p.connected);
          if (room.phase === 'LOBBY' && disconnectedParticipant) {
            const removeIdx = room.players.findIndex((p) => p.id === disconnectedParticipant.id);
            if (removeIdx !== -1) {
              room.players.splice(removeIdx, 1);
            }
          } else {
            sendError(
              ws,
              'This session already has 3 active participants seated (1 Host + 3 Participants).',
              'ROOM_FULL'
            );
            return;
          }
        }

        const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const missedPriorCount = room.phase === 'LOBBY' ? 0 : room.history.length;
        const guestName = sanitizeName(msg.playerName);
        const guest: ServerPlayer = {
          id: playerId,
          token: msg.playerToken || playerId,
          name: guestName,
          role: 'participant',
          isHost: false,
          connected: true,
          presenceStatus: 'active',
          hasLeft: false,
          score: 0,
          streak: 0,
          bestStreak: 0,
          correctCount: 0,
          wrongCount: 0,
          unattemptedCount: missedPriorCount,
          totalResponseMs: 0,
          answeredCount: 0,
          readyForNext: false,
          ws,
          disconnectedAt: null,
          questionsMissedWhileAway: 0,
          awayKickTimer: null,
        };

        // Backfill missed rounds in history as Unattempted for mid-quiz joiners
        if (room.phase !== 'LOBBY') {
          for (const rev of room.history) {
            rev.picks[guest.id] = {
              playerId: guest.id,
              playerName: guest.name,
              optionIndex: null,
              skipped: false,
              elapsedMs: null,
              isCorrect: false,
              basePoints: 0,
              speedBonus: 0,
              totalPoints: 0,
              streakAfter: 0,
            };
          }
        }

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

      if (msg.type === 'presence:update') {
        if (sender.hasLeft || !sender.connected) return;
        const nextStatus: PresenceStatus = msg.status === 'idle' ? 'idle' : 'active';
        if (sender.presenceStatus !== nextStatus) {
          sender.presenceStatus = nextStatus;
          broadcastPresence(room, sender.id, nextStatus);
        }
        return;
      }

      if (!sender.hasLeft && sender.connected && sender.presenceStatus !== 'active') {
        sender.presenceStatus = 'active';
        broadcastPresence(room, sender.id, 'active');
      }

      if (msg.type === 'room:kick') {
        if (!sender.isHost) {
          sendError(ws, 'Only the session Host can kick participants.');
          return;
        }
        kickParticipant(room, msg.playerId, 'host_kick');
        return;
      }

      if (msg.type === 'room:update_settings') {
        if (!sender.isHost || room.phase !== 'LOBBY') return;
        const s = msg.settings;
        if (s.hostMode === 'moderator' || s.hostMode === 'play_with' || s.hostMode === 'solo') {
          room.settings.hostMode = s.hostMode;
        }
        if (s.scoringMode === 'exam' || s.scoringMode === 'accuracy' || s.scoringMode === 'speed') {
          room.settings.scoringMode = s.scoringMode;
          room.settings.speedBonusEnabled = s.scoringMode === 'speed';
        }
        if (
          typeof s.timeLimitSec === 'number' &&
          [10, 15, 20, 30, 45, 60, 75, 90].includes(s.timeLimitSec)
        ) {
          room.settings.timeLimitSec = s.timeLimitSec;
        }
        if (typeof s.speedBonusEnabled === 'boolean' && !s.scoringMode) {
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
        const connectedParticipants = getParticipants(room).filter(
          (p) => p.connected && !p.hasLeft
        );
        if (room.settings.hostMode !== 'solo' && connectedParticipants.length < 1) {
          sendError(
            ws,
            'Wait for at least 1 participant to join, or switch Host Mode to Play Solo.'
          );
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
        if (!isActivePlayer(room, sender)) return;
        if (room.currentPicks.has(sender.id)) return;
        if (![0, 1, 2, 3].includes(msg.optionIndex)) return;

        const elapsedMs = Math.min(
          room.settings.timeLimitSec * 1000,
          Math.max(0, Date.now() - (room.questionStartedAt ?? Date.now()))
        );

        room.currentPicks.set(sender.id, {
          optionIndex: msg.optionIndex,
          skipped: false,
          elapsedMs,
        });

        // Confirm secretly to sender ONLY
        sendToPlayer(sender, {
          type: 'answer:locked_self',
          optionIndex: msg.optionIndex,
          skipped: false,
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

        // Instant simultaneous reveal the moment all connected participants lock in
        maybeRevealIfAllConnectedLocked(room);
        return;
      }

      if (msg.type === 'answer:skip') {
        if (room.phase !== 'QUESTION') return;
        if (!isActivePlayer(room, sender)) return;
        if (room.currentPicks.has(sender.id)) return;

        room.currentPicks.set(sender.id, {
          optionIndex: null,
          skipped: true,
          elapsedMs: null,
        });

        sendToPlayer(sender, {
          type: 'answer:locked_self',
          optionIndex: null,
          skipped: true,
        });

        for (const other of room.players) {
          if (other.id !== sender.id) {
            sendToPlayer(other, {
              type: 'answer:locked_opponent',
              playerId: sender.id,
              playerName: sender.name,
            });
          }
        }

        maybeRevealIfAllConnectedLocked(room);
        return;
      }

      if (msg.type === 'round:next') {
        if (room.phase !== 'REVEAL') return;
        if (sender.isHost) {
          advanceToNextRound(room);
          return;
        }

        sender.readyForNext = true;
        const activePlayers = getActivePlayers(room);
        const allActiveReady = activePlayers.every(
          (p) => p.readyForNext || !p.connected || p.hasLeft
        );
        if (allActiveReady) {
          advanceToNextRound(room);
        } else {
          broadcastSnapshot(room);
        }
        return;
      }

      if (msg.type === 'match:rematch') {
        if (room.phase !== 'MATCH_OVER') return;
        const hostConnected = room.players.some((p) => p.isHost && p.connected && !p.hasLeft);
        if (!sender.isHost && hostConnected) return;
        clearRoomTimers(room);
        room.phase = 'LOBBY';
        room.currentQuestionIndex = 0;
        room.currentPicks.clear();
        room.currentReview = null;
        room.history = [];
        room.players = room.players.filter((p) => !p.hasLeft);
        room.players.forEach(resetPlayerMatchStats);
        if (room.players.length > 0 && !room.players.some((p) => p.isHost)) {
          room.players[0].isHost = true;
          room.players[0].role = 'host';
        }
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
        clearAllRoomTimers(room);
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
