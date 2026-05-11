import React from 'react';

interface BarChartProps {
  data: Record<string, number>;
  mode: 'probability' | 'counts';
  isDarkMode: boolean;
  sortOrder?: 'bitstring' | 'probability';
}

/** Switch to horizontal layout above this many bars */
const VERTICAL_THRESHOLD = 8;
const Y_TICKS = 5;

export const BarChart: React.FC<BarChartProps> = ({ data, mode, isDarkMode, sortOrder = 'bitstring' }) => {
  const entries = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort((a, b) =>
      sortOrder === 'probability'
        ? b[1] - a[1]
        : a[0].localeCompare(b[0])
    );

  if (!entries.length) return null;

  const maxVal = Math.max(...entries.map(([, v]) => v));
  const isHorizontal = entries.length > VERTICAL_THRESHOLD;

  const fmt = (v: number) =>
    mode === 'probability' ? `${(v * 100).toFixed(1)}%` : v.toLocaleString();

  // ── shared theme tokens ──────────────────────────────────────────────────
  const bg        = isDarkMode ? 'bg-slate-900'    : 'bg-white';
  const gridClr   = isDarkMode ? '#334155'         : '#e5e7eb';
  const axisClr   = isDarkMode ? '#64748b'         : '#9ca3af';
  const labelClr  = isDarkMode ? 'text-purple-300' : 'text-purple-600';
  const tickClr   = isDarkMode ? 'text-slate-500'  : 'text-gray-400';
  const titleClr  = isDarkMode ? 'text-slate-500'  : 'text-gray-400';
  const trackClr  = isDarkMode ? 'bg-slate-800'    : 'bg-gray-100';
  const barGrad   = isDarkMode
    ? 'from-purple-600 to-blue-500'
    : 'from-purple-500 to-blue-400';
  const tooltipBg = isDarkMode
    ? 'bg-slate-800 border-slate-700 text-slate-200'
    : 'bg-white border-gray-200 text-gray-700';

  // ── HORIZONTAL layout (many bars) ───────────────────────────────────────
  if (isHorizontal) {
    return (
      <div className={`rounded-xl p-4 ${bg}`}>
        <div className="flex justify-between mb-2 px-1">
          <span className={`text-[9px] font-mono ${titleClr}`}>Bitstring</span>
          <span className={`text-[9px] font-mono ${titleClr}`}>
            {mode === 'probability' ? 'Probability' : 'Counts'}
          </span>
        </div>

        <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 320 }}>
          {entries.map(([key, val]) => {
            const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
            return (
              <div key={key} className="group flex items-center gap-2">
                <span className={`text-[9px] font-mono shrink-0 w-[6.5rem] text-right ${labelClr}`}>
                  |{key}⟩
                </span>
                <div className={`flex-1 h-3.5 rounded-sm ${trackClr} overflow-hidden relative`}>
                  <div
                    className={`h-full rounded-sm bg-gradient-to-r ${barGrad} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className={`
                    absolute inset-y-0 right-1 flex items-center text-[9px] font-mono
                    opacity-0 group-hover:opacity-100 transition-opacity
                    ${isDarkMode ? 'text-slate-300' : 'text-gray-600'}
                  `}>
                    {fmt(val)}
                  </div>
                </div>
                <span className={`text-[9px] font-mono shrink-0 w-12 text-right tabular-nums ${tickClr}`}>
                  {fmt(val)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-2 h-px w-full" style={{ backgroundColor: axisClr }} />
        <p className={`text-[9px] text-center mt-1 ${titleClr}`}>
          {entries.length} bitstrings &mdash;{' '}
          {mode === 'probability' ? 'Bitstring Probabilities' : 'Measurement Counts'}
        </p>
      </div>
    );
  }

  // ── VERTICAL layout (few bars) ───────────────────────────────────────────
  const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => (maxVal * i) / Y_TICKS);
  const CHART_H = 160;

  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className="relative flex gap-2">
        <div
          className="flex flex-col-reverse justify-between shrink-0 pb-6"
          style={{ height: CHART_H + 24 }}
        >
          {ticks.map((t, i) => (
            <span key={i} className={`text-[9px] font-mono leading-none ${tickClr}`}>
              {fmt(t)}
            </span>
          ))}
        </div>

        <div className="flex-1 min-w-0 relative">
          <svg
            className="absolute inset-0 w-full pointer-events-none"
            style={{ height: CHART_H }}
            preserveAspectRatio="none"
          >
            {ticks.map((_, i) => (
              <line
                key={i}
                x1="0" y1={`${((Y_TICKS - i) / Y_TICKS) * 100}%`}
                x2="100%" y2={`${((Y_TICKS - i) / Y_TICKS) * 100}%`}
                stroke={gridClr}
                strokeWidth="1"
                strokeDasharray={i === 0 ? '0' : '3 3'}
              />
            ))}
          </svg>

          <div className="relative flex items-end gap-1" style={{ height: CHART_H }}>
            {entries.map(([key, val]) => {
              const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
              return (
                <div
                  key={key}
                  className="group flex-1 flex flex-col items-center justify-end h-full"
                >
                  <div className={`
                    absolute bottom-full mb-1 px-2 py-0.5 rounded text-[10px] font-mono
                    shadow-lg border opacity-0 group-hover:opacity-100 transition-opacity z-10
                    pointer-events-none whitespace-nowrap ${tooltipBg}
                  `}>
                    |{key}⟩ = {fmt(val)}
                  </div>
                  <div
                    className={`bg-gradient-to-t ${barGrad} rounded-t-md transition-all duration-500`}
                    style={{ height: `${pct}%`, width: '60%', minHeight: pct > 0 ? 2 : 0 }}
                  />
                </div>
              );
            })}
          </div>

          <div className="w-full h-px" style={{ backgroundColor: axisClr }} />

          <div className="flex gap-1 mt-1">
            {entries.map(([key]) => (
              <div key={key} className={`flex-1 text-center text-[9px] font-mono truncate ${labelClr}`}>
                |{key}⟩
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-2 px-8">
        <span className={`text-[9px] ${titleClr}`}>
          {mode === 'probability' ? 'Probability' : 'Counts'}
        </span>
        <span className={`text-[9px] ${titleClr}`}>Bitstring</span>
      </div>
    </div>
  );
};
