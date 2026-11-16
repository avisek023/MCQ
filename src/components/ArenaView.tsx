import React, { memo, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock, Eye, Lock, UserX, X } from 'lucide-react';
import { OPTION_LETTERS, OptionIndex, RoomSnapshot } from '../shared/types';
import { soundEngine } from '../utils/sound';
import { RoomChat } from './RoomChat';

interface ArenaViewProps {
  snapshot: RoomSnapshot;
  serverOffsetMs: number;
  onLockAnswer: (optionIndex: OptionIndex) => void;
  onNextRound: () => void;
  onKickPlayer: (playerId: string) => void;
  onSendChat: (text: string, kind?: 'message' | 'reaction') => void;
}

interface RoundTimerProps {
  active: boolean;
  questionStartedAt: number | null;
  serverOffsetMs: number;
  timeLimitSec: number;
  selfLocked: boolean;
  mode: 'clock' | 'bar';
}

const RoundTimer = memo<RoundTimerProps>(
  ({ active, questionStartedAt, serverOffsetMs, timeLimitSec, selfLocked, mode }) => {
    const timeLimitMs = timeLimitSec * 1000;
    const [displayTenths, setDisplayTenths] = useState(timeLimitSec * 10);
    const barRef = useRef<HTMLDivElement | null>(null);
    const lastWarningSecRef = useRef<number | null>(null);

    useEffect(() => {
      if (!active || !questionStartedAt) {
        lastWarningSecRef.current = null;
        return;
      }

      let rafId = 0;
      let lastTenths = -1;

      const loop = () => {
        const estimatedServerNow = Date.now() + serverOffsetMs;
        const elapsed = estimatedServerNow - questionStartedAt;
        const left = Math.max(0, timeLimitMs - elapsed);
        const pct = Math.max(0, Math.min(1, left / timeLimitMs));

        if (barRef.current) {
          barRef.current.style.transform = `scaleX(${pct})`;
        }

        const tenths = Math.ceil(left / 100);
        if (tenths !== lastTenths) {
          lastTenths = tenths;
          setDisplayTenths(tenths);
        }

        const secCeil = Math.ceil(left / 1000);
        if (
          mode === 'clock' &&
          secCeil >= 1 &&
          secCeil <= 3 &&
          !selfLocked &&
          lastWarningSecRef.current !== secCeil
        ) {
          lastWarningSecRef.current = secCeil;
          soundEngine.playTickWarning();
        }

        if (left > 0) {
          rafId = window.requestAnimationFrame(loop);
        }
      };

      rafId = window.requestAnimationFrame(loop);
      return () => window.cancelAnimationFrame(rafId);
    }, [active, questionStartedAt, serverOffsetMs, timeLimitMs, selfLocked, mode]);

    const urgent = displayTenths <= 35;

    if (mode === 'bar') {
      return (
        <div className="mb-4 sm:mb-6 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            ref={barRef}
            className={`h-full origin-left will-change-transform ${
              urgent ? 'bg-red-500' : 'bg-amber-500 dark:bg-amber-400'
            }`}
            style={{ transform: 'scaleX(1)' }}
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 font-mono-tabular text-base sm:text-lg font-bold text-slate-900 dark:text-white">
        <Clock
          className={`h-4 w-4 ${
            urgent ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
          }`}
        />
        <span className={urgent ? 'text-red-600 dark:text-red-300' : 'text-slate-900 dark:text-white'}>
          {(displayTenths / 10).toFixed(1)}s
        </span>
      </div>
    );
  }
);
RoundTimer.displayName = 'RoundTimer';

export const ArenaView: React.FC<ArenaViewProps> = ({
  snapshot,
  serverOffsetMs,
  onLockAnswer,
  onNextRound,
  onKickPlayer,
  onSendChat,
}) => {
  const self = snapshot.players.find((p) => p.id === snapshot.selfId);
  const hostMode = snapshot.settings.hostMode ?? 'moderator';
  const activePlayers = snapshot.players.filter((p) => {
    if (hostMode === 'solo') return p.isHost;
    if (hostMode === 'play_with') return true;
    return p.role === 'participant';
  });
  const isSelfPlaying = activePlayers.some((p) => p.id === snapshot.selfId);
  const isSpectator = !isSelfPlaying;
  const isHost = Boolean(self?.isHost);
  const connectedOthers = activePlayers.filter((p) => p.id !== snapshot.selfId && p.connected);
  const connectedOthersLockedCount = connectedOthers.filter((p) =>
    snapshot.lockedPlayerIds.includes(p.id)
  ).length;
  const totalConnectedOtherCount = connectedOthers.length;

  const [autoAdvanceLeftSec, setAutoAdvanceLeftSec] = useState(snapshot.settings.autoAdvanceSec);

  // Countdown for automatic rollover during REVEAL
  useEffect(() => {
    if (snapshot.phase !== 'REVEAL' || snapshot.settings.autoAdvanceSec <= 0) {
      setAutoAdvanceLeftSec(0);
      return;
    }
    setAutoAdvanceLeftSec(snapshot.settings.autoAdvanceSec);
    const interval = window.setInterval(() => {
      setAutoAdvanceLeftSec((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [snapshot.phase, snapshot.currentQuestionIndex, snapshot.settings.autoAdvanceSec]);

  // Keyboard shortcuts A/B/C/D or 1/2/3/4 during QUESTION (active players only)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSpectator) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (snapshot.phase === 'QUESTION' && snapshot.selfLockedOption === null) {
        const key = e.key.toUpperCase();
        const map: Record<string, OptionIndex> = {
          A: 0,
          '1': 0,
          B: 1,
          '2': 1,
          C: 2,
          '3': 2,
          D: 3,
          '4': 3,
        };
        if (key in map) {
          e.preventDefault();
          onLockAnswer(map[key]);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSpectator, snapshot.phase, snapshot.selfLockedOption, onLockAnswer]);

  const isReveal = snapshot.phase === 'REVEAL' && snapshot.currentReview !== null;
  const review = snapshot.currentReview;
  const promptText = isReveal
    ? review?.question ?? ''
    : snapshot.currentQuestion?.question ?? '';
  const options = isReveal
    ? review?.options ?? ['', '', '', '']
    : snapshot.currentQuestion?.options ?? ['', '', '', ''];
  const topic = isReveal ? review?.topic : snapshot.currentQuestion?.topic;

  const isLastQuestion = snapshot.currentQuestionIndex + 1 >= snapshot.totalQuestions;

  const handleOptionTap = (idx: OptionIndex) => {
    if (isSpectator || isReveal || snapshot.selfLockedOption !== null) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(16);
    }
    onLockAnswer(idx);
  };

  const scoreboardGridClass =
    activePlayers.length <= 1
      ? 'grid-cols-1'
      : activePlayers.length === 2
        ? 'grid-cols-2'
        : activePlayers.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-4';

  const revealGridClass =
    activePlayers.length <= 1
      ? 'sm:grid-cols-1'
      : activePlayers.length === 2
        ? 'sm:grid-cols-2'
        : activePlayers.length === 3
          ? 'sm:grid-cols-3'
          : 'sm:grid-cols-2';

  return (
    <main className="mx-auto max-w-4xl px-3.5 sm:px-6 py-4 sm:py-8">
      {isSpectator && (
        <div className="mb-3.5 sm:mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/50 dark:border-amber-400/35 bg-amber-50 dark:bg-amber-500/10 px-4 py-2.5 text-xs text-amber-950 dark:text-amber-100">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Eye className="h-4 w-4 text-amber-600 dark:text-amber-300 shrink-0" />
            {hostMode === 'solo'
              ? 'Spectator Mode · Host is playing individually'
              : 'Host Spectator Mode · Participants are playing automatically'}
          </span>
          <span className="text-amber-800 dark:text-amber-200/90">
            {snapshot.settings.autoAdvanceSec > 0
              ? `Auto-rollover every ${snapshot.settings.autoAdvanceSec}s after reveal`
              : 'Manual advance enabled'}
          </span>
        </div>
      )}

      {/* Compact Mobile-First Scoreboard & Timer Strip */}
      <section className="mb-3 sm:mb-5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] px-3.5 sm:px-5 py-3 sm:py-4 space-y-3">
        {/* Top Row: Round Counter + Countdown Clock */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2.5">
          <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
            Question{' '}
            <span className="font-mono-tabular text-slate-900 dark:text-white font-bold">
              {snapshot.currentQuestionIndex + 1}/{snapshot.totalQuestions}
            </span>
          </div>
          {isReveal ? (
            <span className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Simultaneous Reveal
            </span>
          ) : (
            <RoundTimer
              mode="clock"
              active={snapshot.phase === 'QUESTION'}
              questionStartedAt={snapshot.questionStartedAt}
              serverOffsetMs={serverOffsetMs}
              timeLimitSec={snapshot.settings.timeLimitSec}
              selfLocked={snapshot.selfLockedOption !== null}
            />
          )}
        </div>

        {/* Bottom Row: Active Player Score Cards (1-4) */}
        <div className={`grid gap-2 sm:gap-3 ${scoreboardGridClass}`}>
          {activePlayers.map((p, idx) => {
            const isMe = p.id === snapshot.selfId;
            const hasLocked = snapshot.lockedPlayerIds.includes(p.id);
            const missedCount = p.questionsMissedWhileAway ?? 0;
            return (
              <div
                key={p.id}
                className={`rounded-xl border px-2.5 sm:px-3.5 py-2 min-w-0 ${
                  isMe
                    ? 'border-sky-400 dark:border-sky-400/45 bg-sky-50 dark:bg-sky-500/10'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221]/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {p.name || `P${idx + 1}`}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isMe && (
                      <span className="text-[10px] sm:text-xs font-semibold text-sky-600 dark:text-sky-400">
                        You
                      </span>
                    )}
                    {!isMe && p.isHost && (
                      <span className="text-[10px] sm:text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Host
                      </span>
                    )}
                    {isHost && !p.isHost && (
                      <button
                        type="button"
                        onClick={() => onKickPlayer(p.id)}
                        aria-label={`Kick ${p.name}`}
                        title={`Kick ${p.name}`}
                        className="inline-flex h-6 items-center gap-1 rounded border border-red-300 dark:border-red-500/35 bg-red-50 dark:bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/25 cursor-pointer"
                      >
                        <UserX className="h-3 w-3" />
                        <span className="hidden sm:inline">Kick</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="font-mono-tabular text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-300">
                    {p.score} {p.score === 1 ? 'pt' : 'pts'}
                  </span>
                  {!p.connected ? (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                      Away{missedCount > 0 ? ` (${missedCount}/3)` : ''}
                    </span>
                  ) : !isReveal ? (
                    <span
                      className={`text-[10px] sm:text-[11px] font-medium shrink-0 ${
                        hasLocked
                          ? 'text-sky-600 dark:text-sky-300'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {hasLocked ? 'Locked' : '...'}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 60fps GPU-Composited Timer Bar */}
      {!isReveal && (
        <RoundTimer
          mode="bar"
          active={snapshot.phase === 'QUESTION'}
          questionStartedAt={snapshot.questionStartedAt}
          serverOffsetMs={serverOffsetMs}
          timeLimitSec={snapshot.settings.timeLimitSec}
          selfLocked={snapshot.selfLockedOption !== null}
        />
      )}

      {/* Question Card */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-4 sm:p-7 mb-3.5 sm:mb-5">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span>
            {topic ? `${topic} · ` : ''}Question {snapshot.currentQuestionIndex + 1} of{' '}
            {snapshot.totalQuestions}
          </span>
          {!isReveal && !isSpectator && snapshot.selfLockedOption === null && (
            <span className="hidden sm:inline text-slate-500 dark:text-slate-400">
              Press A–D or 1–4 to lock in
            </span>
          )}
        </div>
        <h2
          className="font-display text-lg sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug"
          style={{ textWrap: 'balance' }}
        >
          {promptText}
        </h2>
      </section>

      {/* Thumb-Zone 2x2 Option Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 mb-4 sm:mb-6">
        {options.map((optText, rawIdx) => {
          const idx = rawIdx as OptionIndex;
          const letter = OPTION_LETTERS[idx];

          const isSelfSelectedBeforeReveal =
            !isReveal && !isSpectator && snapshot.selfLockedOption === idx;

          const isCorrectOption = isReveal && review?.correctIndex === idx;
          const pickedBy = isReveal
            ? activePlayers.filter((p) => review?.picks[p.id]?.optionIndex === idx)
            : [];
          const isWrongPicked = isReveal && !isCorrectOption && pickedBy.length > 0;

          let cardStyle = isSpectator
            ? 'border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#131D33] text-slate-900 dark:text-slate-100'
            : 'border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#131D33] text-slate-900 dark:text-slate-100 hover:border-amber-500/70 dark:hover:border-amber-400/60 hover:bg-amber-50/50 dark:hover:bg-[#192642]';
          let keyStyle =
            'border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] text-slate-700 dark:text-slate-300';

          if (!isReveal && !isSpectator && snapshot.selfLockedOption !== null) {
            if (isSelfSelectedBeforeReveal) {
              cardStyle =
                'border-sky-500 dark:border-sky-400 bg-sky-50 dark:bg-sky-500/20 text-sky-950 dark:text-white';
              keyStyle =
                'border-sky-500 dark:border-sky-300 bg-sky-500 dark:bg-sky-400 text-white dark:text-slate-950';
            } else {
              cardStyle =
                'border-slate-200 dark:border-white/8 bg-slate-100 dark:bg-[#10182B] text-slate-500 dark:text-slate-400 opacity-70';
              keyStyle =
                'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] text-slate-400 dark:text-slate-500';
            }
          }

          if (isReveal) {
            if (isCorrectOption) {
              cardStyle =
                'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-950 dark:text-white';
              keyStyle =
                'border-emerald-500 dark:border-emerald-300 bg-emerald-500 dark:bg-emerald-400 text-white dark:text-slate-950';
            } else if (isWrongPicked) {
              cardStyle =
                'border-red-400 dark:border-red-400/80 bg-red-50 dark:bg-red-500/20 text-red-950 dark:text-red-50';
              keyStyle =
                'border-red-500 dark:border-red-300 bg-red-500 text-white';
            } else {
              cardStyle =
                'border-slate-200 dark:border-white/8 bg-slate-100 dark:bg-[#10182B] text-slate-500 dark:text-slate-400 opacity-65';
              keyStyle =
                'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] text-slate-400 dark:text-slate-500';
            }
          }

          const disabled = isSpectator || isReveal || snapshot.selfLockedOption !== null;

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => handleOptionTap(idx)}
              className={`group relative flex min-h-[64px] sm:min-h-[78px] w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 sm:p-4 text-left will-change-transform transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                disabled ? 'cursor-default' : 'cursor-pointer active:scale-[0.985]'
              } ${cardStyle}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`font-mono-tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition-colors ${keyStyle}`}
                >
                  {isReveal && isCorrectOption ? (
                    <Check className="h-4 w-4 stroke-[2.75]" />
                  ) : isReveal && isWrongPicked ? (
                    <X className="h-4 w-4 stroke-[2.75]" />
                  ) : (
                    letter
                  )}
                </span>
                <span className="text-sm sm:text-base font-medium leading-snug break-words">
                  {optText}
                </span>
              </div>

              {/* Explicit non-hue indicators for lock & reveal */}
              <div className="flex flex-col items-end gap-0.5 shrink-0 text-xs">
                {isSelfSelectedBeforeReveal && (
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300">
                    <Lock className="h-3.5 w-3.5" />
                    Locked
                  </span>
                )}

                {isReveal && isCorrectOption && (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Correct
                  </span>
                )}

                {isReveal && pickedBy.length > 0 && (
                  <span className="font-medium text-slate-700 dark:text-slate-200 text-right">
                    {pickedBy
                      .map((p) => (p.id === snapshot.selfId ? 'You' : p.name))
                      .join(' · ')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Lock-in Status Banner placed below options so tapping never shifts buttons */}
      {!isReveal &&
        !isSpectator &&
        (snapshot.selfLockedOption !== null || connectedOthersLockedCount > 0) && (
          <div className="mb-4 sm:mb-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {snapshot.selfLockedOption !== null && (
              <div
                className={`flex items-center gap-2 rounded-xl border border-sky-400/50 dark:border-sky-400/40 bg-sky-50 dark:bg-sky-500/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-sky-900 dark:text-sky-100 ${
                  connectedOthersLockedCount === 0 ? 'sm:col-span-2' : ''
                }`}
              >
                <Lock className="h-4 w-4 text-sky-600 dark:text-sky-300 shrink-0" />
                <span>
                  {totalConnectedOtherCount === 0
                    ? 'Locked In! Revealing answer...'
                    : `Locked In! Waiting for Opponents (${connectedOthersLockedCount}/${totalConnectedOtherCount})...`}
                </span>
              </div>
            )}
            {connectedOthersLockedCount > 0 && (
              <div
                className={`flex items-center gap-2 rounded-xl border border-amber-400/60 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-500/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-100 ${
                  snapshot.selfLockedOption === null ? 'sm:col-span-2' : ''
                }`}
              >
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-300 shrink-0" />
                <span>
                  {connectedOthersLockedCount === 1
                    ? '1 player has locked in!'
                    : `${connectedOthersLockedCount} of ${totalConnectedOtherCount} opponents locked in!`}
                </span>
              </div>
            )}
          </div>
        )}

      {/* Simultaneous Reveal Breakdown & Auto-Rollover Status */}
      {isReveal && review && (
        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-4 sm:p-6 space-y-4">
          <div className={`grid grid-cols-1 gap-2.5 sm:gap-3 ${revealGridClass}`}>
            {activePlayers.map((player) => {
              const p = review.picks[player.id];
              if (!p) return null;
              const isMe = player.id === snapshot.selfId;
              const pickedLetter =
                p.optionIndex !== null ? OPTION_LETTERS[p.optionIndex] : 'No Pick';
              const sec =
                p.elapsedMs !== null ? `${(p.elapsedMs / 1000).toFixed(1)}s` : 'Timed Out';

              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {isMe ? `${player.name} (You)` : player.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Chose:{' '}
                        <strong
                          className={
                            p.isCorrect
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {pickedLetter}
                        </strong>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{sec}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div
                      className={`font-mono-tabular text-sm font-bold ${
                        p.totalPoints > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {p.totalPoints > 0 ? `+${p.totalPoints} pt` : '0 pts'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {p.isCorrect ? 'Correct' : p.optionIndex === null ? 'Timed Out' : 'Wrong'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {review.explanation && (
            <div className="border-t border-slate-200 dark:border-white/10 pt-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <span className="font-semibold text-slate-900 dark:text-white">Explanation: </span>
              {review.explanation}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-slate-200 dark:border-white/10 pt-3.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {snapshot.settings.autoAdvanceSec > 0
                ? isLastQuestion
                  ? `Showing final podium automatically in ${autoAdvanceLeftSec}s...`
                  : `Rolling to next question automatically in ${autoAdvanceLeftSec}s...`
                : isHost
                  ? 'Discuss the answers, then advance when ready.'
                  : self?.readyForNext
                    ? 'Marked ready — waiting for other players or host...'
                    : 'Tap Ready when you want to continue.'}
            </span>

            <button
              type="button"
              onClick={onNextRound}
              disabled={!isHost && Boolean(self?.readyForNext)}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>
                {isHost
                  ? isLastQuestion
                    ? 'Reveal Final Podium Now'
                    : 'Skip to Next Question'
                  : self?.readyForNext
                    ? 'Ready for Next'
                    : isLastQuestion
                      ? 'Ready for Podium'
                      : 'Ready for Next'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      <div className="mt-4 sm:mt-6">
        <RoomChat
          messages={snapshot.messages}
          selfId={snapshot.selfId}
          onSendChat={onSendChat}
          variant="compact"
          title="Match Reactions & Chat"
        />
      </div>
    </main>
  );
};
