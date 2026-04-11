import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  sessionId: string;
  turnId: number;
  incrementTurn: () => void;
  silenceTime: number;
  setSilenceTime: (time: number) => void;
  deletedSegments: DeletedSegment[];
  addDeletedSegment: (segment: DeletedSegment) => void;
  keystrokeEvents: KeystrokeEvent[];
  addKeystrokeEvent: (event: KeystrokeEvent) => void;
  clearKeystrokeEvents: () => void;
  typingRhythm: number[];
  updateTypingRhythm: (rhythm: number[]) => void;
  lastLLMResponseTime: number | null;
  setLastLLMResponseTime: (time: number | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId] = useState<string>(() => generateUUID());
  const [turnId, setTurnId] = useState(1);
  const [silenceTime, setSilenceTime] = useState(0);
  const [deletedSegments, setDeletedSegments] = useState<DeletedSegment[]>([]);
  const [keystrokeEvents, setKeystrokeEvents] = useState<KeystrokeEvent[]>([]);
  const [typingRhythm, setTypingRhythm] = useState<number[]>([3, 5, 4, 6, 3, 7, 4]);
  const [lastLLMResponseTime, setLastLLMResponseTime] = useState<number | null>(null);

  const incrementTurn = () => {
    setTurnId((prev) => prev + 1);
  };

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
        sessionId,
        turnId,
        incrementTurn,
        silenceTime,
        setSilenceTime,
        deletedSegments,
        addDeletedSegment,
        keystrokeEvents,
        addKeystrokeEvent,
        clearKeystrokeEvents,
        typingRhythm,
        updateTypingRhythm,
        lastLLMResponseTime,
        setLastLLMResponseTime,
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
