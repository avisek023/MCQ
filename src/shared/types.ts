export type OptionIndex = 0 | 1 | 2 | 3;

export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface Question {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: OptionIndex;
  explanation?: string;
  topic?: string;
}

export interface ClientQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  topic?: string;
}

export type MatchPhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'MATCH_OVER';

export type PlayerRole = 'host' | 'participant';

export type HostMode = 'moderator' | 'play_with' | 'solo';

export interface RoomSettings {
  hostMode: HostMode;
  timeLimitSec: number;
  speedBonusEnabled: boolean;
  autoAdvanceSec: number; // 0 = manual advance
  allowGuestUpload: boolean;
  shuffleQuestions: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  role: PlayerRole;
  isHost: boolean;
  connected: boolean;
  score: number;
  streak: number;
  bestStreak: number;
  correctCount: number;
  totalResponseMs: number;
  answeredCount: number;
  readyForNext: boolean;
  questionsMissedWhileAway?: number;
}

export interface RoundPickResult {
  playerId: string;
  playerName: string;
  optionIndex: OptionIndex | null;
  elapsedMs: number | null;
  isCorrect: boolean;
  basePoints: number;
  speedBonus: number;
  totalPoints: number;
  streakAfter: number;
}

export interface RoundReview {
  questionIndex: number;
  questionId: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: OptionIndex;
  explanation?: string;
  topic?: string;
  picks: Record<string, RoundPickResult>;
}

export interface DeckSummary {
  title: string;
  count: number;
  topics: string[];
  updatedBy: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  kind: 'message' | 'reaction';
  createdAt: number;
}

export interface RoomSnapshot {
  roomCode: string;
  phase: MatchPhase;
  selfId: string;
  players: PlayerInfo[];
  settings: RoomSettings;
  deckSummary: DeckSummary;
  /** Only provided to players who have edit permission while in LOBBY so answers are never leaked prematurely */
  editableQuestions: Question[] | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: ClientQuestion | null;
  questionStartedAt: number | null;
  serverNow: number;
  selfLockedOption: OptionIndex | null;
  opponentLocked: boolean;
  lockedPlayerIds: string[];
  currentReview: RoundReview | null;
  history: RoundReview[];
  messages: ChatMessage[];
}

export type ClientMessage =
  | { type: 'room:create'; playerName: string; playerToken: string }
  | { type: 'room:join'; roomCode: string; playerName: string; playerToken: string }
  | { type: 'room:reconnect'; roomCode: string; playerToken: string }
  | { type: 'room:leave' }
  | { type: 'room:kick'; playerId: string }
  | { type: 'room:update_settings'; settings: Partial<RoomSettings> }
  | { type: 'deck:update'; title: string; questions: Question[] }
  | { type: 'match:start' }
  | { type: 'answer:lock'; optionIndex: OptionIndex }
  | { type: 'round:next' }
  | { type: 'match:rematch' }
  | { type: 'chat:send'; text: string; kind?: 'message' | 'reaction' };

export type ServerMessage =
  | { type: 'room:joined'; snapshot: RoomSnapshot }
  | { type: 'room:state'; snapshot: RoomSnapshot }
  | { type: 'room:error'; message: string; code?: string }
  | { type: 'answer:locked_self'; optionIndex: OptionIndex }
  | { type: 'answer:locked_opponent'; playerId: string; playerName: string }
  | {
      type: 'round:started';
      questionIndex: number;
      totalQuestions: number;
      question: ClientQuestion;
      questionStartedAt: number;
      serverNow: number;
      timeLimitSec: number;
    }
  | {
      type: 'round:revealed';
      review: RoundReview;
      players: PlayerInfo[];
      isLastQuestion: boolean;
    }
  | {
      type: 'match:finished';
      players: PlayerInfo[];
      history: RoundReview[];
    }
  | {
      type: 'chat:message';
      message: ChatMessage;
    };
