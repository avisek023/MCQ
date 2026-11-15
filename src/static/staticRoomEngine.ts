import { STARTER_DECK_TITLE, STARTER_QUESTIONS } from '../shared/starterQuestions';
import type {
  ChatMessage,
  ClientMessage,
  ClientQuestion,
  MatchPhase,
  OptionIndex,
  PlayerInfo,
  PlayerRole,
  Question,
  RoomSettings,
  RoomSnapshot,
  RoundPickResult,
  RoundReview,
  ServerMessage,
} from '../shared/types';

interface StaticPlayer extends PlayerInfo {
  token: string;
}

interface PendingPick {
  optionIndex: OptionIndex;
  elapsedMs: number;
}

export type EmitToTarget = (targetToken: string | 'broadcast', message: ServerMessage) => void;

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

function toPublicPlayer(p: StaticPlayer): PlayerInfo {
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

function resetPlayerMatchStats(player: StaticPlayer): void {
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
      explanation:
        typeof obj.explanation === 'string' && obj.explanation.trim()
          ? obj.explanation.trim()
          : undefined,
      topic: typeof obj.topic === 'string' && obj.topic.trim() ? obj.topic.trim() : undefined,
    });
  }
  return validated;
}

export class StaticRoomEngine {
  readonly roomCode: string;
  private phase: MatchPhase = 'LOBBY';
  private players: StaticPlayer[] = [];
  private settings: RoomSettings = {
    timeLimitSec: 30,
    speedBonusEnabled: true,
    autoAdvanceSec: 6,
    allowGuestUpload: false,
    shuffleQuestions: true,
  };
  private deckTitle: string;
  private deckUpdatedBy: string;
  private questions: Question[] = [...STARTER_QUESTIONS];
  private activeQuestions: Question[] = [...STARTER_QUESTIONS];
  private currentQuestionIndex = 0;
  private questionStartedAt: number | null = null;
  private currentPicks = new Map<string, PendingPick>();
  private currentReview: RoundReview | null = null;
  private history: RoundReview[] = [];
  private messages: ChatMessage[] = [];
  private roundTimer: number | null = null;
  private autoAdvanceTimer: number | null = null;
  private emit: EmitToTarget;

  constructor(roomCode: string, hostName: string, hostToken: string, emit: EmitToTarget) {
    this.roomCode = roomCode;
    this.emit = emit;

    const hostId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const host: StaticPlayer = {
      id: hostId,
      token: hostToken || hostId,
      name: sanitizeName(hostName),
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
    };

    this.players.push(host);
    this.deckTitle = STARTER_DECK_TITLE;
    this.deckUpdatedBy = host.name;

    this.emit(host.token, {
      type: 'room:joined',
      snapshot: this.buildSnapshot(host),
    });
  }

  destroy(): void {
    this.clearTimers();
  }

  private getParticipants(): StaticPlayer[] {
    return this.players.filter((p) => p.role === 'participant');
  }

  private clearTimers(): void {
    if (this.roundTimer !== null) {
      window.clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    if (this.autoAdvanceTimer !== null) {
      window.clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  private buildSnapshot(selfPlayer: StaticPlayer): RoomSnapshot {
    const selfPick = this.currentPicks.get(selfPlayer.id);
    const participants = this.getParticipants();
    const otherParticipant = participants.find((p) => p.id !== selfPlayer.id);
    const opponentLocked =
      selfPlayer.role === 'participant'
        ? Boolean(otherParticipant && this.currentPicks.has(otherParticipant.id))
        : this.currentPicks.size > 0;

    const canEditDeck =
      this.phase === 'LOBBY' && (selfPlayer.isHost || this.settings.allowGuestUpload);

    const topics = Array.from(
      new Set(
        this.questions
          .map((q) => q.topic?.trim())
          .filter((t): t is string => Boolean(t))
      )
    ).slice(0, 6);

    const deckForMatch = this.phase === 'LOBBY' ? this.questions : this.activeQuestions;
    const currentQ =
      this.phase === 'QUESTION' && deckForMatch[this.currentQuestionIndex]
        ? toClientQuestion(deckForMatch[this.currentQuestionIndex])
        : null;

    return {
      roomCode: this.roomCode,
      phase: this.phase,
      selfId: selfPlayer.id,
      players: this.players.map(toPublicPlayer),
      settings: { ...this.settings },
      deckSummary: {
        title: this.deckTitle,
        count: this.questions.length,
        topics,
        updatedBy: this.deckUpdatedBy,
      },
      editableQuestions: canEditDeck ? this.questions : null,
      currentQuestionIndex: this.currentQuestionIndex,
      totalQuestions: deckForMatch.length,
      currentQuestion: currentQ,
      questionStartedAt: this.questionStartedAt,
      serverNow: Date.now(),
      selfLockedOption: selfPick ? selfPick.optionIndex : null,
      opponentLocked,
      lockedPlayerIds: Array.from(this.currentPicks.keys()),
      currentReview: this.currentReview,
      history: this.history,
      messages: this.messages,
    };
  }

  private broadcastSnapshots(): void {
    for (const player of this.players) {
      this.emit(player.token, {
        type: 'room:state',
        snapshot: this.buildSnapshot(player),
      });
    }
  }

  private sendError(targetToken: string, message: string, code?: string): void {
    this.emit(targetToken, { type: 'room:error', message, code });
  }

  private startQuestionRound(): void {
    this.clearTimers();

    if (this.currentQuestionIndex >= this.activeQuestions.length) {
      this.phase = 'MATCH_OVER';
      this.emit('broadcast', {
        type: 'match:finished',
        players: this.players.map(toPublicPlayer),
        history: this.history,
      });
      return;
    }

    this.phase = 'QUESTION';
    this.currentPicks.clear();
    this.currentReview = null;
    this.questionStartedAt = Date.now();
    for (const player of this.players) {
      player.readyForNext = false;
    }

    const question = this.activeQuestions[this.currentQuestionIndex];
    const clientQuestion = toClientQuestion(question);
    const serverNow = Date.now();

    this.emit('broadcast', {
      type: 'round:started',
      questionIndex: this.currentQuestionIndex,
      totalQuestions: this.activeQuestions.length,
      question: clientQuestion,
      questionStartedAt: this.questionStartedAt,
      serverNow,
      timeLimitSec: this.settings.timeLimitSec,
    });

    this.roundTimer = window.setTimeout(() => {
      this.revealCurrentRound();
    }, this.settings.timeLimitSec * 1000);
  }

  private revealCurrentRound(): void {
    if (this.phase !== 'QUESTION') return;
    this.clearTimers();

    const q = this.activeQuestions[this.currentQuestionIndex];
    if (!q) return;

    const timeLimitMs = this.settings.timeLimitSec * 1000;
    const picks: Record<string, RoundPickResult> = {};
    const participants = this.getParticipants();

    for (const player of participants) {
      const pick = this.currentPicks.get(player.id);
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
        const speedBonus = this.settings.speedBonusEnabled ? Math.round(5 * ratio) : 0;
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
      questionIndex: this.currentQuestionIndex,
      questionId: q.id,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      topic: q.topic,
      picks,
    };

    this.phase = 'REVEAL';
    this.currentReview = review;
    this.history.push(review);

    const isLastQuestion = this.currentQuestionIndex + 1 >= this.activeQuestions.length;
    this.emit('broadcast', {
      type: 'round:revealed',
      review,
      players: this.players.map(toPublicPlayer),
      isLastQuestion,
    });

    if (this.settings.autoAdvanceSec > 0) {
      this.autoAdvanceTimer = window.setTimeout(() => {
        this.advanceToNextRound();
      }, this.settings.autoAdvanceSec * 1000);
    }
  }

  private advanceToNextRound(): void {
    if (this.phase !== 'REVEAL') return;
    this.clearTimers();
    this.currentQuestionIndex += 1;
    this.startQuestionRound();
  }

  handleClientMessage(senderToken: string, msg: ClientMessage): void {
    if (msg.type === 'room:join' || msg.type === 'room:reconnect') {
      const code = msg.roomCode.trim().toUpperCase();
      if (code !== this.roomCode) return;

      const existing = this.players.find((p) => p.token === senderToken);
      if (existing) {
        existing.connected = true;
        if (msg.type === 'room:join' && msg.playerName.trim()) {
          existing.name = sanitizeName(msg.playerName);
        }
        this.emit(existing.token, {
          type: 'room:joined',
          snapshot: this.buildSnapshot(existing),
        });
        this.broadcastSnapshots();
        return;
      }

      if (msg.type === 'room:reconnect') {
        this.sendError(
          senderToken,
          'Session expired. Please enter your name to join the room.',
          'SESSION_EXPIRED'
        );
        return;
      }

      const participants = this.getParticipants();
      if (participants.length >= 2) {
        const disconnectedParticipant = participants.find((p) => !p.connected);
        if (this.phase === 'LOBBY' && disconnectedParticipant) {
          const removeIdx = this.players.findIndex((p) => p.id === disconnectedParticipant.id);
          if (removeIdx !== -1) {
            this.players.splice(removeIdx, 1);
          }
        } else {
          this.sendError(
            senderToken,
            'This session already has 2 participants seated (1 Host + 2 Participants).',
            'ROOM_FULL'
          );
          return;
        }
      }

      const playerId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const guest: StaticPlayer = {
        id: playerId,
        token: senderToken || playerId,
        name: sanitizeName(msg.playerName),
        role: 'participant' as PlayerRole,
        isHost: false,
        connected: true,
        score: 0,
        streak: 0,
        bestStreak: 0,
        correctCount: 0,
        totalResponseMs: 0,
        answeredCount: 0,
        readyForNext: false,
      };

      this.players.push(guest);
      this.emit(guest.token, {
        type: 'room:joined',
        snapshot: this.buildSnapshot(guest),
      });
      this.broadcastSnapshots();
      return;
    }

    const sender = this.players.find((p) => p.token === senderToken);
    if (!sender) {
      this.sendError(senderToken, 'Not connected to a room.');
      return;
    }

    if (msg.type === 'room:leave') {
      const idx = this.players.findIndex((p) => p.id === sender.id);
      if (idx === -1) return;
      this.players.splice(idx, 1);
      if (
        sender.role === 'participant' &&
        (this.phase === 'QUESTION' || this.phase === 'REVEAL')
      ) {
        this.clearTimers();
        this.phase = 'LOBBY';
        this.currentQuestionIndex = 0;
        this.currentPicks.clear();
        this.currentReview = null;
        this.history = [];
        this.players.forEach(resetPlayerMatchStats);
      }
      this.broadcastSnapshots();
      return;
    }

    if (msg.type === 'room:update_settings') {
      if (!sender.isHost || this.phase !== 'LOBBY') return;
      const s = msg.settings;
      if (typeof s.timeLimitSec === 'number' && [10, 15, 20, 30, 45, 60].includes(s.timeLimitSec)) {
        this.settings.timeLimitSec = s.timeLimitSec;
      }
      if (typeof s.speedBonusEnabled === 'boolean') {
        this.settings.speedBonusEnabled = s.speedBonusEnabled;
      }
      if (typeof s.autoAdvanceSec === 'number' && [0, 4, 6, 8, 12].includes(s.autoAdvanceSec)) {
        this.settings.autoAdvanceSec = s.autoAdvanceSec;
      }
      if (typeof s.allowGuestUpload === 'boolean') {
        this.settings.allowGuestUpload = s.allowGuestUpload;
      }
      if (typeof s.shuffleQuestions === 'boolean') {
        this.settings.shuffleQuestions = s.shuffleQuestions;
      }
      this.broadcastSnapshots();
      return;
    }

    if (msg.type === 'deck:update') {
      if (this.phase !== 'LOBBY') {
        this.sendError(senderToken, 'Questions can only be updated while in the lobby.');
        return;
      }
      if (!sender.isHost && !this.settings.allowGuestUpload) {
        this.sendError(senderToken, 'Only the room host can modify questions.');
        return;
      }
      const validated = validateDeckQuestions(msg.questions);
      if (!validated) {
        this.sendError(
          senderToken,
          'Invalid question deck. Ensure 1–100 questions, each with 4 options and an answer.'
        );
        return;
      }
      this.questions = validated;
      this.deckTitle = msg.title.trim().slice(0, 60) || 'Custom MCQ Deck';
      this.deckUpdatedBy = sender.name;
      this.broadcastSnapshots();
      return;
    }

    if (msg.type === 'match:start') {
      if (!sender.isHost || this.phase !== 'LOBBY') return;
      const connectedParticipants = this.getParticipants().filter((p) => p.connected);
      if (connectedParticipants.length < 2) {
        this.sendError(senderToken, 'Wait for both participants (2/2) to join before starting the session.');
        return;
      }
      if (this.questions.length === 0) {
        this.sendError(senderToken, 'Upload at least 1 question before starting.');
        return;
      }

      this.players.forEach(resetPlayerMatchStats);
      this.activeQuestions = this.settings.shuffleQuestions
        ? shuffleQuestionsList(this.questions)
        : [...this.questions];
      this.currentQuestionIndex = 0;
      this.history = [];
      this.currentReview = null;
      this.startQuestionRound();
      return;
    }

    if (msg.type === 'answer:lock') {
      if (this.phase !== 'QUESTION') return;
      if (sender.role !== 'participant') return;
      if (this.currentPicks.has(sender.id)) return;
      if (![0, 1, 2, 3].includes(msg.optionIndex)) return;

      const elapsedMs = Math.min(
        this.settings.timeLimitSec * 1000,
        Math.max(0, Date.now() - (this.questionStartedAt ?? Date.now()))
      );

      this.currentPicks.set(sender.id, {
        optionIndex: msg.optionIndex,
        elapsedMs,
      });

      this.emit(sender.token, {
        type: 'answer:locked_self',
        optionIndex: msg.optionIndex,
      });

      for (const other of this.players) {
        if (other.id !== sender.id) {
          this.emit(other.token, {
            type: 'answer:locked_opponent',
            playerId: sender.id,
            playerName: sender.name,
          });
        }
      }

      const participants = this.getParticipants();
      if (this.currentPicks.size >= participants.length) {
        this.revealCurrentRound();
      }
      return;
    }

    if (msg.type === 'round:next') {
      if (this.phase !== 'REVEAL') return;
      if (sender.isHost) {
        this.advanceToNextRound();
        return;
      }
      sender.readyForNext = true;
      const participants = this.getParticipants();
      const allReady = participants.every((p) => p.readyForNext || !p.connected);
      if (allReady) {
        this.advanceToNextRound();
      } else {
        this.broadcastSnapshots();
      }
      return;
    }

    if (msg.type === 'match:rematch') {
      if (this.phase !== 'MATCH_OVER') return;
      const hostConnected = this.players.some((p) => p.isHost && p.connected);
      if (!sender.isHost && hostConnected) return;
      this.clearTimers();
      this.phase = 'LOBBY';
      this.currentQuestionIndex = 0;
      this.currentPicks.clear();
      this.currentReview = null;
      this.history = [];
      this.players.forEach(resetPlayerMatchStats);
      this.broadcastSnapshots();
      return;
    }

    if (msg.type === 'chat:send') {
      const cleanText =
        typeof msg.text === 'string' ? msg.text.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
      if (!cleanText) return;

      const chatMsg: ChatMessage = {
        id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        senderId: sender.id,
        senderName: sender.name,
        text: cleanText,
        kind: msg.kind === 'reaction' ? 'reaction' : 'message',
        createdAt: Date.now(),
      };

      this.messages.push(chatMsg);
      if (this.messages.length > 100) {
        this.messages = this.messages.slice(-100);
      }

      this.emit('broadcast', { type: 'chat:message', message: chatMsg });
    }
  }
}
