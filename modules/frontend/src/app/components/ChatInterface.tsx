import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useSession } from '../context/SessionContext';

interface Message {
  id: string;
  sender: 'KAI' | 'User';
  text: string;
  timestamp: Date;
}

export function ChatInterface() {
  const {
    sessionId, //가명처리 ID
    turnId,
    setSilenceTime,
    addDeletedSegment,
    addKeystrokeEvent,
    clearKeystrokeEvents,
    sendSilenceEvent 
  } = useSession();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'KAI',
      text: '안녕하세요. 무엇을 도와드릴까요?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [lastInputTime, setLastInputTime] = useState(Date.now());
  const prevTextRef = useRef('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 화면 하단 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Silence Monitor: 0.2초 간격 폴링 및 8초 임계값 적용
  useEffect(() => {
    const tick = 200; 
    const limit = 8;
    let hasSent = false;

    const monitor = setInterval(() => {
      const now = Date.now();
      
      if (inputValue !== prevTextRef.current) {
        // 텍스트 변화가 있으면 타이머 리셋
        setLastInputTime(now);
        hasSent = false;
        prevTextRef.current = inputValue;
        setSilenceTime(0);
      } else {
        // 변화 없으면 침묵 시간 계산
        const duration = (now - lastInputTime) / 1000;
        setSilenceTime(duration);

        // 8초 초과 시 이벤트 발송 (중복 방지)
        if (duration >= limit && !hasSent) {
          hasSent = true;
          triggerSilence(duration);
        }
      }
    }, tick);

    return () => clearInterval(monitor);
  }, [inputValue, lastInputTime]);

  const triggerSilence = (duration: number) => {
    const silenceContext = inputValue.trim().length > 0 ? "mid_typing" : "after_llm_response";
    const eventData = {
      session_id: sessionId,
      turn_id: turnId,
      type: "silence_event",
      silence_duration_sec: parseFloat(duration.toFixed(3)),
      last_keystroke_at: lastInputTime / 1000,
      context: silenceContext,
      timestamp: Date.now() / 1000
    };

    // 실시간 데이터 전파
    if (sendSilenceEvent) sendSilenceEvent(eventData);

    // 채팅창 알림 메시지 추가
    const silenceMsg: Message = {
      id: `silence-${Date.now()}`,
      sender: 'KAI',
      text: "말씀하기 어려운 부분이 있으신가요? 천천히 말씀해 주셔도 괜찮습니다.",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, silenceMsg]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    addKeystrokeEvent({
      type: 'keydown',
      key: e.key,
      timestamp: Date.now() / 1000,
      is_delete: e.key === 'Backspace' || e.key === 'Delete',
    });

    // 삭제된 텍스트 추적 (단어 단위 추출)
    if (e.key === 'Backspace' && inputValue.trim().length > 0) {
      const segments = inputValue.trim().split(' ');
      const target = segments[segments.length - 1];
      
      if (target.length >= 2) {
        addDeletedSegment({
          text: target,
          deleted_at: Date.now() / 1000,
        });
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    addKeystrokeEvent({
      type: 'keyup',
      key: e.key,
      timestamp: Date.now() / 1000,
      is_delete: e.key === 'Backspace' || e.key === 'Delete',
    });
  };

  const onSend = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'User',
      text: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    clearKeystrokeEvents();
    setSilenceTime(0);
    setLastInputTime(Date.now());

    // 상담사 응답 (Mock)
    setTimeout(() => {
      const aiReply: Message = {
        id: `kai-${Date.now()}`,
        sender: 'KAI',
        text: '그렇군요. 조금 더 자세히 들려주실 수 있을까요?',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiReply]);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-[#1A1A1A]">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.sender === 'User' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                m.sender === 'User'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2A2A2A] text-gray-200 border border-gray-700'
              }`}
            >
              <div className="text-[10px] uppercase opacity-40 mb-0.5">
                {m.sender}
              </div>
              <div className="text-[14px] leading-snug">{m.text}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-[#1A1A1A] border-t border-gray-800">
        <div className="flex gap-2 max-w-5xl mx-auto">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            placeholder="메시지를 입력하세요..."
            className="flex-1 bg-[#252525] text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700 transition-all placeholder-gray-600"
          />
          <button
            onClick={onSend}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-3 transition-opacity flex items-center gap-2"
          >
            <Send size={16} />
            <span className="text-sm font-medium">전송</span>
          </button>
        </div>
      </div>
    </div>
  );
}