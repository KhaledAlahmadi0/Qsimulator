import React, { useState } from 'react';
import { Copy, Play, Check, RefreshCw, Loader2 } from 'lucide-react';
import { BarChart } from '../Charts/BarChart';
import { useToast } from '../Toast/ToastProvider';
import { CodeFormat, CodeOutputs } from '../../types/quantum';

interface CodeTabsProps {
  codeOutputs: CodeOutputs;
  /** Simulation text output — stored separately so the code is never overwritten */
  simOutputs:  Partial<Record<CodeFormat, string>>;
  /** Structured counts data per format for native chart rendering */
  countOutputs: Partial<Record<CodeFormat, Record<string, number>>>;
  onGenerate: (format: CodeFormat) => Promise<void>;
  onSimulate: (format: CodeFormat) => Promise<void>;
  isDarkMode: boolean;
}

const CODE_TABS: { id: CodeFormat; label: string; canSimulate: boolean }[] = [
  { id: 'qasm',      label: 'QASM',      canSimulate: true  },
  { id: 'qiskit',    label: 'Qiskit',    canSimulate: true  },
  { id: 'cirq',      label: 'Cirq',      canSimulate: true  },
  { id: 'cudaq',     label: 'CudaQ',     canSimulate: false },
  { id: 'braket',    label: 'Braket',    canSimulate: true  },
  { id: 'pennylane', label: 'PennyLane', canSimulate: true  },
];

const PLACEHOLDERS: Record<CodeFormat, string> = {
  qasm:      'Click "Generate" or run a simulation to produce QASM.',
  qiskit:    'Click "Generate" to produce Qiskit code, then "Simulate" to run it.',
  cirq:      'Click "Generate" to produce Cirq code, then "Simulate" to run it.',
  cudaq:     'Click "Generate" to produce CUDA-Q code.',
  braket:    'Click "Generate" to produce Braket code, then "Simulate" to run it.',
  pennylane: 'Click "Generate" to produce PennyLane code, or "Simulate" to run the circuit.',
};

export const CodeTabs: React.FC<CodeTabsProps> = ({
  codeOutputs,
  simOutputs,
  countOutputs,
  onGenerate,
  onSimulate,
  isDarkMode,
}) => {
  const [activeTab,     setActiveTab]     = useState<CodeFormat>('qasm');
  const [copied,        setCopied]        = useState(false);
  const [actionLoading, setActionLoading] = useState<'generate' | 'simulate' | null>(null);
  const { showToast } = useToast();

  const tabInfo    = CODE_TABS.find(t => t.id === activeTab)!;
  const code       = codeOutputs[activeTab];
  const simOut     = simOutputs[activeTab]   ?? '';
  const counts     = countOutputs[activeTab] ?? {};
  const hasCode    = Boolean(code?.trim());
  const hasSimOut  = Boolean(simOut.trim());
  const hasCounts  = Object.keys(counts).length > 0;

  const cardBase = isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200';

  const handleCopy = async () => {
    const text = [code, simOut].filter(Boolean).join('\n\n--- Output ---\n\n');
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const handleGenerate = async () => {
    setActionLoading('generate');
    try { await onGenerate(activeTab); } finally { setActionLoading(null); }
  };

  const handleSimulate = async () => {
    setActionLoading('simulate');
    try { await onSimulate(activeTab); } finally { setActionLoading(null); }
  };

  return (
    <div className={`rounded-2xl border shadow-xl overflow-hidden ${cardBase}`}>
      {/* Tab Bar */}
      <div className={`flex border-b overflow-x-auto scrollbar-none ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
        {CODE_TABS.map(tab => {
          const isActive  = activeTab === tab.id;
          const hasOutput = Boolean(simOutputs[tab.id]?.trim() || Object.keys(countOutputs[tab.id] ?? {}).length);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors shrink-0 relative ${
                isActive
                  ? isDarkMode
                    ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900/40'
                    : 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {/* green dot if this tab has simulation output */}
              {hasOutput && (
                <span className="absolute top-1.5 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4 space-y-3">
        {/* Action Row */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={actionLoading !== null}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {actionLoading === 'generate'
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />
            }
            Generate
          </button>

          {tabInfo.canSimulate && (
            <button
              onClick={handleSimulate}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white transition-all disabled:opacity-50"
            >
              {actionLoading === 'simulate'
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Play className="w-3 h-3" />
              }
              Simulate
            </button>
          )}

          <button
            onClick={handleCopy}
            disabled={!hasCode && !hasSimOut}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto transition-colors disabled:opacity-40 ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {copied
              ? <><Check className="w-3 h-3 text-emerald-400" /> Copied!</>
              : <><Copy className="w-3 h-3" /> Copy</>
            }
          </button>
        </div>

        {/* ── Generated code block ── */}
        <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-gray-50 border-gray-200'}`}>
          {hasCode && (
            <div className={`px-3 py-1 text-[10px] font-medium border-b ${isDarkMode ? 'border-slate-800 text-slate-500' : 'border-gray-200 text-gray-400'}`}>
              Generated Code
            </div>
          )}
          <pre className={`p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-52 leading-relaxed ${
            hasCode
              ? isDarkMode ? 'text-slate-200' : 'text-gray-800'
              : isDarkMode ? 'text-slate-600 italic' : 'text-gray-400 italic'
          }`}>
            {code || PLACEHOLDERS[activeTab]}
          </pre>
        </div>

        {/* ── Simulation text output (independent section) ── */}
        {hasSimOut && (
          <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-gray-50 border-gray-300'}`}>
            <div className={`px-3 py-1 text-[10px] font-medium border-b ${isDarkMode ? 'border-slate-700 text-emerald-400' : 'border-gray-300 text-emerald-600'}`}>
              Simulation Output — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </div>
            <pre className={`p-4 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-48 leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-800'}`}>
              {simOut}
            </pre>
          </div>
        )}

        {/* ── Native counts chart ── */}
        {hasCounts && (
          <div className={`rounded-xl overflow-hidden border ${isDarkMode ? 'border-slate-700' : 'border-gray-300'}`}>
            <div className={`px-3 py-1 text-[10px] font-medium border-b ${isDarkMode ? 'border-slate-700 text-emerald-400' : 'border-gray-300 text-emerald-600'}`}>
              Results — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </div>
            <div className="px-4 pb-3 pt-2">
              <BarChart
                data={counts}
                mode={activeTab === 'pennylane' ? 'probability' : 'counts'}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
