import React, { useState } from 'react';
import { Check, Copy, Play, Settings2, Share2, UserCheck, Users, UserX } from 'lucide-react';
import type { HostMode, Question, RoomSettings, RoomSnapshot } from '../shared/types';
import { QuestionManager } from './QuestionManager';
import { RoomChat } from './RoomChat';

interface LobbyViewProps {
  snapshot: RoomSnapshot;
  error: string | null;
  onUpdateSettings: (settings: Partial<RoomSettings>) => void;
  onUpdateDeck: (title: string, questions: Question[]) => void;
  onStartMatch: () => void;
  onKickPlayer: (playerId: string) => void;
  onSendChat: (text: string, kind?: 'message' | 'reaction') => void;
}

const HOST_MODE_OPTIONS: { value: HostMode; label: string; hint: string }[] = [
  {
    value: 'moderator',
    label: 'Watch Only',
    hint: 'Host moderates & watches participants play',
  },
  {
    value: 'play_with',
    label: 'Play With Group',
    hint: 'Host plays alongside connected participants',
  },
  {
    value: 'solo',
    label: 'Play Solo',
    hint: 'Host plays individually without waiting for guests',
  },
];

export const LobbyView: React.FC<LobbyViewProps> = ({
  snapshot,
  error,
  onUpdateSettings,
  onUpdateDeck,
  onStartMatch,
  onKickPlayer,
  onSendChat,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const self = snapshot.players.find((p) => p.id === snapshot.selfId);
  const hostPlayer = snapshot.players.find((p) => p.role === 'host');
  const participants = snapshot.players.filter((p) => p.role === 'participant');
  const connectedParticipants = participants.filter((p) => p.connected);
  const isHost = Boolean(self?.isHost);
  const canEditDeck = isHost || snapshot.settings.allowGuestUpload;
  const hostMode = snapshot.settings.hostMode ?? 'moderator';
  const canStartMatch = hostMode === 'solo' || connectedParticipants.length >= 1;
  const activePlayerCount =
    hostMode === 'solo'
      ? 1
      : hostMode === 'play_with'
        ? connectedParticipants.length + 1
        : connectedParticipants.length;

  const hostRoleSubtitle =
    hostMode === 'solo'
      ? 'Session Host · Playing Solo'
      : hostMode === 'play_with'
        ? 'Session Host · Playing with Participants'
        : 'Session Host · Moderator (watching only)';

  const activeModeHint =
    HOST_MODE_OPTIONS.find((opt) => opt.value === hostMode)?.hint ?? '';

  const inviteUrl = `${window.location.origin}/?room=${snapshot.roomCode}`;

  const copyWithFallback = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const copyInviteLink = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join QuizDuel Session',
          text: `Join my QuizDuel room with code ${snapshot.roomCode}`,
          url: inviteUrl,
        });
        return;
      } catch {
        // user cancelled or share unavailable; fall back to copy
      }
    }
    if (await copyWithFallback(inviteUrl)) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const copyCodeOnly = async () => {
    if (await copyWithFallback(snapshot.roomCode)) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">
      {/* Lobby Header Strip */}
      <div className="mb-6 sm:mb-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6 border-b border-slate-200 dark:border-white/10 pb-5 sm:pb-6">
        <div>
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
            {hostMode === 'solo'
              ? 'Solo Host Session · Start Anytime'
              : `Private Session Lobby · 1 Host + ${participants.length} of 3 Participants Seated`}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Waiting Room{' '}
            <span className="font-mono-tabular text-amber-600 dark:text-amber-400 ml-1">
              {snapshot.roomCode}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copyCodeOnly}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-[#131D33] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-white/30 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedCode ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-4 w-4 text-slate-400" />
            )}
            <span>{copiedCode ? 'Code Copied' : `Code: ${snapshot.roomCode}`}</span>
          </button>

          <button
            type="button"
            onClick={copyInviteLink}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-sky-50 dark:bg-sky-500/15 border border-sky-300 dark:border-sky-400/40 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-500/25 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedLink ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Share2 className="h-4 w-4 text-sky-600 dark:text-sky-300" />
            )}
            <span>{copiedLink ? 'Invite Link Copied!' : 'Share Invite Link'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Players, Settings & Start Match */}
        <div className="lg:col-span-5 space-y-6">
          {/* Session Roster */}
          <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Session Roster (1 Host + 3 Participants)
              </h2>
              <Users className="h-4 w-4 text-slate-400" />
            </div>

            <div className="space-y-3">
              {/* Host Seat */}
              {hostPlayer && (
                <div className="flex items-center justify-between rounded-lg border border-amber-400/60 dark:border-amber-400/35 bg-white dark:bg-[#0B1221] px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {hostPlayer.name}
                      {hostPlayer.id === snapshot.selfId && (
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-300 ml-1.5">
                          (You)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {hostRoleSubtitle}
                    </div>
                  </div>
                  <UserCheck
                    className={`h-5 w-5 shrink-0 ${
                      hostPlayer.connected
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-500 dark:text-amber-400'
                    }`}
                  />
                </div>
              )}

              {/* Participant Seats 1, 2 & 3 */}
              {[0, 1, 2].map((slotIdx) => {
                const participant = participants[slotIdx];
                if (!participant) {
                  return (
                    <div
                      key={`empty-${slotIdx}`}
                      className="rounded-lg border border-dashed border-slate-300 dark:border-white/15 bg-white/70 dark:bg-[#0B1221]/60 px-4 py-3.5"
                    >
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Participant {slotIdx + 1} · {hostMode === 'solo' ? 'Optional in Solo Mode' : 'Waiting to join...'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {hostMode === 'solo'
                          ? 'Solo mode lets you start immediately without participants.'
                          : (
                            <>
                              Share invite link or room code{' '}
                              <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
                                {snapshot.roomCode}
                              </span>
                            </>
                          )}
                      </p>
                    </div>
                  );
                }

                const isMe = participant.id === snapshot.selfId;
                return (
                  <div
                    key={participant.id}
                    className={`flex items-center justify-between rounded-lg border bg-white dark:bg-[#0B1221] px-4 py-3 ${
                      isMe
                        ? 'border-sky-400 dark:border-sky-400/45'
                        : 'border-slate-200 dark:border-white/10'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {participant.name}
                        {isMe && (
                          <span className="text-xs font-medium text-sky-600 dark:text-sky-300 ml-1.5">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Participant {slotIdx + 1} ·{' '}
                        {participant.connected ? 'Connected' : 'Reconnecting...'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <UserCheck
                        className={`h-5 w-5 ${
                          participant.connected
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-500 dark:text-amber-400'
                        }`}
                      />
                      {isHost && (
                        <button
                          type="button"
                          onClick={() => onKickPlayer(participant.id)}
                          aria-label={`Kick ${participant.name}`}
                          title={`Kick ${participant.name}`}
                          className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 active:scale-[0.97] transition-all cursor-pointer"
                        >
                          <UserX className="h-3.5 w-3.5 mr-1" />
                          Kick
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Match Rules */}
          <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Match Settings
              </h2>
              <Settings2 className="h-4 w-4 text-slate-400" />
            </div>

            <div className="space-y-4">
              {/* Host Participation Mode */}
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <span>Host Participation</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {HOST_MODE_OPTIONS.find((o) => o.value === hostMode)?.label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {HOST_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!isHost}
                      onClick={() => onUpdateSettings({ hostMode: opt.value })}
                      className={`rounded-lg py-2 px-2 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                        hostMode === opt.value
                          ? 'bg-amber-500 text-slate-950 shadow-xs'
                          : 'bg-white dark:bg-[#0B1221] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {activeModeHint}
                </p>
              </div>

              <div className="border-t border-slate-200 dark:border-white/10 pt-3.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <span>Timer per Question</span>
                  <span className="font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
                    {snapshot.settings.timeLimitSec}s
                  </span>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {[15, 20, 30, 45, 60, 75, 90].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      disabled={!isHost}
                      onClick={() => onUpdateSettings({ timeLimitSec: sec })}
                      className={`font-mono-tabular rounded-md py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                        snapshot.settings.timeLimitSec === sec
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-white dark:bg-[#0B1221] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-white/10'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-white/10 pt-3.5">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Shuffle Questions
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Randomize question order each session
                  </div>
                </div>
                <div
                  role="group"
                  aria-label="Shuffle questions"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 dark:bg-[#0B1221] p-1 border border-slate-200 dark:border-white/10 shrink-0"
                >
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateSettings({ shuffleQuestions: true })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                      snapshot.settings.shuffleQuestions
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    On
                  </button>
                  <button
                    type="button"
                    disabled={!isHost}
                    onClick={() => onUpdateSettings({ shuffleQuestions: false })}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-default ${
                      !snapshot.settings.shuffleQuestions
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    Off
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-3.5">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Scoring System
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    1 point awarded for each correct answer
                  </div>
                </div>
                <span className="font-mono-tabular rounded-md border border-emerald-400 dark:border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  +1 pt / correct
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-3.5">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Auto-Rollover Timer
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Automatically advances after reveal (hands-free)
                  </div>
                </div>
                <select
                  aria-label="After reveal advance timing"
                  disabled={!isHost}
                  value={snapshot.settings.autoAdvanceSec}
                  onChange={(e) =>
                    onUpdateSettings({ autoAdvanceSec: Number(e.target.value) })
                  }
                  className="min-h-[40px] rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-2.5 py-1.5 text-sm sm:text-xs font-medium text-slate-900 dark:text-white focus:border-amber-400 focus:outline-none disabled:opacity-60"
                >
                  <option value={4}>Auto (4s)</option>
                  <option value={6}>Auto (6s)</option>
                  <option value={8}>Auto (8s)</option>
                  <option value={12}>Auto (12s)</option>
                  <option value={0}>Manual Next</option>
                </select>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/10 pt-3.5">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Participants Can Upload MCQs
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Allow participants to load or edit questions
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() =>
                    onUpdateSettings({ allowGuestUpload: !snapshot.settings.allowGuestUpload })
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                    snapshot.settings.allowGuestUpload
                      ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-500/40'
                      : 'bg-white dark:bg-[#0B1221] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {snapshot.settings.allowGuestUpload ? 'Allowed' : 'Host Only'}
                </button>
              </div>
            </div>

            {/* Start Action */}
            <div className="mt-6 border-t border-slate-200 dark:border-white/10 pt-5">
              {isHost ? (
                <button
                  type="button"
                  disabled={!canStartMatch || snapshot.deckSummary.count === 0}
                  onClick={onStartMatch}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>
                    {!canStartMatch
                      ? 'Waiting for at least 1 Participant...'
                      : hostMode === 'solo'
                        ? `Start Solo Session (${snapshot.deckSummary.count} Qs)`
                        : `Start Session (${activePlayerCount} Player${activePlayerCount === 1 ? '' : 's'} · ${snapshot.deckSummary.count} Qs)`}
                  </span>
                </button>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-300">
                  Waiting for{' '}
                  <span className="font-semibold text-slate-900 dark:text-white">Host</span> to
                  start the session...
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Question Uploader & Lobby Chat */}
        <div className="lg:col-span-7 space-y-6">
          <QuestionManager
            canEdit={canEditDeck}
            deckSummary={snapshot.deckSummary}
            editableQuestions={snapshot.editableQuestions}
            onUpdateDeck={onUpdateDeck}
          />
          <RoomChat
            messages={snapshot.messages}
            selfId={snapshot.selfId}
            onSendChat={onSendChat}
            variant="panel"
            title="Lobby Chat & Reactions"
          />
        </div>
      </div>
    </main>
  );
};
