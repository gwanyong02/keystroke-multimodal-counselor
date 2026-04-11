import { useState, useEffect } from 'react';
import { Video } from 'lucide-react';

interface EmotionScore {
  label: string;
  value: number;
  color: string;
}

export function LiveAnalysis() {
  const [emotions, setEmotions] = useState<EmotionScore[]>([
    { label: 'sad', value: 72, color: 'bg-blue-500' },
    { label: 'anxious', value: 18, color: 'bg-yellow-500' },
    { label: 'neutral', value: 10, color: 'bg-gray-500' },
  ]);

  const emotionLabels: Record<string, string> = {
    sad: '슬픔',
    angry: '분노',
    happy: '기쁨',
    neutral: '중립',
    surprised: '놀람',
    fearful: '두려움',
    anxious: '불안',
  };

  // Mock emotion updates (실제로는 Vision Module에서 0.2초마다 업데이트)
  useEffect(() => {
    const interval = setInterval(() => {
      setEmotions((prev) =>
        prev.map((emotion) => ({
          ...emotion,
          value: Math.max(5, Math.min(95, emotion.value + (Math.random() - 0.5) * 10)),
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const topEmotions = emotions
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return (
    <div className="bg-[#2A2A2A] rounded-lg p-4">
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
        <Video size={18} className="text-blue-400" />
        실시간 분석
      </h3>

      <div className="relative bg-[#1A1A1A] rounded-lg aspect-video mb-3 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-purple-900/20" />
        <Video size={48} className="text-gray-600" />
        <div className="absolute top-2 right-2 bg-red-500 rounded-full w-3 h-3 animate-pulse" />

        {/* Emotion overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <div className="text-xs text-gray-300">
            Peak: <span className="text-white font-semibold">{emotionLabels[topEmotions[0].label]}</span>
            {' '}
            <span className="text-blue-400">{topEmotions[0].value.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-gray-400 mb-2">감정 분석 (Vision Module)</div>
        {topEmotions.map((emotion) => (
          <div key={emotion.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300">{emotionLabels[emotion.label]}</span>
              <span className="text-white font-semibold">{emotion.value.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-[#1A1A1A] rounded-full overflow-hidden">
              <div
                className={`h-full ${emotion.color} transition-all duration-500`}
                style={{ width: `${emotion.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
