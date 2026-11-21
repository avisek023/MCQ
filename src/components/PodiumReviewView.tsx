import React, { useMemo, useState } from 'react';
import { Award, BarChart3, Check, Crown, Download, RotateCcw, Upload, Volume2, X } from 'lucide-react';
import {
  OPTION_LETTERS,
  PlayerInfo,
  RoomSnapshot,
  SCORING_MODE_DETAILS,
  formatPoints,
  formatPointsWithUnit,
  roundPoints,
} from '../shared/types';
import { exportPersonalResultsPdf } from '../utils/exportResultsPdf';
import { soundEngine } from '../utils/sound';
import { PresenceDot } from './PresenceDot';
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

  const hostMode = snapshot.settings.hostMode ?? 'moderator';
  const scoringMode = snapshot.settings.scoringMode ?? 'exam';

  const activePlayers = useMemo(() => {
    if (hostMode === 'solo') return snapshot.players.filter((p) => p.isHost);
    if (hostMode === 'play_with') return snapshot.players;
    return snapshot.players.filter((p) => p.role === 'participant');
  }, [snapshot.players, hostMode]);

  const sortedPlayers = useMemo(() => {
    return [...activePlayers].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;
      const avgA = a.answeredCount ? a.totalResponseMs / a.answeredCount : Infinity;
      const avgB = b.answeredCount ? b.totalResponseMs / b.answeredCount : Infinity;
      return avgA - avgB;
    });
  }, [activePlayers]);

  const first = sortedPlayers[0];
  const topScore = first?.score ?? 0;
  const tiedWinners = sortedPlayers.filter((p) => p.score === topScore);
  const isTie = tiedWinners.length > 1;

  const podiumHeadline =
    sortedPlayers.length <= 1
      ? `${first?.name ?? 'Solo Player'} Completed the Session!`
      : isTie && tiedWinners.length === sortedPlayers.length
        ? `${sortedPlayers.length}-Way Tie! Everyone Shares 1st Place`
        : isTie
          ? `Tie! ${tiedWinners.map((w) => w.name).join(' & ')} Share 1st Place`
          : `${first?.name ?? 'Champion'} Takes the Crown!`;

  const podiumGridClass =
    sortedPlayers.length <= 1
      ? 'md:grid-cols-1 max-w-md'
      : sortedPlayers.length === 2
        ? 'md:grid-cols-2 max-w-3xl'
        : sortedPlayers.length === 3
          ? 'md:grid-cols-3 max-w-4xl'
          : 'md:grid-cols-2 lg:grid-cols-4 max-w-5xl';

  const filteredHistory = useMemo(() => {
    return snapshot.history.filter((round) => {
      const picks = Object.values(round.picks);
      if (filter === 'disagreements') {
        if (picks.length < 2) return false;
        const distinctChoices = new Set(picks.map((p) => p.optionIndex));
        return distinctChoices.size > 1;
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

  const selfRankIndex = sortedPlayers.findIndex((p) => p.id === snapshot.selfId);
  const selfRankedPlayer = selfRankIndex !== -1 ? sortedPlayers[selfRankIndex] : null;

  const handleDownloadPersonalPdf = () => {
    if (!selfRankedPlayer) return;
    exportPersonalResultsPdf({
      snapshot,
      player: selfRankedPlayer,
      rank: selfRankIndex + 1,
      totalRankedPlayers: sortedPlayers.length,
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
      {/* Winner Podium with Fanfare */}
      <section className="relative overflow-hidden rounded-2xl border border-amber-400/50 dark:border-amber-400/30 bg-slate-50 dark:bg-[#131D33] p-5 sm:p-10 mb-8 sm:mb-10">
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
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/50 dark:border-amber-400/40 bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <Crown className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
            Final Match Standings · {snapshot.totalQuestions} Questions
          </p>
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
            {podiumHeadline}
          </h1>

          <button
            type="button"
            onClick={() => soundEngine.playVictoryFanfare()}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-300 transition-colors cursor-pointer"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Replay Victory Fanfare
          </button>
        </div>

        {/* Podium Cards */}
        <div className={`relative z-10 grid grid-cols-1 gap-4 sm:gap-5 mx-auto mb-8 ${podiumGridClass}`}>
          {sortedPlayers.map((player, rankIdx) => {
            const isSharedFirst = isTie && player.score === topScore;
            const isFirstCard = rankIdx === 0 || isSharedFirst;
            const rankLabels = ['1st Place', '2nd Place', '3rd Place', '4th Place'];
            const rankLabel =
              sortedPlayers.length <= 1
                ? 'Solo Score'
                : isSharedFirst
                  ? 'Co-Champion'
                  : rankLabels[rankIdx] ?? `#${rankIdx + 1}`;

            return (
              <div
                key={player.id}
                className={`rounded-xl border bg-white dark:bg-[#0B1221] p-5 sm:p-6 ${
                  isFirstCard
                    ? 'border-amber-400 dark:border-amber-400/55 shadow-sm dark:shadow-none'
                    : 'border-slate-200 dark:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between mb-3.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                      isFirstCard
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isFirstCard ? (
                      <Crown className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    ) : (
                      <Award className="h-4 w-4 text-slate-400" />
                    )}
                    {rankLabel}
                  </span>
                  {player.id === snapshot.selfId && (
                    <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">
                      You
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1 min-w-0">
                  <PresenceDot
                    status={player.presenceStatus}
                    hasLeft={player.hasLeft}
                    size="sm"
                  />
                  <span className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
                    {player.name}
                  </span>
                  {player.hasLeft && (
                    <span className="rounded border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300 shrink-0">
                      Left
                    </span>
                  )}
                </div>
                <div
                  className={`font-mono-tabular text-3xl font-bold mb-4 ${
                    isFirstCard
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {formatPointsWithUnit(player.score)}
                </div>

                <div className="grid grid-cols-4 gap-2 border-t border-slate-200 dark:border-white/10 pt-3.5 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Correct</div>
                    <div className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {player.correctCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Wrong</div>
                    <div className="font-mono-tabular font-semibold text-red-600 dark:text-red-400 mt-0.5">
                      {player.wrongCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Blank</div>
                    <div className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                      {player.unattemptedCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Avg</div>
                    <div className="font-mono-tabular font-semibold text-slate-900 dark:text-white mt-0.5">
                      {formatAvgTime(player)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rematch / Upload New Questions / Download Personal PDF */}
        {(() => {
          const self = snapshot.players.find((p) => p.id === snapshot.selfId);
          const hostConnected = snapshot.players.some(
            (p) => p.isHost && p.connected && !p.hasLeft
          );
          const canTriggerRematch = Boolean(self?.isHost) || !hostConnected;

          return (
            <div className="relative z-10 flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                {selfRankedPlayer && (
                  <button
                    type="button"
                    onClick={handleDownloadPersonalPdf}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-500 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download My Results (PDF)</span>
                  </button>
                )}

                {canTriggerRematch && (
                  <>
                    <button
                      type="button"
                      onClick={onRematch}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Back to Lobby & Rematch</span>
                    </button>
                    <button
                      type="button"
                      onClick={onRematch}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-5 py-3 text-sm font-semibold text-slate-800 dark:text-white hover:border-slate-400 dark:hover:border-white/30 transition-colors cursor-pointer"
                    >
                      <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span>Upload New Questions</span>
                    </button>
                  </>
                )}
              </div>

              {!canTriggerRematch && (
                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  Waiting for the session Host to return to the lobby for another round.
                </p>
              )}
            </div>
          );
        })()}
      </section>

      {/* Detailed Results & Visual Participant Comparison */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-5 sm:p-7 mb-8 sm:mb-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4">
          <div className="flex items-start gap-2.5">
            <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Detailed Results &amp; Participant Comparison
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                {SCORING_MODE_DETAILS[scoringMode].label} Scoring ·{' '}
                {SCORING_MODE_DETAILS[scoringMode].description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
              Correct
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-red-500" />
              Wrong
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-slate-400 dark:bg-slate-500" />
              Blank / Skipped
            </span>
          </div>
        </div>

        {/* Visual Outcome Stacked Bars */}
        <div className="space-y-4">
          {sortedPlayers.map((player, idx) => {
            const totalQ = Math.max(
              1,
              snapshot.totalQuestions ||
                player.correctCount + player.wrongCount + player.unattemptedCount
            );
            const attempted = player.correctCount + player.wrongCount;
            const accuracyPct =
              attempted > 0 ? Math.round((player.correctCount / attempted) * 100) : null;
            const correctW = (player.correctCount / totalQ) * 100;
            const wrongW = (player.wrongCount / totalQ) * 100;
            const blankW = Math.max(0, 100 - correctW - wrongW);
            const isMe = player.id === snapshot.selfId;

            return (
              <div
                key={`bar-${player.id}`}
                className={`rounded-xl border bg-white dark:bg-[#0B1221] p-4 ${
                  isMe
                    ? 'border-sky-400/70 dark:border-sky-400/45'
                    : 'border-slate-200 dark:border-white/10'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-tabular inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-white/10 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
                      #{idx + 1}
                    </span>
                    <PresenceDot
                      status={player.presenceStatus}
                      hasLeft={player.hasLeft}
                      size="sm"
                    />
                    <span className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      {player.name}
                    </span>
                    {isMe && (
                      <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                        (You)
                      </span>
                    )}
                    {player.hasLeft && (
                      <span className="rounded border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300 shrink-0">
                        Left
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs sm:text-sm shrink-0">
                    <span className="text-slate-500 dark:text-slate-400">
                      Accuracy:{' '}
                      <strong className="font-mono-tabular text-slate-900 dark:text-white">
                        {accuracyPct !== null ? `${accuracyPct}%` : '—'}
                      </strong>
                    </span>
                    <span className="font-mono-tabular font-bold text-amber-600 dark:text-amber-400">
                      {formatPointsWithUnit(player.score)}
                    </span>
                  </div>
                </div>

                {/* Stacked Proportional Bar */}
                <svg
                  viewBox="0 0 100 6"
                  preserveAspectRatio="none"
                  aria-label={`${player.name}: ${player.correctCount} correct, ${player.wrongCount} wrong, ${player.unattemptedCount} left blank`}
                  className="h-3 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-white/10"
                >
                  {correctW > 0 && (
                    <rect x={0} y={0} width={correctW} height={6} className="fill-emerald-500" />
                  )}
                  {wrongW > 0 && (
                    <rect x={correctW} y={0} width={wrongW} height={6} className="fill-red-500" />
                  )}
                  {blankW > 0 && (
                    <rect
                      x={correctW + wrongW}
                      y={0}
                      width={blankW}
                      height={6}
                      className="fill-slate-400 dark:fill-slate-600"
                    />
                  )}
                </svg>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                      {player.correctCount} Correct
                    </span>
                    <span className="font-mono-tabular font-semibold text-red-600 dark:text-red-400">
                      {player.wrongCount} Wrong
                    </span>
                    <span className="font-mono-tabular font-semibold text-slate-600 dark:text-slate-400">
                      {player.unattemptedCount} Left Blank
                    </span>
                  </div>
                  <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                    {scoringMode === 'exam' && attempted > 0
                      ? `+${player.correctCount} − ${formatPoints(roundPoints(player.wrongCount * 0.25))} = ${formatPoints(player.score)} marks`
                      : `Avg response: ${formatAvgTime(player)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Side-by-Side Comparison Matrix */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221]">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-3.5 font-semibold">Participant</th>
                <th className="py-3 px-2.5 font-semibold text-right">Correct</th>
                <th className="py-3 px-2.5 font-semibold text-right">Wrong</th>
                <th className="py-3 px-2.5 font-semibold text-right">Blank</th>
                <th className="py-3 px-2.5 font-semibold text-right">Attempted</th>
                <th className="py-3 px-2.5 font-semibold text-right">Accuracy</th>
                <th className="py-3 px-2.5 font-semibold text-right">Avg Time</th>
                <th className="py-3 px-3.5 font-semibold text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {sortedPlayers.map((player, idx) => {
                const attempted = player.correctCount + player.wrongCount;
                const accuracyPct =
                  attempted > 0 ? Math.round((player.correctCount / attempted) * 100) : null;
                const isMe = player.id === snapshot.selfId;

                return (
                  <tr
                    key={`row-${player.id}`}
                    className={isMe ? 'bg-sky-50/70 dark:bg-sky-500/10' : ''}
                  >
                    <td className="py-3 px-3.5 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono-tabular text-slate-400">#{idx + 1}</span>
                        <PresenceDot
                          status={player.presenceStatus}
                          hasLeft={player.hasLeft}
                          size="sm"
                        />
                        <span>{player.name}</span>
                        {isMe && (
                          <span className="text-xs text-sky-600 dark:text-sky-400">(You)</span>
                        )}
                        {player.hasLeft && (
                          <span className="rounded border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                            Left
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                      {player.correctCount}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono-tabular font-semibold text-red-600 dark:text-red-400">
                      {player.wrongCount}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                      {player.unattemptedCount}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                      {attempted}/{snapshot.totalQuestions}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono-tabular text-slate-700 dark:text-slate-200">
                      {accuracyPct !== null ? `${accuracyPct}%` : '—'}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                      {formatAvgTime(player)}
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono-tabular font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {formatPointsWithUnit(player.score)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Question-by-Question Review
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Compare choices against the official answer.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#131D33] p-1 border border-slate-200 dark:border-white/10 self-start">
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
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No questions match this filter.
          </div>
        ) : (
          <div className="space-y-5">
            {filteredHistory.map((round) => {
              return (
                <article
                  key={round.questionId + round.questionIndex}
                  className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2">
                    <span>
                      Question {round.questionIndex + 1}
                      {round.topic ? ` · ${round.topic}` : ''}
                    </span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      Official Answer: {OPTION_LETTERS[round.correctIndex]}.{' '}
                      {round.options[round.correctIndex]}
                    </span>
                  </div>

                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    {round.question}
                  </h3>

                  {/* Options Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
                    {round.options.map((optText, idx) => {
                      const isCorrect = idx === round.correctIndex;
                      const pickedBy = activePlayers.filter(
                        (p) => round.picks[p.id]?.optionIndex === idx
                      );

                      let cls =
                        'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] text-slate-700 dark:text-slate-300';
                      if (isCorrect) {
                        cls =
                          'border-emerald-500/60 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-100';
                      } else if (pickedBy.length > 0) {
                        cls =
                          'border-red-400/60 dark:border-red-500/50 bg-red-50 dark:bg-red-500/15 text-red-900 dark:text-red-100';
                      }

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${cls}`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            {isCorrect ? (
                              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            ) : pickedBy.length > 0 ? (
                              <X className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                            ) : (
                              <span className="font-mono-tabular text-xs font-bold text-slate-400 dark:text-slate-500 w-4 text-center shrink-0">
                                {OPTION_LETTERS[idx]}
                              </span>
                            )}
                            <span className="truncate">
                              {OPTION_LETTERS[idx]}. {optText}
                            </span>
                          </span>

                          {pickedBy.length > 0 && (
                            <span className="text-xs font-medium shrink-0 text-slate-700 dark:text-slate-200">
                              {pickedBy
                                .map((p) => (p.id === snapshot.selfId ? 'You' : p.name))
                                .join(' · ')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Player Comparison Row */}
                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-white/10 pt-3.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      {activePlayers.map((player) => {
                        const pick = round.picks[player.id];
                        if (!pick) return null;
                        const choiceText =
                          pick.optionIndex !== null
                            ? OPTION_LETTERS[pick.optionIndex]
                            : pick.skipped
                              ? 'Skipped (Blank)'
                              : 'Unattempted';

                        return (
                          <span key={player.id} className="flex items-center gap-1.5">
                            <strong className="text-slate-900 dark:text-white">
                              {player.id === snapshot.selfId
                                ? `${player.name} (You)`
                                : player.name}
                              :
                            </strong>
                            <span
                              className={
                                pick.isCorrect
                                  ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                                  : pick.optionIndex === null
                                    ? 'font-semibold text-slate-500 dark:text-slate-400'
                                    : 'font-semibold text-red-600 dark:text-red-400'
                              }
                            >
                              {choiceText}
                            </span>
                            <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                              (
                              {pick.elapsedMs !== null
                                ? `${(pick.elapsedMs / 1000).toFixed(1)}s`
                                : '—'}
                              ,{' '}
                              <span
                                className={
                                  pick.totalPoints > 0
                                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                    : pick.totalPoints < 0
                                      ? 'text-red-600 dark:text-red-400 font-semibold'
                                      : ''
                                }
                              >
                                {formatPointsWithUnit(pick.totalPoints, true)}
                              </span>
                              )
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {round.explanation && (
                    <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Note:{' '}
                      </span>
                      {round.explanation}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
