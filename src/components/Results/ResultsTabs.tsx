import React, { useState } from 'react';
import { Loader2, Activity, GitBranch, BarChart2, ArrowDownUp } from 'lucide-react';
import { BarChart } from '../Charts/BarChart';

type SortOrder = 'bitstring' | 'probability';

interface StateRow { idx: string; state: string; bar: string; prob: string; }

function parseStateRows(text: string): StateRow[] | null {
  const rows: StateRow[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)?\s*(\|[\w⟩|)]+)\s+([█░]+)\s+([\d.]+%?)(?:\s+chance)?$/);
    if (m) {
      rows.push({ idx: m[1] ?? String(rows.length + 1), state: m[2], bar: m[3], prob: m[4] });
    } else {
      return null;
    }
  }
  return rows.length ? rows : null;
}

const StateVectorGrid: React.FC<{
  text: string;
  isDarkMode: boolean;
  sortOrder: SortOrder;
}> = ({ text, isDarkMode, sortOrder }) => {
  const rawRows = parseStateRows(text);

  if (!rawRows) {
    return (
      <pre className={`text-xs font-mono whitespace-pre-wrap overflow-auto max-h-52 leading-relaxed ${
        isDarkMode ? 'text-slate-300' : 'text-gray-700'
      }`}>{text}</pre>
    );
  }

  const rows = [...rawRows].sort((a, b) =>
    sortOrder === 'probability'
      ? parseFloat(b.prob) - parseFloat(a.prob)
      : a.state.localeCompare(b.state)
  );

  const dim       = isDarkMode ? 'text-slate-500'  : 'text-gray-400';
  const stateColor = isDarkMode ? 'text-purple-300' : 'text-purple-600';
  const probColor  = isDarkMode ? 'text-slate-300'  : 'text-gray-700';
  const barFill    = isDarkMode ? 'bg-purple-600/70' : 'bg-purple-400/70';
  const barTrack   = isDarkMode ? 'bg-slate-700'    : 'bg-gray-200';

  const filledCount = (s: string) => (s.match(/█/g) ?? []).length;
  const totalCount  = (s: string) => s.length;
  const maxTotal = Math.max(...rows.map(r => totalCount(r.bar)), 1);

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 overflow-auto max-h-52">
      {rows.map((r) => (
        <div key={r.idx} className="flex items-center gap-2 py-0.5">
          <span className={`text-xs font-mono w-5 text-right shrink-0 ${dim}`}>{r.idx}</span>
          <span className={`text-xs font-mono shrink-0 ${stateColor}`}>{r.state}</span>
          <div className={`flex-1 h-2 rounded-full ${barTrack} overflow-hidden min-w-0`}>
            <div
              className={`h-full rounded-full ${barFill}`}
              style={{ width: `${(filledCount(r.bar) / maxTotal) * 100}%` }}
            />
          </div>
          <span className={`text-xs font-mono w-14 text-right shrink-0 ${probColor}`}>{r.prob}</span>
        </div>
      ))}
    </div>
  );
};

interface ResultsTabsProps {
  stateVectorOutput: string;
  tensorNetworkOutput: string;
  plotProbs?: Record<string, number>;
  isLoading: boolean;
  isDarkMode: boolean;
}

type TabId = 'state-vector' | 'tensor-network' | 'plot';

const TABS: { id: TabId; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'state-vector',   label: 'State Vector',   Icon: Activity   },
  { id: 'tensor-network', label: 'Tensor Network', Icon: GitBranch  },
  { id: 'plot',           label: 'Plot',           Icon: BarChart2  },
];

export const ResultsTabs: React.FC<ResultsTabsProps> = ({
  stateVectorOutput,
  tensorNetworkOutput,
  plotProbs,
  isLoading,
  isDarkMode,
}) => {
  const [activeTab,  setActiveTab]  = useState<TabId>('state-vector');
  const [sortOrder,  setSortOrder]  = useState<SortOrder>('bitstring');

  const cardBase = isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200';

  const textContent =
    activeTab === 'state-vector'   ? stateVectorOutput  :
    activeTab === 'tensor-network' ? tensorNetworkOutput : '';

  const toggleSort = () =>
    setSortOrder(s => s === 'bitstring' ? 'probability' : 'bitstring');

  const sortLabel = sortOrder === 'probability' ? 'By Prob.' : 'By Bit';

  const pillBase = `flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium
    transition-colors border`;
  const pillClr = isDarkMode
    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
    : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200';

  return (
    <div className={`rounded-2xl border shadow-xl overflow-hidden ${cardBase}`}>
      {/* Tab Bar */}
      <div className={`flex items-center border-b ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
        <div className="flex flex-1">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-xs font-medium transition-colors ${
                  isActive
                    ? isDarkMode
                      ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-900/40'
                      : 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                    : isDarkMode
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Sort toggle */}
        <div className="px-2 shrink-0">
          <button onClick={toggleSort} className={`${pillBase} ${pillClr}`}>
            <ArrowDownUp className="w-3 h-3" />
            {sortLabel}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 min-h-[100px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 gap-3">
            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
            <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              Simulating…
            </span>
          </div>
        ) : activeTab === 'plot' ? (
          plotProbs && Object.keys(plotProbs).length > 0 ? (
            <BarChart
              data={plotProbs}
              mode="probability"
              isDarkMode={isDarkMode}
              sortOrder={sortOrder}
            />
          ) : (
            <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
              <BarChart2 className="w-8 h-8 opacity-40" />
              <p className="text-xs text-center">Run a simulation to see the probability plot</p>
            </div>
          )
        ) : textContent ? (
          <StateVectorGrid text={textContent} isDarkMode={isDarkMode} sortOrder={sortOrder} />
        ) : (
          <div className={`flex flex-col items-center justify-center py-8 gap-2 ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
            <Activity className="w-8 h-8 opacity-40" />
            <p className="text-xs text-center">Run a simulation to see results here</p>
          </div>
        )}
      </div>
    </div>
  );
};
