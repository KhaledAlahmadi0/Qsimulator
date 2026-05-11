import React, { useRef, useState, useCallback, useMemo } from 'react';
import { RotateCcw, RotateCw, Trash2, Download, Plus, Minus, Shuffle } from 'lucide-react';
import { GateCell } from '../../types/quantum';

// ─── Gate palette ─────────────────────────────────────────────────────────────

const SINGLE_QUBIT_ROW: { name: string; label: string; cls: string }[] = [
  { name: 'H',  label: 'Hadamard', cls: 'bg-purple-600 hover:bg-purple-500' },
  { name: 'X',  label: 'Pauli-X',  cls: 'bg-blue-600   hover:bg-blue-500'   },
  { name: 'Y',  label: 'Pauli-Y',  cls: 'bg-blue-500   hover:bg-blue-400'   },
  { name: 'Z',  label: 'Pauli-Z',  cls: 'bg-blue-700   hover:bg-blue-600'   },
  { name: 'S',  label: 'S gate',   cls: 'bg-cyan-600   hover:bg-cyan-500'   },
  { name: 'T',  label: 'T gate',   cls: 'bg-teal-600   hover:bg-teal-500'   },
  { name: 'S†', label: 'S†',       cls: 'bg-indigo-600 hover:bg-indigo-500' },
  { name: 'T†', label: 'T†',       cls: 'bg-indigo-700 hover:bg-indigo-600' },
  { name: 'RX', label: 'Rot-X',    cls: 'bg-violet-600 hover:bg-violet-500' },
  { name: 'RY', label: 'Rot-Y',    cls: 'bg-violet-500 hover:bg-violet-400' },
  { name: 'RZ', label: 'Rot-Z',    cls: 'bg-violet-700 hover:bg-violet-600' },
  { name: 'U',  label: 'U(θ,φ,λ)',  cls: 'bg-fuchsia-600 hover:bg-fuchsia-500' },
  { name: 'U1', label: 'U₁(θ,φ,λ)', cls: 'bg-fuchsia-700 hover:bg-fuchsia-600' },
  { name: 'U2', label: 'U₂(θ,φ,λ)', cls: 'bg-fuchsia-800 hover:bg-fuchsia-700' },
  { name: 'I',  label: 'Identity', cls: 'bg-slate-600  hover:bg-slate-500'  },
  { name: 'M',  label: 'Measure',  cls: 'bg-emerald-600 hover:bg-emerald-500' },
];

// 2-qubit gates — NOT draggable from palette; placed via two-click on canvas
const MULTI_QUBIT_DEFS: { name: string; label: string; letter: string; cls: string; needsAngle?: boolean }[] = [
  { name: 'CX',   label: 'CNOT',   letter: 'X',  cls: 'bg-orange-600' },
  { name: 'CY',   label: 'Ctrl-Y', letter: 'Y',  cls: 'bg-yellow-600' },
  { name: 'CZ',   label: 'Ctrl-Z', letter: 'Z',  cls: 'bg-amber-600'  },
  { name: 'CH',   label: 'Ctrl-H', letter: 'H',  cls: 'bg-purple-700' },
  { name: 'SWAP', label: 'SWAP',   letter: '×',  cls: 'bg-red-600'    },
  { name: 'CRX',  label: 'CRot-X', letter: 'RX', cls: 'bg-violet-700', needsAngle: true },
  { name: 'CRY',  label: 'CRot-Y', letter: 'RY', cls: 'bg-violet-600', needsAngle: true },
  { name: 'CRZ',  label: 'CRot-Z', letter: 'RZ', cls: 'bg-violet-800', needsAngle: true },
];

const TARGET_LETTER: Record<string, string> = {
  CX: 'X', CY: 'Y', CZ: 'Z', CH: 'H', CCX: 'X', SWAP: '×',
  CRX: 'RX', CRY: 'RY', CRZ: 'RZ',
};

const ALL_GATE_CLS: Record<string, string> = {};
SINGLE_QUBIT_ROW.forEach(g => { ALL_GATE_CLS[g.name] = g.cls.split(' ')[0]; });
MULTI_QUBIT_DEFS.forEach(g => { ALL_GATE_CLS[g.name] = g.cls; });

// ─── Angle display helper ─────────────────────────────────────────────────────

function angleToDisplay(r: number): string {
  const PI = Math.PI;
  const eps = 1e-5;
  const fracs: [number, string][] = [
    [PI / 8, 'π/8'], [PI / 4, 'π/4'], [PI / 3, 'π/3'], [PI / 2, 'π/2'],
    [2 * PI / 3, '2π/3'], [3 * PI / 4, '3π/4'], [PI, 'π'],
  ];
  for (const [val, label] of fracs) {
    if (Math.abs(Math.abs(r) - val) < eps) return r < 0 ? `-${label}` : label;
  }
  return r.toFixed(3).replace(/\.?0+$/, '');
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const LABEL_W  = 48;
const CELL_W   = 54;
const CELL_H   = 48;
const HEADER_H = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function iconBtn(dark: boolean, extra = '') {
  return `p-1.5 rounded-lg transition-colors ${
    dark
      ? `text-slate-500 hover:text-white hover:bg-slate-800 ${extra}`
      : `text-gray-400 hover:text-gray-700 hover:bg-gray-100 ${extra}`
  }`;
}
function numBtn(dark: boolean) {
  return `p-0.5 rounded transition-colors ${
    dark ? 'text-slate-400 hover:text-white hover:bg-slate-700'
         : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
  }`;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  grid: (GateCell | null)[][];
  shots: number;
  onPlaceGate:      (qubit: number, step: number, gate: string, params?: number[]) => void;
  onPlaceMultiGate: (controlQ: number, targetQ: number, step: number, name: string, params?: number[]) => void;
  onMoveGate:       (fromQ: number, fromS: number, toQ: number, toS: number) => void;
  onRemoveGate:     (qubit: number, step: number) => void;
  onQubitsChange: (n: number) => void;
  onDepthChange:  (n: number) => void;
  onShotsChange:  (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExportQASM: () => void;
  onRandomize: () => void;
  isDarkMode: boolean;
}

export const VisualCircuitEditor: React.FC<Props> = ({
  grid,
  shots,
  onPlaceGate,
  onPlaceMultiGate,
  onMoveGate,
  onRemoveGate,
  onQubitsChange,
  onDepthChange,
  onShotsChange,
  onUndo,
  onRedo,
  onClear,
  onExportQASM,
  onRandomize,
  isDarkMode,
}) => {
  const dragGate    = useRef<string | null>(null);
  const dragFrom    = useRef<{ q: number; s: number } | null>(null);

  const [dropTarget,    setDropTarget]    = useState<{ q: number; s: number } | null>(null);
  /** First cell selected for 2-qubit gate placement */
  const [firstSel,      setFirstSel]      = useState<{ q: number; s: number } | null>(null);
  /** Open gate-chooser dialog with chosen qubit pair */
  const [gateChooser,   setGateChooser]   = useState<{ controlQ: number; targetQ: number; step: number } | null>(null);
  /** Pending gate placement waiting for angle input */
  const [angleChooser,  setAngleChooser]  = useState<{
    mode: 'single';   q: number; s: number; gate: string;
  } | {
    mode: 'multi';    controlQ: number; targetQ: number; step: number; gate: string;
  } | null>(null);
  const [customAngle,   setCustomAngle]   = useState('');

  const qubits = grid.length;
  const depth  = grid[0]?.length ?? 0;
  const card   = isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200';
  const dim    = isDarkMode ? 'text-slate-400' : 'text-gray-500';

  // ── SVG connection lines (control → target) ──
  const connectionLines = useMemo(() => {
    const lines: { controlQ: number; targetQ: number; step: number }[] = [];
    grid.forEach((row, qi) => {
      row.forEach((cell, si) => {
        if (cell?.role === 'control' && cell.partner !== undefined) {
          lines.push({ controlQ: qi, targetQ: cell.partner, step: si });
        }
      });
    });
    return lines;
  }, [grid]);

  // ── Drop handler (single-qubit gates / move) ──
  const handleDrop = useCallback(
    (e: React.DragEvent, q: number, s: number) => {
      e.preventDefault();
      const gate = e.dataTransfer.getData('gate') || dragGate.current;
      const from = dragFrom.current;
      setDropTarget(null);
      setFirstSel(null);
      dragGate.current = null;
      dragFrom.current = null;
      if (!gate) return;

      if (from) {
        // Move existing gate
        if (from.q !== q || from.s !== s) onMoveGate(from.q, from.s, q, s);
        return;
      }
      // Rotation gates need angle selection
      if (gate === 'RX' || gate === 'RY' || gate === 'RZ') {
        setAngleChooser({ mode: 'single', q, s, gate });
        return;
      }
      // New gate from palette — single-qubit only here
      onPlaceGate(q, s, gate);
    },
    [onPlaceGate, onMoveGate],
  );

  // ── Cell click: two-click flow for 2-qubit gates ──
  const handleCellClick = (qi: number, si: number, hasGate: boolean) => {
    if (hasGate) {
      onRemoveGate(qi, si);
      setFirstSel(null);
      return;
    }

    if (!firstSel) {
      setFirstSel({ q: qi, s: si });
    } else if (firstSel.q === qi && firstSel.s === si) {
      // Same cell — deselect
      setFirstSel(null);
    } else if (firstSel.s !== si) {
      // Different column — update to new cell
      setFirstSel({ q: qi, s: si });
    } else {
      // Same column, different qubit → open gate chooser
      setGateChooser({ controlQ: firstSel.q, targetQ: qi, step: si });
      setFirstSel(null);
    }
  };

  // ── Gate box renderer ──
  const renderGateBox = (cell: GateCell) => {
    const color = ALL_GATE_CLS[cell.name] ?? 'bg-slate-600';

    // SWAP — diamond on both sides
    if (cell.name === 'SWAP') {
      return (
        <div
          className="relative z-10 flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-90"
          style={{ width: 36, height: 32 }}
          title="SWAP — click to remove"
        >
          <div
            className={`w-5 h-5 ${color} shadow-md hover:brightness-75`}
            style={{ transform: 'rotate(45deg)' }}
          />
        </div>
      );
    }

    // Control qubit — filled circle
    if (cell.role === 'control') {
      return (
        <div
          className="relative z-10 flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-90"
          style={{ width: 36, height: 32 }}
          title={`${cell.name} control — click to remove`}
        >
          <div className={`w-5 h-5 rounded-full ${color} shadow-md`} />
        </div>
      );
    }

    // Target qubit — square with letter
    if (cell.role === 'target') {
      const letter = TARGET_LETTER[cell.name] ?? cell.name;
      return (
        <div
          className={`relative z-10 flex items-center justify-center rounded-md text-white text-xs font-bold font-mono shadow-md cursor-pointer transition-all hover:brightness-75 hover:scale-95 active:scale-90 ${color}`}
          style={{ width: 30, height: 28 }}
          title={`${cell.name} target — click to remove`}
        >
          {letter}
        </div>
      );
    }

    // Normal single-qubit gate — rotation gates show angle relative to π
    const rotMatch = cell.name.match(/^(RX|RY|RZ)([-\d.]+)?$/);
    const displayLabel = rotMatch
      ? `${rotMatch[1]}${angleToDisplay(cell.params?.[0] ?? parseFloat(rotMatch[2] ?? '0'))}`
      : cell.name.length > 4 ? cell.name.slice(0, 4) : cell.name;

    return (
      <div
        className={`relative z-10 flex items-center justify-center rounded-lg text-white text-[10px] font-bold font-mono shadow-md cursor-pointer transition-all hover:brightness-75 hover:scale-95 active:scale-90 ${color}`}
        style={{ width: 36, height: 32 }}
        title={`${rotMatch ? `${rotMatch[1]}(${(cell.params?.[0] ?? 0).toFixed(4)} rad)` : cell.name} — click to remove`}
      >
        {displayLabel}
      </div>
    );
  };

  return (
    <div className={`rounded-2xl border shadow-xl overflow-hidden ${card}`}>

      {/* ── Toolbar ── */}
      <div className={`px-5 py-3 border-b flex items-center gap-3 flex-wrap ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
        <h3 className="text-base font-semibold flex items-center gap-2 mr-auto">
          <span className="w-2 h-2 bg-blue-400 rounded-full inline-block" />
          Circuit Editor
        </h3>

        <label className="flex items-center gap-1.5 text-xs">
          <span className={dim}>Shots</span>
          <input
            type="number" value={shots} min={1} max={65536}
            onChange={e => onShotsChange(Math.max(1, parseInt(e.target.value) || 1))}
            className={`w-20 rounded-lg px-2 py-1.5 text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500/40 ${
              isDarkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
            }`}
          />
        </label>

        <div className="flex items-center gap-1 text-xs">
          <span className={dim}>Qubits</span>
          <button onClick={() => onQubitsChange(Math.max(1, qubits - 1))} className={numBtn(isDarkMode)}><Minus className="w-3 h-3" /></button>
          <span className={`font-mono w-5 text-center font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{qubits}</span>
          <button onClick={() => onQubitsChange(Math.min(20, qubits + 1))} className={numBtn(isDarkMode)}><Plus className="w-3 h-3" /></button>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className={dim}>Depth</span>
          <button onClick={() => onDepthChange(Math.max(1, depth - 1))} className={numBtn(isDarkMode)}><Minus className="w-3 h-3" /></button>
          <span className={`font-mono w-5 text-center font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{depth}</span>
          <button onClick={() => onDepthChange(Math.min(50, depth + 1))} className={numBtn(isDarkMode)}><Plus className="w-3 h-3" /></button>
        </div>

        <div className="flex items-center gap-0.5">
          <button onClick={onUndo}       title="Undo"        className={iconBtn(isDarkMode)}><RotateCcw className="w-3.5 h-3.5" /></button>
          <button onClick={onRedo}       title="Redo"        className={iconBtn(isDarkMode)}><RotateCw  className="w-3.5 h-3.5" /></button>
          <button onClick={onClear}      title="Clear"       className={iconBtn(isDarkMode, 'hover:text-red-400')}><Trash2   className="w-3.5 h-3.5" /></button>
          <button onClick={onExportQASM} title="Export QASM" className={iconBtn(isDarkMode)}><Download  className="w-3.5 h-3.5" /></button>
          <button onClick={onRandomize}  title="Random circuit" className={iconBtn(isDarkMode, 'hover:text-emerald-400')}><Shuffle className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* ── Gate Palette ── */}
      <div className={`px-5 py-3 border-b space-y-2 ${isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-gray-100 bg-gray-50/60'}`}>
        {/* Single-qubit gates — draggable */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {SINGLE_QUBIT_ROW.map(gate => (
            <button
              key={gate.name}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('gate', gate.name);
                e.dataTransfer.effectAllowed = 'copy';
                dragGate.current = gate.name;
                dragFrom.current = null;
              }}
              onDragEnd={() => { dragGate.current = null; }}
              title={gate.label}
              className={`px-2.5 py-1 rounded-lg text-white text-xs font-mono font-bold cursor-grab active:cursor-grabbing select-none transition-all hover:scale-105 active:scale-95 shadow-sm ${gate.cls}`}
            >
              {gate.name}
            </button>
          ))}
          <span className={`ml-auto text-[10px] italic hidden sm:block ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
            drag onto wire · drag gate to move · click to remove
          </span>
        </div>

        {/* 2-qubit gates — visual reference only, placed via two-click */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {MULTI_QUBIT_DEFS.map(gate => (
            <div
              key={gate.name}
              title={`${gate.label} — click two empty cells in the same column`}
              className={`px-2.5 py-1 rounded-lg text-white text-xs font-mono font-bold select-none opacity-80 ${gate.cls}`}
            >
              {gate.name}
            </div>
          ))}
          <span className={`ml-auto text-[10px] italic hidden sm:block ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
            ↙ click two empty cells in same column to place
          </span>
        </div>
      </div>

      {/* ── Selection hint ── */}
      {firstSel && (
        <div className={`px-5 py-2 text-xs flex items-center gap-2 ${isDarkMode ? 'bg-purple-950/40 border-b border-purple-800/40 text-purple-300' : 'bg-purple-50 border-b border-purple-200 text-purple-700'}`}>
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse inline-block" />
          Control selected: q{firstSel.q}, step {firstSel.s} — now click another empty cell in the same column for the target
          <button
            onClick={() => setFirstSel(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >
            ✕ cancel
          </button>
        </div>
      )}

      {/* ── Circuit Canvas ── */}
      <div className="p-4 overflow-x-auto overflow-y-auto max-h-[420px]">
        <div className="relative" style={{ minWidth: depth * CELL_W + LABEL_W }}>

          {/* Step index header */}
          <div className="flex items-center mb-1 pl-14">
            {Array.from({ length: depth }, (_, s) => (
              <div
                key={s}
                className={`text-center text-[9px] font-mono select-none ${isDarkMode ? 'text-slate-700' : 'text-gray-300'}`}
                style={{ width: CELL_W }}
              >
                {s}
              </div>
            ))}
          </div>

          {/* Qubit rows */}
          {grid.map((row, qi) => (
            <div key={qi} className="flex items-center" style={{ height: CELL_H }}>

              {/* Qubit label */}
              <div
                className={`shrink-0 text-right pr-3 text-xs font-mono font-semibold select-none ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}
                style={{ width: LABEL_W }}
              >
                |q{qi}⟩
              </div>

              {/* Gate cells */}
              {row.map((cell, si) => {
                const isDropTarget = dropTarget?.q === qi && dropTarget?.s === si;
                const isFirstSel   = firstSel?.q === qi && firstSel?.s === si;
                const hasGate      = cell !== null && cell.name !== 'I';

                return (
                  <div
                    key={si}
                    className="relative flex items-center justify-center select-none"
                    style={{ width: CELL_W, height: CELL_H }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropTarget({ q: qi, s: si }); }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
                    }}
                    onDrop={e => handleDrop(e, qi, si)}
                    onClick={() => handleCellClick(qi, si, hasGate)}
                    onContextMenu={e => { e.preventDefault(); if (hasGate) onRemoveGate(qi, si); }}
                  >
                    {/* Wire */}
                    <div className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px pointer-events-none ${isDarkMode ? 'bg-slate-600' : 'bg-gray-300'}`} />

                    {/* First-selection highlight */}
                    {isFirstSel && (
                      <div className="absolute inset-1 rounded-lg border-2 border-purple-500 animate-pulse pointer-events-none z-20" />
                    )}

                    {/* Drop-zone highlight */}
                    {isDropTarget && !hasGate && (
                      <div className={`absolute inset-1 rounded-lg border-2 border-dashed pointer-events-none ${isDarkMode ? 'border-purple-500/60 bg-purple-500/10' : 'border-purple-400/60 bg-purple-50'}`} />
                    )}

                    {/* Gate — draggable to move */}
                    {hasGate && (
                      <div
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.setData('gate', cell.name);
                          e.dataTransfer.effectAllowed = 'move';
                          dragGate.current = cell.name;
                          dragFrom.current = { q: qi, s: si };
                        }}
                        onDragEnd={() => { dragGate.current = null; dragFrom.current = null; }}
                        className="flex items-center justify-center"
                      >
                        {renderGateBox(cell)}
                      </div>
                    )}

                    {/* Wire dot for empty cell */}
                    {!hasGate && !isFirstSel && !isDropTarget && (
                      <div className={`relative z-10 w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── SVG overlay: control↔target connections ── */}
          {connectionLines.length > 0 && (
            <svg
              className="absolute pointer-events-none"
              style={{ top: HEADER_H, left: LABEL_W, width: depth * CELL_W, height: qubits * CELL_H }}
            >
              {connectionLines.map(({ controlQ, targetQ, step }) => {
                const x   = step * CELL_W + CELL_W / 2;
                const y1  = controlQ * CELL_H + CELL_H / 2;
                const y2  = targetQ  * CELL_H + CELL_H / 2;
                const adj = Math.abs(targetQ - controlQ) === 1;
                const d   = adj
                  ? `M ${x} ${y1} L ${x} ${y2}`
                  : `M ${x} ${y1} C ${x + 28} ${y1}, ${x + 28} ${y2}, ${x} ${y2}`;
                return (
                  <path
                    key={`${controlQ}-${step}`}
                    d={d}
                    stroke="#a855f7"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray={adj ? undefined : '5 3'}
                  />
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* ── Angle chooser dialog (for RX/RY/RZ/CRX/CRY/CRZ) ── */}
      {angleChooser && (() => {
        const ANGLE_PRESETS = [
          { label: 'π/8',  value: Math.PI / 8 },
          { label: 'π/4',  value: Math.PI / 4 },
          { label: 'π/3',  value: Math.PI / 3 },
          { label: 'π/2',  value: Math.PI / 2 },
          { label: '2π/3', value: 2 * Math.PI / 3 },
          { label: '3π/4', value: 3 * Math.PI / 4 },
          { label: 'π',    value: Math.PI },
        ];

        const applyAngle = (radians: number) => {
          const angleStr = radians.toFixed(6);
          if (angleChooser.mode === 'single') {
            onPlaceGate(angleChooser.q, angleChooser.s, `${angleChooser.gate}${angleStr}`, [radians]);
          } else {
            onPlaceMultiGate(angleChooser.controlQ, angleChooser.targetQ, angleChooser.step, angleChooser.gate, [radians]);
          }
          setAngleChooser(null);
          setCustomAngle('');
        };

        const label = angleChooser.mode === 'single'
          ? `${angleChooser.gate} on q${angleChooser.q}`
          : `${angleChooser.gate}: q${(angleChooser as any).controlQ} → q${(angleChooser as any).targetQ}`;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`rounded-2xl border shadow-2xl p-6 w-80 ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              <h4 className="font-semibold text-sm mb-1">Select Rotation Angle</h4>
              <p className={`text-xs mb-4 ${dim}`}>{label}</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {ANGLE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyAngle(p.value)}
                    className="py-2 rounded-xl text-white text-xs font-bold bg-violet-600 hover:bg-violet-500 transition-all hover:scale-105 active:scale-95 shadow-md"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  placeholder="Custom (radians)"
                  value={customAngle}
                  onChange={e => setCustomAngle(e.target.value)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs border focus:outline-none focus:ring-1 focus:ring-purple-500/40 ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
                  step="0.01"
                />
                <button
                  onClick={() => {
                    const v = parseFloat(customAngle);
                    if (!isNaN(v)) applyAngle(v);
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500"
                >
                  Apply
                </button>
              </div>
              <button
                onClick={() => { setAngleChooser(null); setCustomAngle(''); }}
                className={`w-full py-2 rounded-xl text-xs font-medium transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Gate chooser dialog (after two empty cells selected) ── */}
      {gateChooser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`rounded-2xl border shadow-2xl p-6 w-80 ${isDarkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
            <h4 className="font-semibold text-sm mb-1">Select 2-Qubit Gate</h4>
            <p className={`text-xs mb-4 ${dim}`}>
              Control: <span className="font-mono font-bold text-purple-400">q{gateChooser.controlQ}</span>
              {' → '}
              Target: <span className="font-mono font-bold text-purple-400">q{gateChooser.targetQ}</span>
              <span className="ml-2 opacity-60">(step {gateChooser.step})</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {MULTI_QUBIT_DEFS.map(g => (
                <button
                  key={g.name}
                  onClick={() => {
                    if (g.needsAngle) {
                      setAngleChooser({ mode: 'multi', controlQ: gateChooser.controlQ, targetQ: gateChooser.targetQ, step: gateChooser.step, gate: g.name });
                      setGateChooser(null);
                      return;
                    }
                    onPlaceMultiGate(gateChooser.controlQ, gateChooser.targetQ, gateChooser.step, g.name);
                    setGateChooser(null);
                  }}
                  className={`py-3 rounded-xl text-white text-sm font-bold transition-all hover:scale-105 active:scale-95 shadow-md ${g.cls}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setGateChooser(null)}
              className={`w-full mt-4 py-2 rounded-xl text-xs font-medium transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
