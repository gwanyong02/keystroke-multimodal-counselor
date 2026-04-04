import { ChatInterface } from './components/ChatInterface';
import { StatusBar } from './components/StatusBar';
import { LiveAnalysis } from './components/LiveAnalysis';
import { SessionInfo } from './components/SessionInfo';
import { MentalWellness } from './components/MentalWellness';
import { SessionProvider } from './context/SessionContext';
import { Brain } from 'lucide-react';

export default function App() {
  return (
    <SessionProvider>
      <div className="size-full bg-[#1E1E1E] flex flex-col">
        {/* Header */}
        <header className="bg-[#252525] border-b border-gray-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 rounded-lg p-2">
              <Brain size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-white text-xl font-bold">KAI</h1>
              <p className="text-gray-400 text-sm">Multimodal AI Mental Counseling Platform</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex min-h-0">
          {/* Left Column - Chat Area (70%) */}
          <div className="flex-[7] flex flex-col min-w-0">
            <ChatInterface />
            <StatusBar />
          </div>

          {/* Right Column - Sidebar (30%) */}
          <div className="flex-[3] bg-[#252525] border-l border-gray-700 p-4 overflow-y-auto">
            <div className="space-y-4">
              <LiveAnalysis />
              <SessionInfo />
              <MentalWellness />
            </div>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}
