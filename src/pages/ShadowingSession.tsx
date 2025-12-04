import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function ShadowingSession({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-white">
      <header className="absolute top-0 left-0 right-0 p-6">
        <button onClick={onBack} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500">
          Shadowing Session
        </h1>
        <p className="text-white/50">Ready for redesign.</p>
      </div>
    </div>
  );
}
