import React, { memo, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clock, Eye, Flame, Lock, X } from 'lucide-react';
import { OPTION_LETTERS, OptionIndex, RoomSnapshot } from '../shared/types';
import { soundEngine } from '../utils/sound';
import { RoomChat } from './RoomChat';

interface ArenaViewProps {
  snapshot: RoomSnapshot;
  serverOffsetMs: number;
  onLockAnswer: (optionIndex: OptionIndex) => void;
  onNextRound: () => void;
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
        <div className="mb-4 sm:mb-6 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            ref={barRef}
            className={`h-full origin-left will-change-transform ${
              urgent ? 'bg-red-500' : 'bg-amber-400'
            }`}
            style={{ transform: 'scaleX(1)' }}
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 font-mono-tabular text-base sm:text-lg font-bold text-white">
        <Clock className={`h-4 w-4 ${urgent ? 'text-red-400' : 'text-amber-400'}`} />
        <span className={urgent ? 'text-red-300' : 'text-white'}>
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
  onSendChat,
}) => {
  const self = snapshot.players.find((p) => p.id === snapshot.selfId);
  const participants = snapshot.players.filter((p) => p.role === 'participant');
  const isHostObserver = self?.role === 'host';
  const leftPlayer = isHostObserver ? participants[0] : self;
  const rightPlayer = isHostObserver
    ? participants[1]
    : participants.find((p) => p.id !== snapshot.selfId);
  const isHost = Boolean(self?.isHost);

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

  // Keyboard shortcuts A/B/C/D or 1/2/3/4 during QUESTION (participants only)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isHostObserver) return;
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
  }, [isHostObserver, snapshot.phase, snapshot.selfLockedOption, onLockAnswer]);

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

  const leftPickReview = isReveal && leftPlayer ? review?.picks[leftPlayer.id] : undefined;
  const rightPickReview = isReveal && rightPlayer ? review?.picks[rightPlayer.id] : undefined;
  const leftLocked = leftPlayer ? snapshot.lockedPlayerIds.includes(leftPlayer.id) : false;
  const rightLocked = rightPlayer ? snapshot.lockedPlayerIds.includes(rightPlayer.id) : false;

  const handleOptionTap = (idx: OptionIndex) => {
    if (isHostObserver || isReveal || snapshot.selfLockedOption !== null) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(16);
    }
    onLockAnswer(idx);
  };

  return (
    <main className="mx-auto max-w-4xl px-3.5 sm:px-6 py-4 sm:py-8">
      {isHostObserver && (
        <div className="mb-3.5 sm:mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-100">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Eye className="h-4 w-4 text-amber-300 shrink-0" />
            Host Spectator Mode · Participants are playing automatically
          </span>
          <span className="text-amber-200/90">
            {snapshot.settings.autoAdvanceSec > 0
              ? `Auto-rollover every ${snapshot.settings.autoAdvanceSec}s after reveal`
              : 'Manual advance enabled'}
          </span>
        </div>
      )}

      {/* Compact Mobile-First Scoreboard Strip (2-col top + center clock) */}
      <section className="mb-3 sm:mb-5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-4 items-center rounded-2xl border border-white/10 bg-[#131D33] px-3.5 sm:px-5 py-3 sm:py-4">
        {/* Participant 1 (Left) */}
        <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm font-bold text-white truncate">
                {leftPlayer?.name ?? 'Participant 1'}
              </span>
              {!isHostObserver && <span className="text-[11px] text-sky-400 shrink-0">You</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-300">
              <span className="font-mono-tabular font-semibold text-white text-xs sm:text-sm">
                {leftPlayer?.score ?? 0} pts
              </span>
              {(leftPlayer?.streak ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5 text-amber-400 font-medium">
                  <Flame className="h-3 w-3" />
                  <span className="font-mono-tabular">{leftPlayer?.streak}</span>
                </span>
              )}
            </div>
          </div>
          {!isReveal && isHostObserver && (
            <span
              className={`text-[11px] font-medium shrink-0 ${
                leftLocked ? 'text-sky-300' : 'text-slate-400'
              }`}
            >
              {leftLocked ? 'Locked' : '...'}
            </span>
          )}
        </div>

        {/* Center Round & Clock (spanned slim bar on mobile, middle col on desktop) */}
        <div className="col-span-2 sm:col-span-1 order-last sm:order-none flex sm:flex-col items-center justify-between sm:justify-center border-t sm:border-t-0 sm:border-x border-white/10 pt-2 sm:pt-0 sm:px-4">
          <div className="text-xs font-medium text-slate-400 sm:mb-0.5">
            Q{' '}
            <span className="font-mono-tabular text-white font-semibold">
              {snapshot.currentQuestionIndex + 1}/{snapshot.totalQuestions}
            </span>
          </div>
          {isReveal ? (
            <span className="text-xs font-semibold text-emerald-400">Simultaneous Reveal</span>
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

        {/* Participant 2 (Right) */}
        <div className="flex items-center justify-end gap-2 text-right min-w-0">
          {!isReveal && isHostObserver && (
            <span
              className={`text-[11px] font-medium shrink-0 ${
                rightLocked ? 'text-amber-300' : 'text-slate-400'
              }`}
            >
              {rightLocked ? 'Locked' : '...'}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center justify-end gap-1.5 min-w-0">
              {!rightPlayer?.connected && (
                <span className="text-[11px] text-amber-400 shrink-0">(Away)</span>
              )}
              <span className="text-xs sm:text-sm font-bold text-white truncate">
                {rightPlayer?.name ?? 'Participant 2'}
              </span>
            </div>
            <div className="mt-0.5 flex items-center justify-end gap-2 text-xs text-slate-300">
              {(rightPlayer?.streak ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5 text-amber-400 font-medium">
                  <Flame className="h-3 w-3" />
                  <span className="font-mono-tabular">{rightPlayer?.streak}</span>
                </span>
              )}
              <span className="font-mono-tabular font-semibold text-white text-xs sm:text-sm">
                {rightPlayer?.score ?? 0} pts
              </span>
            </div>
          </div>
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

      {/* Lock-in Status Banner (Participants) */}
      {!isReveal &&
        !isHostObserver &&
        (snapshot.selfLockedOption !== null || snapshot.opponentLocked) && (
          <div className="mb-3.5 sm:mb-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            {snapshot.selfLockedOption !== null && (
              <div
                className={`flex items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-sky-100 ${
                  !snapshot.opponentLocked ? 'sm:col-span-2' : ''
                }`}
              >
                <Lock className="h-4 w-4 text-sky-300 shrink-0" />
                <span>Locked In! Waiting for Opponent...</span>
              </div>
            )}
            {snapshot.opponentLocked && (
              <div
                className={`flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-amber-100 ${
                  snapshot.selfLockedOption === null ? 'sm:col-span-2' : ''
                }`}
              >
                <Lock className="h-4 w-4 text-amber-300 shrink-0" />
                <span>Opponent has locked in!</span>
              </div>
            )}
          </div>
        )}

      {/* Question Card */}
      <section className="rounded-2xl border border-white/10 bg-[#131D33] p-4 sm:p-7 mb-3.5 sm:mb-5">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span>
            {topic ? `${topic} · ` : ''}Question {snapshot.currentQuestionIndex + 1} of{' '}
            {snapshot.totalQuestions}
          </span>
          {!isReveal && !isHostObserver && snapshot.selfLockedOption === null && (
            <span className="hidden sm:inline text-slate-400">Press A–D or 1–4 to lock in</span>
          )}
        </div>
        <h2
          className="font-display text-lg sm:text-2xl font-bold text-white leading-snug"
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
            !isReveal && !isHostObserver && snapshot.selfLockedOption === idx;

          const isCorrectOption = isReveal && review?.correctIndex === idx;
          const leftPickedThis = isReveal && leftPickReview?.optionIndex === idx;
          const rightPickedThis = isReveal && rightPickReview?.optionIndex === idx;
          const isWrongPicked =
            isReveal && !isCorrectOption && (leftPickedThis || rightPickedThis);

          let cardStyle = isHostObserver
            ? 'border-white/12 bg-[#131D33] text-slate-100'
            : 'border-white/12 bg-[#131D33] text-slate-100 hover:border-amber-400/60 hover:bg-[#192642]';
          let keyStyle = 'border-white/15 bg-[#0B1221] text-slate-300';

          if (!isReveal && !isHostObserver && snapshot.selfLockedOption !== null) {
            if (isSelfSelectedBeforeReveal) {
              cardStyle = 'border-sky-400 bg-sky-500/20 text-white';
              keyStyle = 'border-sky-300 bg-sky-400 text-slate-950';
            } else {
              cardStyle = 'border-white/8 bg-[#10182B] text-slate-400 opacity-70';
              keyStyle = 'border-white/10 bg-[#0B1221] text-slate-500';
            }
          }

          if (isReveal) {
            if (isCorrectOption) {
              cardStyle = 'border-emerald-400 bg-emerald-500/20 text-white';
              keyStyle = 'border-emerald-300 bg-emerald-400 text-slate-950';
            } else if (isWrongPicked) {
              cardStyle = 'border-red-400/80 bg-red-500/20 text-red-50';
              keyStyle = 'border-red-300 bg-red-500 text-white';
            } else {
              cardStyle = 'border-white/8 bg-[#10182B] text-slate-400 opacity-65';
              keyStyle = 'border-white/10 bg-[#0B1221] text-slate-500';
            }
          }

          const disabled = isHostObserver || isReveal || snapshot.selfLockedOption !== null;

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
                  <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                    <Lock className="h-3.5 w-3.5" />
                    Locked
                  </span>
                )}

                {isReveal && isCorrectOption && (
                  <span className="font-semibold text-emerald-300">Correct</span>
                )}

                {isReveal && (leftPickedThis || rightPickedThis) && (
                  <span className="font-medium text-slate-200">
                    {[
                      leftPickedThis
                        ? isHostObserver
                          ? leftPlayer?.name ?? 'P1'
                          : 'You'
                        : null,
                      rightPickedThis ? rightPlayer?.name ?? 'Opponent' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* Simultaneous Reveal Breakdown & Auto-Rollover Status */}
      {isReveal && review && (
        <section className="rounded-2xl border border-white/10 bg-[#131D33] p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                label: isHostObserver
                  ? leftPlayer?.name ?? 'Participant 1'
                  : `${leftPlayer?.name ?? 'You'} (You)`,
                pick: leftPickReview,
              },
              { label: rightPlayer?.name ?? 'Participant 2', pick: rightPickReview },
            ].map((entry, idx) => {
              const p = entry.pick;
              if (!p) return null;
              const pickedLetter =
                p.optionIndex !== null ? OPTION_LETTERS[p.optionIndex] : 'No Pick';
              const sec =
                p.elapsedMs !== null ? `${(p.elapsedMs / 1000).toFixed(1)}s` : 'Timed Out';

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0B1221] px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{entry.label}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span>
                        Chose:{' '}
                        <strong className={p.isCorrect ? 'text-emerald-400' : 'text-red-400'}>
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
                        p.totalPoints > 0 ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      +{p.totalPoints} pts
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p.isCorrect ? (
                        p.speedBonus > 0 ? (
                          <span className="text-amber-300">+10 · +{p.speedBonus} fast</span>
                        ) : (
                          <span>+10 base</span>
                        )
                      ) : (
                        <span>Streak reset</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {review.explanation && (
            <div className="border-t border-white/10 pt-3 text-xs sm:text-sm text-slate-300 leading-relaxed">
              <span className="font-semibold text-white">Explanation: </span>
              {review.explanation}
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/10 pt-3.5">
            <span className="text-xs text-slate-400">
              {snapshot.settings.autoAdvanceSec > 0
                ? isLastQuestion
                  ? `Showing final podium automatically in ${autoAdvanceLeftSec}s...`
                  : `Rolling to next question automatically in ${autoAdvanceLeftSec}s...`
                : isHost
                  ? 'Discuss the answers, then advance when ready.'
                  : self?.readyForNext
                    ? 'Marked ready — waiting for opponent or host...'
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
