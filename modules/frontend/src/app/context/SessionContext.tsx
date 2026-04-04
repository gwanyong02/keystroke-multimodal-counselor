import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';

interface DeletedSegment {
  text: string;
  deleted_at: number;
}

interface KeystrokeEvent {
  type: 'keydown' | 'keyup';
  key: string;
  timestamp: number;
  is_delete: boolean;
}

interface SessionContextType {
  silenceTime: number;
  setSilenceTime: (time: number) => void;
  deletedSegments: DeletedSegment[];
  addDeletedSegment: (segment: DeletedSegment) => void;
  keystrokeEvents: KeystrokeEvent[];
  addKeystrokeEvent: (event: KeystrokeEvent) => void;
  clearKeystrokeEvents: () => void;
  typingRhythm: number[];
  updateTypingRhythm: (rhythm: number[]) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [silenceTime, setSilenceTime] = useState(0);
  const [deletedSegments, setDeletedSegments] = useState<DeletedSegment[]>([]);
  const [keystrokeEvents, setKeystrokeEvents] = useState<KeystrokeEvent[]>([]);
  const [typingRhythm, setTypingRhythm] = useState<number[]>([3, 5, 4, 6, 3, 7, 4]);

  const addDeletedSegment = (segment: DeletedSegment) => {
    setDeletedSegments((prev) => [...prev.slice(-3), segment]);
  };

  const addKeystrokeEvent = (event: KeystrokeEvent) => {
    setKeystrokeEvents((prev) => [...prev, event]);
  };

  const clearKeystrokeEvents = () => {
    setKeystrokeEvents([]);
    setDeletedSegments([]);
  };

  const updateTypingRhythm = (rhythm: number[]) => {
    setTypingRhythm(rhythm);
  };

  // 타이핑 리듬을 키스트로크 이벤트에서 계산
  useEffect(() => {
    if (keystrokeEvents.length >= 2) {
      const recentEvents = keystrokeEvents.slice(-10).filter((e) => e.type === 'keydown');
      if (recentEvents.length >= 2) {
        const intervals = [];
        for (let i = 1; i < recentEvents.length; i++) {
          const iki = (recentEvents[i].timestamp - recentEvents[i - 1].timestamp) * 1000;
          intervals.push(Math.min(iki / 100, 10));
        }
        setTypingRhythm(intervals.slice(-7));
      }
    }
  }, [keystrokeEvents]);

  return (
    <SessionContext.Provider
      value={{
        silenceTime,
        setSilenceTime,
        deletedSegments,
        addDeletedSegment,
        keystrokeEvents,
        addKeystrokeEvent,
        clearKeystrokeEvents,
        typingRhythm,
        updateTypingRhythm,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
