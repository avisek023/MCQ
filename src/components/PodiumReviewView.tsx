import React, { useMemo, useState } from 'react';
import { Award, Check, Crown, Flame, RotateCcw, Upload, Volume2, X } from 'lucide-react';
import { OPTION_LETTERS, PlayerInfo, RoomSnapshot } from '../shared/types';
import { soundEngine } from '../utils/sound';
import { RoomChat } from './RoomChat';

interface PodiumReviewViewProps {
  snapshot: RoomSnapshot;
  onRematch: () => void;
  onSendChat: (text: string, kind?: 'message' | 'reaction') => void;
}

const CONFETTI_PIECES = [
  { left: '8%', delay: '0ms', color: 'bg-amber-400' },
  { left: '16%', delay: '120ms', color: 'bg-emerald-400' },
  { left: '25%', delay: '60ms', color: 'bg-sky-400' },
  { left: '34%', delay: '180ms', color: 'bg-amber-300' },
  { left: '44%', delay: '90ms', color: 'bg-emerald-300' },
  { left: '56%', delay: '40ms', color: 'bg-amber-400' },
  { left: '66%', delay: '150ms', color: 'bg-sky-400' },
  { left: '75%', delay: '80ms', color: 'bg-emerald-400' },
  { left: '84%', delay: '200ms', color: 'bg-amber-300' },
  { left: '92%', delay: '110ms', color: 'bg-sky-300' },
];

export const PodiumReviewView: React.FC<PodiumReviewViewProps> = ({
  snapshot,
  onRematch,
  onSendChat,
}) => {
  const [filter, setFilter] = useState<'all' | 'disagreements' | 'missed'>('all');

  const participants = useMemo(
    () => snapshot.players.filter((p) => p.role === 'participant'),
    [snapshot.players]
  );

  const sortedPlayers = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      const avgA = a.answeredCount ? a.totalResponseMs / a.answeredCount : Infinity;
      const avgB = b.answeredCount ? b.totalResponseMs / b.answeredCount : Infinity;
      return avgA - avgB;
    });
  }, [participants]);

  const first = sortedPlayers[0];
  const second = sortedPlayers[1];
  const isTie = Boolean(
    first && second && first.score === second.score && first.correctCount === second.correctCount
  );

  const filteredHistory = useMemo(() => {
    return snapshot.history.filter((round) => {
      const picks = Object.values(round.picks);
      if (filter === 'disagreements') {
        if (picks.length < 2) return false;
        return picks[0].optionIndex !== picks[1].optionIndex;
      }
      if (filter === 'missed') {
        return picks.some((p) => !p.isCorrect);
      }
      return true;
    });
  }, [snapshot.history, filter]);

  const formatAvgTime = (p: PlayerInfo) => {
    if (!p.answeredCount) return '—';
    return `${(p.totalResponseMs / p.answeredCount / 1000).toFixed(1)}s`;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
      {/* Winner Podium with Fanfare */}
      <section className="relative overflow-hidden rounded-2xl border border-amber-400/30 bg-[#131D33] p-5 sm:p-10 mb-8 sm:mb-10">
        {/* Confetti burst */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden">
          {CONFETTI_PIECES.map((piece, idx) => (
            <span
              key={idx}
              className={`animate-confetti absolute top-0 h-2.5 w-2.5 rounded-xs ${piece.color}`}
              style={{ left: piece.left, animationDelay: piece.delay }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-300">
            <Crown className="h-6 w-6" />
          </div>
          <p className="text-xs font-medium text-amber-400 mb-1">
            Final Match Standings · {snapshot.totalQuestions} Questions
          </p>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight">
            {isTie
              ? `Deadlock! ${first?.name} & ${second?.name} Tie`
              : `${first?.name ?? 'Champion'} Takes the Crown!`}
          </h1>

          <button
            type="button"
            onClick={() => soundEngine.playVictoryFanfare()}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Replay Victory Fanfare
          </button>
        </div>

        {/* Podium Cards */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-end max-w-3xl mx-auto mb-8">
          {/* 1st Place */}
          {first && (
            <div className="rounded-xl border border-amber-400/50 bg-[#0B1221] p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Crown className="h-4 w-4" />
                  {isTie ? 'Co-Champion' : '1st Place'}
                </span>
                {first.id === snapshot.selfId && (
                  <span className="text-xs text-sky-400 font-medium">You</span>
                )}
              </div>
              <div className="font-display text-2xl font-bold text-white mb-1">{first.name}</div>
              <div className="font-mono-tabular text-3xl font-bold text-amber-400 mb-5">
                {first.score} pts
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-xs">
                <div>
                  <div className="text-slate-400">Accuracy</div>
                  <div className="font-mono-tabular font-semibold text-white mt-0.5">
                    {first.correctCount}/{snapshot.totalQuestions}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Best Streak</div>
                  <div className="font-mono-tabular font-semibold text-white mt-0.5 inline-flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-amber-400" />
                    {first.bestStreak}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Avg Reflex</div>
                  <div className="font-mono-tabular font-semibold text-white mt-0.5">
                    {formatAvgTime(first)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2nd Place */}
          {second && (
            <div className="rounded-xl border border-white/15 bg-[#0B1221] p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300">
                  <Award className="h-4 w-4 text-slate-400" />
                  {isTie ? 'Co-Champion' : '2nd Place'}
                </span>
                {second.id === snapshot.selfId && (
                  <span className="text-xs text-sky-400 font-medium">You</span>
                )}
              </div>
              <div className="font-display text-2xl font-bold text-white mb-1">{second.name}</div>
              <div className="font-mono-tabular text-3xl font-bold text-slate-200 mb-5">
                {second.score} pts
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4 text-xs">
                <div>
                  <div className="text-slate-400">Accuracy</div>
                  <div className="font-mono-tabular font-semibold text-white mt-0.5">
                    {second.correctCount}/{snapshot.totalQuestions}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Best Streak</div>
                  <div className="font-mono-tabular font-semibold text-white mt-0.5 inline-flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-amber-400" />
                    {second.bestStreak}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Avg Reflex</div>
                  <div className="font-mono-tabular font-semibold text-white mt-0.5">
                    {formatAvgTime(second)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rematch / Upload New Questions */}
        {(() => {
          const self = snapshot.players.find((p) => p.id === snapshot.selfId);
          const hostConnected = snapshot.players.some((p) => p.isHost && p.connected);
          const canTriggerRematch = Boolean(self?.isHost) || !hostConnected;
          if (!canTriggerRematch) {
            return (
              <p className="relative z-10 text-center text-xs text-slate-400">
                Waiting for the session Host to return to the lobby for another round.
              </p>
            );
          }
          return (
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={onRematch}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Back to Lobby & Rematch</span>
              </button>
              <button
                type="button"
                onClick={onRematch}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0B1221] px-5 py-3 text-sm font-semibold text-white hover:border-white/30 transition-colors cursor-pointer"
              >
                <Upload className="h-4 w-4 text-amber-400" />
                <span>Upload New Questions</span>
              </button>
            </div>
          );
        })()}
      </section>

      {/* Post-Match Persistent Chat */}
      <div className="mb-10">
        <RoomChat
          messages={snapshot.messages}
          selfId={snapshot.selfId}
          onSendChat={onSendChat}
          variant="panel"
          title="Post-Match Chat & Reactions"
        />
      </div>

      {/* Full Question-by-Question Review */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Question-by-Question Review
            </h2>
            <p className="text-sm text-slate-400">
              Compare both players’ choices and reaction speed against the official answer.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-[#131D33] p-1 border border-white/10 self-start">
            {[
              { id: 'all', label: `All (${snapshot.history.length})` },
              { id: 'disagreements', label: 'Different Picks' },
              { id: 'missed', label: 'Missed' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id as 'all' | 'disagreements' | 'missed')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[#131D33] p-8 text-center text-sm text-slate-400">
            No questions match this filter.
          </div>
        ) : (
          <div className="space-y-5">
            {filteredHistory.map((round) => {
              const p1 = participants[0];
              const p2 = participants[1];
              const pick1 = p1 ? round.picks[p1.id] : undefined;
              const pick2 = p2 ? round.picks[p2.id] : undefined;

              return (
                <article
                  key={round.questionId + round.questionIndex}
                  className="rounded-xl border border-white/10 bg-[#131D33] p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 mb-2">
                    <span>
                      Question {round.questionIndex + 1}
                      {round.topic ? ` · ${round.topic}` : ''}
                    </span>
                    <span className="font-medium text-emerald-400">
                      Official Answer: {OPTION_LETTERS[round.correctIndex]}.{' '}
                      {round.options[round.correctIndex]}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-semibold text-white mb-4">
                    {round.question}
                  </h3>

                  {/* Options Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                    {round.options.map((optText, idx) => {
                      const isCorrect = idx === round.correctIndex;
                      const p1Chose = pick1?.optionIndex === idx;
                      const p2Chose = pick2?.optionIndex === idx;

                      let cls = 'border-white/10 bg-[#0B1221] text-slate-300';
                      if (isCorrect) {
                        cls = 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100';
                      } else if (p1Chose || p2Chose) {
                        cls = 'border-red-500/50 bg-red-500/15 text-red-100';
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${cls}`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {isCorrect ? (
                              <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                            ) : p1Chose || p2Chose ? (
                              <X className="h-4 w-4 text-red-400 shrink-0" />
                            ) : (
                              <span className="font-mono-tabular text-xs font-bold text-slate-500 w-4 text-center shrink-0">
                                {OPTION_LETTERS[idx]}
                              </span>
                            )}
                            <span className="truncate">
                              {OPTION_LETTERS[idx]}. {optText}
                            </span>
                          </span>

                          {(p1Chose || p2Chose) && (
                            <span className="text-xs font-medium shrink-0 text-slate-200">
                              {[
                                p1Chose ? (p1.id === snapshot.selfId ? 'You' : p1.name) : null,
                                p2Chose ? (p2.id === snapshot.selfId ? 'You' : p2.name) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Player Comparison Row */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-3.5 text-xs text-slate-300">
                    <div className="flex flex-wrap items-center gap-5">
                      {[
                        { player: p1, pick: pick1 },
                        { player: p2, pick: pick2 },
                      ].map(
                        (entry, idx) =>
                          entry.player &&
                          entry.pick && (
                            <span key={idx} className="flex items-center gap-1.5">
                              <strong className="text-white">
                                {entry.player.id === snapshot.selfId
                                  ? `${entry.player.name} (You)`
                                  : entry.player.name}
                                :
                              </strong>
                              <span
                                className={
                                  entry.pick.isCorrect ? 'text-emerald-400' : 'text-red-400'
                                }
                              >
                                {entry.pick.optionIndex !== null
                                  ? OPTION_LETTERS[entry.pick.optionIndex]
                                  : 'Timed Out'}
                              </span>
                              <span className="font-mono-tabular text-slate-400">
                                (
                                {entry.pick.elapsedMs !== null
                                  ? `${(entry.pick.elapsedMs / 1000).toFixed(1)}s`
                                  : '—'}
                                , +{entry.pick.totalPoints} pts)
                              </span>
                            </span>
                          )
                      )}
                    </div>
                  </div>

                  {round.explanation && (
                    <p className="mt-3 text-xs text-slate-400 leading-relaxed">
                      <span className="font-semibold text-slate-200">Note: </span>
                      {round.explanation}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};
