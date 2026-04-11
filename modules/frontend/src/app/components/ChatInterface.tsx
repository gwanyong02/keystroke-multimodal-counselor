import { useState, useEffect, useRef } from 'react';
import { Send, Video, VideoOff } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { useKeystrokeLogger } from '../hooks/useKeystrokeLogger';
import { useTextCapture } from '../hooks/useTextCapture';
import { useSilenceMonitor } from '../hooks/useSilenceMonitor';
import { useWebcam } from '../hooks/useWebcam';

interface Message {
  id: string;
  sender: 'KAI' | 'User';
  text: string;
  timestamp: Date;
}

export function ChatInterface() {
  const {
    sessionId,
    turnId,
    incrementTurn,
    clearKeystrokeEvents,
    setLastLLMResponseTime,
  } = useSession();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'KAI',
      text: '안녕하세요! 저는 KAI입니다. 오늘 기분이 어떠신가요?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 커스텀 훅들 통합
  const { getKeystrokeOutput } = useKeystrokeLogger(inputRef);
  const { getTextOutput } = useTextCapture(inputRef);
  const { stream: webcamStream, error: webcamError } = useWebcam();

  // 침묵 모니터 (침묵 감지 시 자동으로 LLM 호출)
  useSilenceMonitor({
    inputRef,
    onSilenceDetected: (silenceEvent) => {
      console.log('[Chat] Silence event detected:', silenceEvent);

      // TODO: 박관용(A)의 파이프라인에 silence_event 전송
      // 여기서는 일단 UI에 메시지 표시
      const silenceMessage: Message = {
        id: Date.now().toString(),
        sender: 'KAI',
        text: `말하기 어려운 부분이 있으신가요? 천천히 편하게 말씀해 주세요. (${silenceEvent.silence_duration_sec.toFixed(1)}초간 침묵 감지)`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, silenceMessage]);
      setLastLLMResponseTime(Date.now());
    },
  });

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      // 모든 멀티모달 데이터 수집
      const keystrokeOutput = getKeystrokeOutput();
      const textOutput = getTextOutput(inputValue);

      // 콘솔에 출력 (디버깅용)
      console.log('[Chat] Sending message with multimodal data:');
      console.log('- Session ID:', sessionId);
      console.log('- Turn ID:', turnId);
      console.log('- Keystroke Output:', keystrokeOutput);
      console.log('- Text Output:', textOutput);

      // TODO: 박관용(A)의 파이프라인에 데이터 전송
      // 예: await sendToBackend({ keystroke: keystrokeOutput, text: textOutput })

      // UI 업데이트
      const newMessage: Message = {
        id: Date.now().toString(),
        sender: 'User',
        text: inputValue,
        timestamp: new Date(),
      };
      setMessages([...messages, newMessage]);
      setInputValue('');
      clearKeystrokeEvents();
      incrementTurn();

      // Mock AI response
      setTimeout(() => {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          sender: 'KAI',
          text: '말씀하신 내용을 잘 들었습니다. 지금 힘든 감정을 느끼고 계시는 것 같네요. 더 자세히 말씀해 주시겠어요?',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiResponse]);
        setLastLLMResponseTime(Date.now());
      }, 1500);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Webcam Status Indicator */}
      <div className="bg-[#252525] border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            {webcamStream ? (
              <>
                <Video size={14} className="text-green-400" />
                <span className="text-green-400">웹캠 활성화</span>
              </>
            ) : webcamError ? (
              <>
                <VideoOff size={14} className="text-red-400" />
                <span className="text-red-400">웹캠 오류: {webcamError}</span>
              </>
            ) : (
              <>
                <VideoOff size={14} className="text-yellow-400" />
                <span className="text-yellow-400">웹캠 초기화 중...</span>
              </>
            )}
          </div>
          <div className="text-xs text-gray-500">
            Session: {sessionId.slice(0, 8)}... | Turn: {turnId}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'User' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                message.sender === 'User'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2A2A2A] text-gray-100'
              }`}
            >
              <div className="text-xs opacity-70 mb-1">{message.sender}</div>
              <div className="text-sm leading-relaxed">{message.text}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-700 p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={3}
            className="flex-1 bg-[#2A2A2A] text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 resize-none"
          />
          <button
            onClick={handleSend}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 py-3 transition-colors flex items-center gap-2 self-end"
          >
            <Send size={18} />
            전송
          </button>
        </div>
      </div>
    </div>
  );
}
