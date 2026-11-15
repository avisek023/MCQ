import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Send } from 'lucide-react';
import type { ChatMessage } from '../shared/types';

interface RoomChatProps {
  messages: ChatMessage[];
  selfId: string;
  onSendChat: (text: string, kind?: 'message' | 'reaction') => void;
  variant?: 'panel' | 'compact';
  title?: string;
}

const QUICK_REACTIONS = ['Nice!', 'Too fast!', 'Lucky!', 'Wait what?', 'GG!'];

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const RoomChat: React.FC<RoomChatProps> = ({
  messages,
  selfId,
  onSendChat,
  variant = 'panel',
  title = 'Room Chat & Reactions',
}) => {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(variant === 'panel');
  const [lastSeenCount, setLastSeenCount] = useState(messages.length);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const isExpanded = variant === 'panel' || expanded;
  const unreadCount = isExpanded ? 0 : Math.max(0, messages.length - lastSeenCount);

  useEffect(() => {
    if (isExpanded) {
      setLastSeenCount(messages.length);
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages.length, isExpanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onSendChat(clean, 'message');
    setDraft('');
  };

  const handleQuickReaction = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
    onSendChat(text, 'reaction');
  };

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#131D33] p-4 sm:p-5">
      {/* Header / Toggle Row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="h-4 w-4 text-sky-400 shrink-0" />
          <h2 className="font-display text-sm sm:text-base font-bold text-white truncate">
            {title}
          </h2>
          <span className="font-mono-tabular text-xs text-slate-400 shrink-0">
            · {messages.length}
          </span>
        </div>

        {variant === 'compact' && (
          <div className="flex items-center gap-3 min-w-0">
            {!isExpanded && latestMessage && (
              <span className="hidden sm:inline truncate max-w-[220px] text-xs text-slate-300">
                <strong className="text-white">{latestMessage.senderName}:</strong>{' '}
                {latestMessage.text}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                const next = !expanded;
                setExpanded(next);
                if (next) setLastSeenCount(messages.length);
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#0B1221] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/30 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>
                {isExpanded
                  ? 'Hide Chat'
                  : unreadCount > 0
                    ? `Chat (${unreadCount} new)`
                    : 'Open Chat'}
              </span>
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Single-line Horizontal Thumb Quick Reactions Strip */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">React:</span>
        {QUICK_REACTIONS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => handleQuickReaction(label)}
            className="min-h-[40px] rounded-xl border border-white/12 bg-[#0B1221] px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-400/50 hover:text-amber-200 active:scale-[0.96] transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Message Thread + Input */}
      {isExpanded && (
        <div className="mt-3.5 space-y-3 border-t border-white/10 pt-3.5">
          <div
            ref={scrollRef}
            className="max-h-52 min-h-[104px] overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-[#0B1221] p-3"
          >
            {messages.length === 0 ? (
              <p className="py-5 text-center text-xs text-slate-400">
                No messages yet. Tap a reaction above or write a message — chat stays saved across
                the match.
              </p>
            ) : (
              messages.map((msg) => {
                const isSelf = msg.senderId === selfId;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                  >
                    <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="font-medium text-slate-300">
                        {isSelf ? `${msg.senderName} (You)` : msg.senderName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{formatTime(msg.createdAt)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-xl px-3 py-1.5 text-sm leading-snug break-words ${
                        msg.kind === 'reaction'
                          ? 'border border-amber-400/40 bg-amber-500/15 font-semibold text-amber-100'
                          : isSelf
                            ? 'border border-sky-400/35 bg-sky-500/20 text-white'
                            : 'border border-white/10 bg-[#16213B] text-slate-100'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="text"
              maxLength={240}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message..."
              aria-label="Write a message to your opponent"
              className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-[#0B1221] px-3.5 py-2 text-base sm:text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
    </section>
  );
};
