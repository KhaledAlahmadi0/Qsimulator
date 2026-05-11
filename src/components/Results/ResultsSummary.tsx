import React from 'react';
import { QuantumResults } from '../../types/quantum';

const MAX_DISPLAY_QUBITS = 14;

interface ResultsSummaryProps {
  results: QuantumResults;
  isDarkMode: boolean;
  qubits: number;
}

export const ResultsSummary: React.FC<ResultsSummaryProps> = ({ results, isDarkMode, qubits }) => {
  const tooLarge = qubits > MAX_DISPLAY_QUBITS;

  const cardClr = isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200';
  const dimClr  = isDarkMode ? 'text-slate-500' : 'text-gray-400';

  return (
    <div className={`rounded-2xl p-6 border shadow-xl ${cardClr}`}>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${tooLarge ? 'bg-slate-500' : 'bg-purple-400'}`} />
        Simulation Results
      </h2>

      {tooLarge ? (
        <div className={`flex flex-col items-center justify-center py-6 gap-2 ${dimClr}`}>
          <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <p className="text-xs text-center">
            State list disabled above {MAX_DISPLAY_QUBITS} qubits
            <br />
            <span className="opacity-60">({qubits} qubits = 2<sup>{qubits}</sup> = {(2 ** qubits).toLocaleString()} states)</span>
          </p>
          <p className="text-[10px] opacity-50 text-center">Use the Plot tab to view results</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.probabilities.map((result, index) => (
            <div key={index} className="flex items-center gap-4">
              <div className="text-sm font-mono w-8 text-purple-400">{index + 1}</div>
              <div className="font-mono text-sm w-32">{result.state}</div>
              <div className="flex-1 relative">
                <div className={`h-6 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-gray-100'}`}>
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-1000 ease-out"
                    style={{ width: `${result.probability * 100}%` }}
                  />
                </div>
              </div>
              <div className="text-sm font-semibold w-16 text-right">
                {(result.probability * 100).toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};