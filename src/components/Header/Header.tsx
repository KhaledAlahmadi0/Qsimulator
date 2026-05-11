import React from 'react';
import { Play, Moon, Sun, Loader2 } from 'lucide-react';

interface HeaderProps {
  onSimulate: () => void;
  shots: number;
  qubits: number;
  depth: number;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isSimulating?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onSimulate,
  shots,
  qubits,
  depth,
  isDarkMode,
  onToggleTheme,
  isSimulating,
}) => {
  const chipBase = isDarkMode
    ? 'bg-slate-800/80 border border-slate-700 text-slate-300'
    : 'bg-white border border-gray-200 text-gray-600';

  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <img
            src={isDarkMode ? '/logo.png' : '/logo-light.png'}
            alt="|Q⟩ Playground logo"
            className="h-9 w-auto object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent leading-none">
              Q⟩ Playground
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                Sponsored by
              </p>
              <img
                src={isDarkMode ? '/sponsor.svg' : '/sponsor-alt.svg'}
                alt="Sponsor"
                className="h-4 w-auto object-contain opacity-70"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-600' : 'text-gray-300'}`}>
              Designed by Khaled Alahmadi
            </p>
          </div>
        </div>

        <button
          onClick={onToggleTheme}
          className={`p-2 rounded-lg transition-all hover:scale-105 ${
            isDarkMode
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
              : 'bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 border border-gray-200 shadow-sm'
          }`}
          aria-label={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* KPI Chips + Simulate */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex gap-2">
          {[
            { label: 'Shots',  value: shots.toLocaleString() },
            { label: 'Qubits', value: String(qubits)         },
            { label: 'Depth',  value: String(depth)          },
          ].map(({ label, value }) => (
            <div key={label} className={`px-3 py-1.5 rounded-full text-xs font-medium ${chipBase}`}>
              <span className="opacity-60">{label}: </span>
              <span className="font-mono font-semibold">{value}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onSimulate}
          disabled={isSimulating}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-xl font-semibold text-sm text-white transition-all duration-200 shadow-lg hover:shadow-purple-500/30 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isSimulating
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Play className="w-4 h-4" />
          }
          {isSimulating ? 'Simulating…' : 'Simulate'}
        </button>
      </div>
    </header>
  );
};
