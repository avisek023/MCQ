import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface TopBarProps {
  inRoom: boolean;
  roomCode?: string;
  muted: boolean;
  onToggleMute: () => void;
  onPrimaryAction: () => void;
  onNavigateSection?: (sectionId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  inRoom,
  roomCode,
  muted,
  onToggleMute,
  onPrimaryAction,
  onNavigateSection,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-[#0B1221]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            if (inRoom) {
              e.preventDefault();
            }
          }}
          className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        >
          QuizDuel
        </a>

        {/* Zone 2: Clean single-line navigation / audio control */}
        {!inRoom ? (
          <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-slate-300">
            <button
              type="button"
              onClick={() => onNavigateSection?.('how-it-works')}
              className="hidden md:inline hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection?.('scoring-rules')}
              className="hidden md:inline hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Speed & Streaks
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection?.('upload-formats')}
              className="hidden md:inline hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Question Formats
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
              <span className="hidden sm:inline">{muted ? 'Audio Muted' : 'Audio On'}</span>
            </button>
          </nav>
        ) : (
          <nav className="flex items-center gap-3 sm:gap-6 text-sm font-medium text-slate-300">
            <span className="font-mono-tabular text-xs sm:text-sm text-slate-200 whitespace-nowrap shrink-0">
              Room {roomCode}
            </span>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? <VolumeX className="h-4 w-4 text-slate-400" /> : <Volume2 className="h-4 w-4 text-amber-400" />}
              <span className="hidden sm:inline">{muted ? 'Unmute Audio' : 'Mute Audio'}</span>
            </button>
          </nav>
        )}

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="min-h-[40px] sm:min-h-[42px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {inRoom ? 'Leave Room' : 'Host Room'}
          </button>
        </div>
      </div>
    </header>
  );
};
