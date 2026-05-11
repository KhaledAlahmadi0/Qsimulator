import React from 'react';
import { Play } from 'lucide-react';

interface FooterProps {
  onSimulate: () => void;
  isDarkMode: boolean;
  isSimulating?: boolean;
}

export const Footer: React.FC<FooterProps> = ({ onSimulate, isDarkMode, isSimulating }) => {
  return (
    <footer className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t ${
      isDarkMode ? 'border-slate-800' : 'border-gray-200'
    }`}>
      <button
        onClick={onSimulate}
        disabled={isSimulating}
        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg hover:shadow-purple-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Play className="w-3.5 h-3.5" />
        {isSimulating ? 'Simulating…' : 'Simulate'}
      </button>

      <div className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs ${
        isDarkMode ? 'text-slate-500' : 'text-gray-400'
      }`}>
        <span>|Q⟩ Playground v1.0.0</span>
        <span>·</span>
        <span>Khaled Alahmadi</span>
        <span>·</span>
        <span>COE619 — MX Quantum Computing</span>
      </div>
    </footer>
  );
};
