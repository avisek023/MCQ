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
    nextRound,
    rematch,
    sendChat,
  } = useQuizSocket();

  const [muted, setMuted] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('quizduel_theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const nameInputRef = useRef<HTMLInputElement | null>(null);

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
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
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
    <div className="min-h-dvh flex flex-col bg-white text-slate-900 dark:bg-[#0B1221] dark:text-slate-100 transition-colors duration-200">
      <TopBar
        inRoom={Boolean(snapshot)}
        roomCode={snapshot?.roomCode}
        muted={muted}
        theme={theme}
        onToggleMute={handleToggleMute}
        onToggleTheme={handleToggleTheme}
        onPrimaryAction={handleTopBarPrimaryAction}
        onNavigateSection={handleNavigateSection}
      />

      <div className="flex-1">
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
      </div>

      <footer className="border-t border-slate-200 dark:border-white/10 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
        QuizDuel · Private MCQ Arena
      </footer>
    </div>
  );
}
