import { useEffect, useMemo, useRef, useState } from 'react';
import { ArenaView } from './components/ArenaView';
import { LandingView } from './components/LandingView';
import { LobbyView } from './components/LobbyView';
import { PodiumReviewView } from './components/PodiumReviewView';
import { TopBar } from './components/TopBar';
import { useQuizSocket } from './hooks/useQuizSocket';
import { soundEngine } from './utils/sound';

export default function App() {
  const {
    snapshot,
    connected,
    error,
    serverOffsetMs,
    createRoom,
    joinRoom,
    leaveRoom,
    kickPlayer,
    updateSettings,
    updateDeck,
    startMatch,
    lockAnswer,
    skipAnswer,
    nextRound,
    rematch,
    sendChat,
  } = useQuizSocket();

  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('quizduel_muted') === 'true';
    } catch {
      return false;
    }
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('quizduel_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const fullscreenSupported = useMemo(() => {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & {
      webkitFullscreenEnabled?: boolean;
    };
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    return Boolean(
      doc.fullscreenEnabled ||
        doc.webkitFullscreenEnabled ||
        typeof docEl.requestFullscreen === 'function' ||
        typeof docEl.webkitRequestFullscreen === 'function'
    );
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  useEffect(() => {
    soundEngine.setMuted(muted);
    try {
      localStorage.setItem('quizduel_muted', String(muted));
    } catch {
      // ignore
    }
  }, [muted]);

  useEffect(() => {
    const unlockOnGesture = () => {
      soundEngine.unlock();
    };
    window.addEventListener('pointerdown', unlockOnGesture, { once: true, passive: true });
    window.addEventListener('keydown', unlockOnGesture, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnGesture);
      window.removeEventListener('keydown', unlockOnGesture);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('quizduel_theme', theme);
    } catch {
      // ignore storage failure
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0B1221' : '#FFFFFF');
    }
  }, [theme]);

  const initialRoomCode = useMemo(() => {
    const param = new URLSearchParams(window.location.search).get('room');
    return param ? param.trim().toUpperCase() : '';
  }, []);

  useEffect(() => {
    if (snapshot?.roomCode) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('room') !== snapshot.roomCode) {
        url.searchParams.set('room', snapshot.roomCode);
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [snapshot?.roomCode]);

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
    if (!next) {
      soundEngine.unlock();
      soundEngine.playChatPop();
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleToggleFullscreen = async () => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const docEl = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (typeof doc.exitFullscreen === 'function') {
          await doc.exitFullscreen();
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          await doc.webkitExitFullscreen();
        }
      } else {
        if (typeof docEl.requestFullscreen === 'function') {
          await docEl.requestFullscreen();
        } else if (typeof docEl.webkitRequestFullscreen === 'function') {
          await docEl.webkitRequestFullscreen();
        } else {
          setToastMessage('Full screen is not supported in this browser.');
        }
      }
    } catch {
      setToastMessage('Full screen is not supported in this browser.');
    }
  };

  const handleNavigateSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleTopBarPrimaryAction = () => {
    if (snapshot) {
      leaveRoom();
    } else {
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-white text-slate-900 dark:bg-[#0B1221] dark:text-slate-100 transition-colors duration-200">
      <TopBar
        inRoom={Boolean(snapshot)}
        roomCode={snapshot?.roomCode}
        muted={muted}
        theme={theme}
        isFullscreen={isFullscreen}
        fullscreenSupported={fullscreenSupported}
        onToggleMute={handleToggleMute}
        onToggleTheme={handleToggleTheme}
        onToggleFullscreen={handleToggleFullscreen}
        onPrimaryAction={handleTopBarPrimaryAction}
        onNavigateSection={handleNavigateSection}
      />

      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-slate-300 dark:border-white/15 bg-slate-900/95 dark:bg-slate-800 px-4 py-2 text-xs font-medium text-white shadow-lg"
        >
          {toastMessage}
        </div>
      )}

      <main
        ref={mainScrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      >
        {!snapshot ? (
          <LandingView
            initialRoomCode={initialRoomCode}
            connected={connected}
            error={error}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            nameInputRef={nameInputRef}
          />
        ) : snapshot.phase === 'LOBBY' ? (
          <LobbyView
            snapshot={snapshot}
            error={error}
            onUpdateSettings={updateSettings}
            onUpdateDeck={updateDeck}
            onStartMatch={startMatch}
            onKickPlayer={kickPlayer}
            onSendChat={sendChat}
          />
        ) : snapshot.phase === 'QUESTION' || snapshot.phase === 'REVEAL' ? (
          <ArenaView
            snapshot={snapshot}
            serverOffsetMs={serverOffsetMs}
            onLockAnswer={lockAnswer}
            onSkipAnswer={skipAnswer}
            onNextRound={nextRound}
            onKickPlayer={kickPlayer}
            onSendChat={sendChat}
          />
        ) : (
          <PodiumReviewView
            snapshot={snapshot}
            onRematch={rematch}
            onSendChat={sendChat}
          />
        )}

        <footer className="border-t border-slate-200 dark:border-white/10 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
          QuizDuel · Private MCQ Arena
        </footer>
      </main>
    </div>
  );
}
