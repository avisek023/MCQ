import React from 'react';
import { Maximize2, Minimize2, Moon, Sun, Volume2, VolumeX } from 'lucide-react';

interface TopBarProps {
  inRoom: boolean;
  roomCode?: string;
  muted: boolean;
  theme: 'dark' | 'light';
  isFullscreen: boolean;
  fullscreenSupported: boolean;
  onToggleMute: () => void;
  onToggleTheme: () => void;
  onToggleFullscreen: () => void;
  onPrimaryAction: () => void;
  onNavigateSection?: (sectionId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  inRoom,
  roomCode,
  muted,
  theme,
  isFullscreen,
  fullscreenSupported,
  onToggleMute,
  onToggleTheme,
  onToggleFullscreen,
  onPrimaryAction,
  onNavigateSection,
}) => {
  const themeSwitchBtn = (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'light'}
      aria-label={theme === 'dark' ? 'Switch to white mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to White Mode' : 'Switch to Dark Mode'}
      onClick={onToggleTheme}
      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-[#131D33] px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/30 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 text-amber-400 shrink-0" />
      ) : (
        <Moon className="h-4 w-4 text-slate-700 shrink-0" />
      )}
      <span className="hidden sm:inline">
        {theme === 'dark' ? 'White' : 'Dark'}
      </span>
    </button>
  );

  const fullscreenBtn = fullscreenSupported ? (
    <button
      type="button"
      onClick={onToggleFullscreen}
      aria-label={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
      title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border border-slate-200 dark:border-white/15 bg-slate-100 dark:bg-[#131D33] px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-white/30 active:scale-[0.98] transition-all shrink-0 cursor-pointer"
    >
      {isFullscreen ? (
        <Minimize2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
      ) : (
        <Maximize2 className="h-4 w-4 shrink-0" />
      )}
    </button>
  ) : null;

  return (
    <header className="relative z-50 shrink-0 w-full border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#0B1221]/95 backdrop-blur-md pt-[env(safe-area-inset-top)] transition-colors duration-200">
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between gap-2 sm:gap-6 px-3.5 sm:px-6">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            if (inRoom) {
              e.preventDefault();
            }
          }}
          className="font-display text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
        >
          QuizDuel
        </a>

        {/* Zone 2: Navigation, audio, dark/white mode switch & fullscreen toggle */}
        {!inRoom ? (
          <nav className="flex items-center gap-1.5 sm:gap-4 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button
              type="button"
              onClick={() => onNavigateSection?.('how-it-works')}
              className="hidden md:inline hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection?.('scoring-rules')}
              className="hidden md:inline hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Scoring Rules
            </button>
            <button
              type="button"
              onClick={() => onNavigateSection?.('upload-formats')}
              className="hidden md:inline hover:text-slate-950 dark:hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Question Formats
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-slate-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              )}
              <span className="hidden sm:inline text-xs font-semibold">
                {muted ? 'Muted' : 'Audio'}
              </span>
            </button>
            {themeSwitchBtn}
            {fullscreenBtn}
          </nav>
        ) : (
          <nav className="flex items-center gap-1.5 sm:gap-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            <span className="font-mono-tabular text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0">
              Room {roomCode}
            </span>
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 hover:text-slate-950 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {muted ? (
                <VolumeX className="h-4 w-4 text-slate-400" />
              ) : (
                <Volume2 className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              )}
              <span className="hidden sm:inline text-xs font-semibold">
                {muted ? 'Unmute' : 'Audio'}
              </span>
            </button>
            {themeSwitchBtn}
            {fullscreenBtn}
          </nav>
        )}

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="min-h-[40px] sm:min-h-[42px] px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            {inRoom ? 'Leave Room' : 'Host Room'}
          </button>
        </div>
      </div>
    </header>
  );
};

