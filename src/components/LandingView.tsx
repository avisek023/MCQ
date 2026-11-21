import React, { useState } from 'react';
import { ArrowRight, Check, Lock, Sparkles, Trophy, Upload, Users, Zap } from 'lucide-react';

interface LandingViewProps {
  initialRoomCode: string;
  connected: boolean;
  error: string | null;
  onCreateRoom: (playerName: string) => void;
  onJoinRoom: (roomCode: string, playerName: string) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
}

export const LandingView: React.FC<LandingViewProps> = ({
  initialRoomCode,
  connected,
  error,
  onCreateRoom,
  onJoinRoom,
  nameInputRef,
}) => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [mode, setMode] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = playerName.trim();
    if (!cleanName) {
      setLocalError('Enter your display name so your friend knows who they are playing.');
      nameInputRef.current?.focus();
      return;
    }
    setLocalError(null);

    if (mode === 'create') {
      onCreateRoom(cleanName);
    } else {
      const cleanCode = roomCode.trim().toUpperCase();
      if (cleanCode.length < 4) {
        setLocalError('Enter a valid 6-character room code from your friend.');
        return;
      }
      onJoinRoom(cleanCode, cleanName);
    }
  };

  const activeError = localError || error;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-12 lg:py-16">
      {/* Hero Split */}
      <section className="grid grid-cols-1 gap-8 lg:gap-12 lg:grid-cols-12 lg:items-stretch">
        {/* Left Column: Pitch + Room Entry Form */}
        <div className="lg:col-span-7 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold tracking-wide text-amber-600 dark:text-amber-400 mb-2 sm:mb-3">
              Host Solo, Play With Group, or Moderate · Real-Time MCQ Arena
            </p>
            <h1
              className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12] mb-3 sm:mb-5"
              style={{ textWrap: 'balance' }}
            >
              Host a private MCQ battle with secret lock-in and automatic rollover
            </h1>
            <p className="text-sm sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mb-6 sm:mb-8">
              Host creates the room, uploads questions, and chooses Exam (+1 / −0.25), Accuracy
              (+1), or Speed (10 + time bonus) scoring. Play solo, with up to 3 participants, or
              moderate hands-free with 45s timers.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-5 sm:p-7 shadow-sm dark:shadow-none"
          >
            {/* Segmented Mode Control */}
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 dark:bg-[#0B1221] p-1 mb-6 border border-slate-200 dark:border-white/5">
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setLocalError(null);
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'create'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Create Private Room
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('join');
                  setLocalError(null);
                }}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  mode === 'join'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Join with Code
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div className={mode === 'create' ? 'sm:col-span-2' : ''}>
                <label
                  htmlFor="player-name"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                >
                  Your Display Name
                </label>
                <input
                  ref={nameInputRef}
                  id="player-name"
                  type="text"
                  maxLength={24}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-4 py-3 text-base text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              {mode === 'join' && (
                <div>
                  <label
                    htmlFor="room-code"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                  >
                    Room Code
                  </label>
                  <input
                    id="room-code"
                    type="text"
                    maxLength={8}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="e.g. K7M2P9"
                    className="font-mono-tabular w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-4 py-3 text-base uppercase tracking-wider text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                  />
                </div>
              )}
            </div>

            {activeError && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-2.5 text-sm text-red-700 dark:text-red-200"
              >
                {activeError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <button
                type="submit"
                disabled={!connected}
                className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>
                  {!connected
                    ? 'Connecting to Arena...'
                    : mode === 'create'
                      ? 'Host Private Room'
                      : 'Join as Participant'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Host can watch, play with group, or play solo · Auto-rollover enabled
              </span>
            </div>
          </form>
        </div>

        {/* Right Column: Interactive Duel Preview Card */}
        <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6 sm:p-7 shadow-sm dark:shadow-none">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-5">
              <span>Live Round Preview</span>
              <span className="font-mono-tabular">Round 3 / 10 · 14.2s left</span>
            </div>

            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-5 leading-snug">
              Which protocol guarantees ordered, reliable delivery over IP networks?
            </h2>

            <div className="grid grid-cols-1 gap-2.5 mb-6">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                <span>A. UDP</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-950 dark:text-emerald-100">
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  B. TCP
                </span>
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                  You · Priya · Sam
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                <span>C. ICMP</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                <span>D. ARP</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-4 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              Hidden until all active players lock in
            </span>
            <span className="font-mono-tabular text-amber-600 dark:text-amber-400 font-semibold">
              Exam · Accuracy · Speed
            </span>
          </div>
        </div>
      </section>

      {/* How It Works & Rules */}
      <section id="how-it-works" className="mt-16 border-t border-slate-200 dark:border-white/10 pt-12">
        <div className="mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
            How every match unfolds
          </h2>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Server-authoritative timing ensures neither player can peek or gain an unfair lag advantage.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
            <Lock className="h-5 w-5 text-sky-600 dark:text-sky-400 mb-4" />
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
              01. Secret Lock-In
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Tap A, B, C, or D to seal your pick on the server. You see “Locked!” while other
              players only see that you locked in—never what you chose.
            </p>
          </div>

          <div id="scoring-rules" className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
            <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400 mb-4" />
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
              02. Instant Simultaneous Reveal
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              The instant all active players lock in, skip, or time expires, green checkmarks and
              picks reveal together—scoring by Exam (+1 / −0.25 / 0 skip), Accuracy (+1), or
              Speed (10 + speed bonus).
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
            <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mb-4" />
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
              03. Winner Podium & Review
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Celebrate 1st, 2nd, and 3rd place on the final podium with fanfare, then inspect a
              full question-by-question comparison of everyone’s picks.
            </p>
          </div>
        </div>
      </section>

      {/* Supported Question Upload Formats */}
      <section
        id="upload-formats"
        className="mt-12 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6 sm:p-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 mb-2">
              <Upload className="h-4 w-4" />
              <span>Ready when your questions are</span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Upload your own MCQs later in seconds
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Every private room starts with a built-in 6-question warmup deck so you can test the
              flow right away. Inside any room lobby, you can paste or upload JSON, CSV, or plain
              A/B/C/D text blocks, or add questions one by one.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-300 shrink-0">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              Play solo or invite up to 3 participants
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              JSON, CSV, and Aiken text auto-parser
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
