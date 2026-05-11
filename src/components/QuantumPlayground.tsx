import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Header }              from './Header/Header';
import { ResultsSummary }      from './Results/ResultsSummary';
import { ResultsTabs }         from './Results/ResultsTabs';
import { ParametrizedGates }   from './Gates/ParametrizedGates';
import { CountsOutput }        from './Results/CountsOutput';
import { VisualCircuitEditor } from './Circuit/VisualCircuitEditor';
import { CodeTabs }            from './Code/CodeTabs';
import { Footer }              from './Footer/Footer';
import { useToast }            from './Toast/ToastProvider';
import {
  CircuitGrid, GateCell, QuantumState, CodeOutputs, CodeFormat,
} from '../types/quantum';

const API_BASE = 'http://127.0.0.1:7900';

// ─── Grid helpers ─────────────────────────────────────────────────────────────

const DEFAULT_QUBITS = 3;
const DEFAULT_DEPTH  = 10;

function makeGrid(qubits: number, depth: number): CircuitGrid {
  return Array.from({ length: qubits }, () => Array(depth).fill(null));
}

function resizeGrid(grid: CircuitGrid, newQ: number, newD: number): CircuitGrid {
  return Array.from({ length: newQ }, (_, qi) =>
    Array.from({ length: newD }, (_, si) => grid[qi]?.[si] ?? null),
  );
}

/** Serialize grid to the backend wire format.
 *  Multi-qubit gates use role-based notation: X.0#0 / X.0#1 etc.
 *  Rotation gates serialize their angle: RX1.570796
 *  Controlled rotations: CRX1.570796.0#0 / CRX1.570796.0#1 */
function gridToText(grid: CircuitGrid): string {
  const multiCtrlMap: Record<string, string> = {
    CX: 'X', CZ: 'Z', CY: 'Y', CH: 'H', SWAP: 'S', CCX: 'X',
  };
  const ROTATION_GATES = new Set(['RX', 'RY', 'RZ']);
  const CTRL_ROTATION  = new Set(['CRX', 'CRY', 'CRZ']);

  return grid
    .map(row =>
      row.map(cell => {
        if (!cell || cell.name === 'I') return 'I';

        // Controlled rotation gates
        if (CTRL_ROTATION.has(cell.name)) {
          const angle = cell.params?.[0] ?? 0;
          const gid   = cell.groupId ?? 0;
          const role  = cell.role === 'control' ? 0 : 1;
          return `${cell.name}${angle.toFixed(6)}.${gid}#${role}`;
        }

        if (cell.role === 'control') {
          const prefix = multiCtrlMap[cell.name] ?? cell.name;
          const gid    = cell.groupId ?? 0;
          return `${prefix}.${gid}#0`;
        }
        if (cell.role === 'target') {
          const prefix = multiCtrlMap[cell.name] ?? cell.name;
          const gid    = cell.groupId ?? 0;
          return `${prefix}.${gid}#1`;
        }

        // Single-qubit rotation gates with angle
        if (ROTATION_GATES.has(cell.name)) {
          const angle = cell.params?.[0] ?? 0;
          return `${cell.name}${angle.toFixed(6)}`;
        }

        return cell.name;
      }).join('-'),
    )
    .join('\n');
}

/** Seed the default circuit with a small demo */
function makeDefaultGrid(): CircuitGrid {
  const grid = makeGrid(DEFAULT_QUBITS, DEFAULT_DEPTH);
  grid[0][0] = { name: 'H'  };
  grid[0][2] = { name: 'H'  };
  grid[1][1] = { name: 'CX', role: 'control', partner: 2, groupId: 0 };
  grid[2][1] = { name: 'CX', role: 'target',  partner: 1, groupId: 0 };
  grid[2][0] = { name: 'X'  };
  grid[2][3] = { name: 'M'  };
  return grid;
}

// ─── Probability parsing ─────────────────────────────────────────────────────

function parseProbabilities(report: string) {
  const lines = report.split('\n').filter(l => l.includes('|') && l.includes('⟩'));
  const out: { state: string; probability: number; amplitude: number }[] = [];
  lines.forEach(line => {
    const entries = line.split(/\s{4,}/);
    entries.forEach(entry => {
      const states = [...entry.matchAll(/\|([01]+)⟩/g)];
      const probs  = [...entry.matchAll(/(\d+\.?\d*)%/g)];
      for (let i = 0; i < Math.min(states.length, probs.length); i++) {
        const prob = parseFloat(probs[i][1]) / 100;
        out.push({ state: `|${states[i][1]}⟩`, probability: prob, amplitude: Math.sqrt(prob) });
      }
    });
  });
  return out.sort((a, b) => b.probability - a.probability);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_CODE: CodeOutputs = {
  qasm: '', qiskit: '', cirq: '', cudaq: '', braket: '', pennylane: '',
};

const INITIAL_RESULTS: QuantumState['results'] = {
  probabilities: [{ state: '|000⟩', probability: 1.0, amplitude: 1.0 }],
  counts: { '000': 1024 },
};

// ─── Component ────────────────────────────────────────────────────────────────

export const QuantumPlayground: React.FC = () => {
  const { showToast } = useToast();

  // ── Core state ──
  const [grid, setGrid]           = useState<CircuitGrid>(makeDefaultGrid);
  const [shots, setShots]         = useState(1024);
  const [qubits, setQubits]       = useState(DEFAULT_QUBITS);
  const [depth, setDepth]         = useState(DEFAULT_DEPTH);
  const [isDarkMode, setDarkMode] = useState(true);

  // ── Output state ──
  const [results, setResults]         = useState<QuantumState['results']>(INITIAL_RESULTS);
  const [isSimulating, setSimulating] = useState(false);
  const [svOutput, setSvOutput]       = useState('');
  const [tnOutput, setTnOutput]       = useState('');
  const [plotProbs,   setPlotProbs]   = useState<Record<string, number>>({});
  const [codeOutputs, setCodeOutputs] = useState<CodeOutputs>(EMPTY_CODE);
  /** Simulation text output per code tab (separate from generated code) */
  const [simOutputs,  setSimOutputs]  = useState<Partial<Record<CodeFormat, string>>>({});
  /** Structured counts data per code tab for native chart rendering */
  const [countOutputs, setCountOutputs] = useState<Partial<Record<CodeFormat, Record<string, number>>>>({});

  // ── Undo/redo ──
  const histStack = useRef<CircuitGrid[]>([makeDefaultGrid()]);
  const histIdx   = useRef(0);

  // ── Auto-QASM debounce ──
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Grid mutations ───────────────────────────────────────────────────────

  const pushHistory = (next: CircuitGrid) => {
    const trimmed = histStack.current.slice(0, histIdx.current + 1);
    trimmed.push(next);
    histStack.current = trimmed;
    histIdx.current   = trimmed.length - 1;
  };

  const commitGrid = useCallback((next: CircuitGrid) => {
    setGrid(next);
    pushHistory(next);
  }, []);

  const placeGate = useCallback(
    (q: number, s: number, name: string, params?: number[]) => {
      setGrid(prev => {
        const next = prev.map(row => [...row]);
        next[q][s] = { name, ...(params ? { params } : {}) };
        pushHistory(next);
        return next;
      });
    },
    [],
  );

  const placeMultiGate = useCallback(
    (controlQ: number, targetQ: number, step: number, name: string, params?: number[]) => {
      setGrid(prev => {
        if (prev[targetQ]?.[step] !== null) {
          showToast(`Step ${step} on q${targetQ} is occupied`, 'warning');
          return prev;
        }
        const next = prev.map(row => [...row]);
        const extra = params ? { params } : {};
        next[controlQ][step] = { name, role: 'control', partner: targetQ, groupId: 0, ...extra };
        next[targetQ][step]  = { name, role: 'target',  partner: controlQ, groupId: 0, ...extra };
        pushHistory(next);
        return next;
      });
    },
    [showToast],
  );

  const moveGate = useCallback(
    (fromQ: number, fromS: number, toQ: number, toS: number) => {
      setGrid(prev => {
        const cell = prev[fromQ]?.[fromS];
        if (!cell) return prev;
        if (prev[toQ]?.[toS] !== null) return prev; // destination occupied
        const next = prev.map(row => [...row]);
        // If multi-qubit gate, move both cells
        if (cell.role && cell.partner !== undefined) {
          const partnerQ = cell.partner;
          const partnerCell = next[partnerQ][fromS];
          const deltaQ = toQ - fromQ;
          const newPartnerQ = partnerQ + deltaQ;
          if (newPartnerQ < 0 || newPartnerQ >= next.length) return prev;
          if (next[newPartnerQ][toS] !== null) return prev;
          // Clear old positions
          next[fromQ][fromS]    = null;
          next[partnerQ][fromS] = null;
          // Place at new positions
          next[toQ][toS]          = { ...cell,        partner: newPartnerQ };
          next[newPartnerQ][toS]  = { ...partnerCell!, partner: toQ };
        } else {
          next[fromQ][fromS] = null;
          next[toQ][toS]     = cell;
        }
        pushHistory(next);
        return next;
      });
    },
    [],
  );

  const removeGate = useCallback(
    (q: number, s: number) => {
      setGrid(prev => {
        const cell = prev[q]?.[s];
        if (!cell) return prev;
        const next = prev.map(row => [...row]);
        // Also remove partner for multi-qubit gates
        if (cell.partner !== undefined) {
          next[cell.partner][s] = null;
        }
        next[q][s] = null;
        pushHistory(next);
        return next;
      });
    },
    [],
  );

  const handleUndo = () => {
    if (histIdx.current > 0) {
      histIdx.current--;
      setGrid(histStack.current[histIdx.current]);
    }
  };

  const handleRedo = () => {
    if (histIdx.current < histStack.current.length - 1) {
      histIdx.current++;
      setGrid(histStack.current[histIdx.current]);
    }
  };

  const handleClear = () => {
    const empty = makeGrid(qubits, depth);
    commitGrid(empty);
    showToast('Circuit cleared', 'info');
  };

  const handleRandomize = () => {
    const SIMPLE = ['H', 'X', 'Y', 'Z', 'S', 'T', 'S†', 'T†'];
    const ROT    = ['RX', 'RY', 'RZ'];
    const ANGLES = [Math.PI/8, Math.PI/4, Math.PI/3, Math.PI/2, 2*Math.PI/3, 3*Math.PI/4, Math.PI];
    const newGrid = makeGrid(qubits, depth);
    for (let q = 0; q < qubits; q++) {
      const numGates = Math.floor(Math.random() * 7); // 0–6
      const steps = Array.from({ length: depth }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, numGates);
      for (const s of steps) {
        const all  = [...SIMPLE, ...ROT];
        const name = all[Math.floor(Math.random() * all.length)];
        if (ROT.includes(name)) {
          const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
          newGrid[q][s] = { name: `${name}${angle.toFixed(6)}`, params: [angle] };
        } else {
          newGrid[q][s] = { name };
        }
      }
    }
    commitGrid(newGrid);
    showToast('Random circuit generated', 'success');
  };

  // ─── Resize when qubits/depth change ─────────────────────────────────────

  const handleQubitsChange = (n: number) => {
    const clamped = Math.max(1, Math.min(20, n));
    setQubits(clamped);
    setGrid(prev => resizeGrid(prev, clamped, depth));
  };

  const handleDepthChange = (n: number) => {
    const clamped = Math.max(1, Math.min(50, n));
    setDepth(clamped);
    setGrid(prev => resizeGrid(prev, qubits, clamped));
  };

  // ─── Shots ref for use in auto-pipeline ──────────────────────────────────
  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);

  // ─── Auto-pipeline on grid change ────────────────────────────────────────

  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => { runPipeline(grid); }, 1500);
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  // ─── Backend helpers ──────────────────────────────────────────────────────

  const generateQASM = async (g: CircuitGrid = grid): Promise<string | null> => {
    const text = gridToText(g);
    try {
      const res = await fetch(`${API_BASE}/QASM`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const qasm = await res.text();
      setCodeOutputs(prev => ({ ...prev, qasm }));
      return qasm;
    } catch {
      const placeholder = `// Backend offline — QASM not generated\n// Circuit text:\n${text
        .split('\n')
        .map((l, i) => `// q${i}: ${l}`)
        .join('\n')}`;
      setCodeOutputs(prev => ({ ...prev, qasm: placeholder }));
      return null;
    }
  };

  /** Generate all code formats from QASM via /generate-code */
  const generateAllFormats = async (qasm: string) => {
    const formats: CodeFormat[] = ['qiskit', 'cirq', 'braket', 'cudaq', 'pennylane'];
    await Promise.allSettled(
      formats.map(async fmt => {
        try {
          const res  = await fetch(`${API_BASE}/generate-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qasm, format: fmt }),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (data.code) setCodeOutputs(prev => ({ ...prev, [fmt]: data.code }));
        } catch { /* ignore per-format failures */ }
      }),
    );
  };

  // ─── Simulate ─────────────────────────────────────────────────────────────

  /** Auto-simulate a single code format */
  const autoSimFormat = async (format: CodeFormat, code: string) => {
    if (!code) return;
    try {
      const res  = await fetch(`${API_BASE}/execute-python`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: format }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const out  = data.stdout || data.stderr || data.error || '';
      if (out) setSimOutputs(prev => ({ ...prev, [format]: out }));
      if (data.counts) setCountOutputs(prev => ({ ...prev, [format]: data.counts }));
    } catch { /* ignore individual format failures */ }
  };

  /** Full pipeline: QASM → PennyLane sim → all code gen → auto-sim all */
  const runPipeline = async (g: CircuitGrid = grid, showLoading = false) => {
    if (showLoading) setSimulating(true);
    try {
      // Step 1: generate QASM
      const qasm = await generateQASM(g);
      if (!qasm || qasm.startsWith('//')) return;

      // Step 2: PennyLane simulation (fast, native)
      const plRes = await fetch(`${API_BASE}/simulate-pennylane`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shots: shotsRef.current }),
      }).then(r => r.json()).catch(() => null);

      if (plRes) {
        const output = plRes.stdout ?? plRes.error ?? 'No output.';
        setSvOutput(output);
        setTnOutput(output);
        setSimOutputs(prev => ({ ...prev, pennylane: output }));
        if (plRes.probs) {
          setPlotProbs(plRes.probs);
          setCountOutputs(prev => ({ ...prev, pennylane: plRes.probs }));
        }
        const probs = parseProbabilities(output);
        if (probs.length > 0) {
          const counts = probs.reduce<Record<string, number>>((acc, p) => {
            acc[p.state.replace(/[|⟩]/g, '')] = Math.round(p.probability * shotsRef.current);
            return acc;
          }, {});
          setResults({ probabilities: probs, counts });
        }
      }

      // Step 3: generate all code formats in parallel
      const formats: CodeFormat[] = ['qiskit', 'cirq', 'braket', 'cudaq', 'pennylane'];
      const codeMap: Partial<Record<CodeFormat, string>> = {};
      await Promise.allSettled(
        formats.map(async fmt => {
          try {
            const res  = await fetch(`${API_BASE}/generate-code`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ qasm, format: fmt }),
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.code) {
              codeMap[fmt] = data.code;
              setCodeOutputs(prev => ({ ...prev, [fmt]: data.code }));
            }
          } catch { /* ignore */ }
        }),
      );

      // Step 4: auto-simulate qiskit/cirq/braket (fire-and-forget); pennylane already done in step 2
      const simulatable: CodeFormat[] = ['qiskit', 'cirq', 'braket'];
      simulatable.forEach(fmt => {
        const code = codeMap[fmt];
        if (code) void autoSimFormat(fmt, code);
      });

    } finally {
      if (showLoading) setSimulating(false);
    }
  };

  const handleSimulate = async () => {
    showToast('Running full pipeline…', 'info');
    await runPipeline(grid, true);
    showToast('Simulation complete', 'success');
  };

  // ─── Parametrized gate application ───────────────────────────────────────

  const handleApplyParametrized = async (
    gateType: 'U' | 'U1' | 'U2',
    qubit: number,
    theta: number,
    phi: number,
    lambda: number,
  ) => {
    const row  = grid[qubit] ?? [];
    const step = row.findIndex(c => c === null);
    if (step === -1) {
      showToast(`No empty step on q${qubit} — increase depth`, 'warning');
      return;
    }

    setGrid(prev => {
      const next = prev.map(r => [...r]);
      next[qubit][step] = { name: gateType, params: [theta, phi, lambda] };
      pushHistory(next);
      return next;
    });

    try {
      await fetch(`${API_BASE}/unitary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key:    `UNITARY${gateType === 'U' ? '' : `_${gateType.slice(1)}`}`,
          theta, phi, lambda,
        }),
      });
    } catch { /* backend offline — gate still placed visually */ }

    showToast(`${gateType} gate placed on q${qubit} step ${step}`, 'success');
  };

  // ─── Code tab handlers ────────────────────────────────────────────────────

  const handleCodeGenerate = async (format: CodeFormat) => {
    if (format === 'qasm') { await generateQASM(); return; }
    const qasm = codeOutputs.qasm;
    if (!qasm || qasm.startsWith('//')) {
      showToast('Generate QASM first', 'warning'); return;
    }
    try {
      const res  = await fetch(`${API_BASE}/generate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qasm, format }),
      });
      const data = await res.json();
      if (data.code) setCodeOutputs(prev => ({ ...prev, [format]: data.code }));
      showToast(`${format} code generated`, 'success');
    } catch {
      showToast(`Failed to generate ${format}`, 'error');
    }
  };

  const handleCodeSimulate = async (format: CodeFormat) => {
    if (format === 'pennylane') { await handleSimulate(); return; }
    // codeOutputs[format] holds the generated Python code — do NOT overwrite it
    const code = codeOutputs[format];
    if (!code) {
      showToast('Generate code first', 'warning'); return;
    }
    try {
      const res  = await fetch(`${API_BASE}/execute-python`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: format }),
      });
      const data = await res.json();
      const out  = data.stdout || data.stderr || data.error || 'No output.';
      setSimOutputs(prev  => ({ ...prev,  [format]: out }));
      if (data.counts) setCountOutputs(prev => ({ ...prev, [format]: data.counts }));
      showToast(`${format} simulation complete`, 'success');
    } catch {
      showToast(`Failed to simulate ${format}`, 'error');
    }
  };

  const handleExportQASM = () => {
    const code = codeOutputs.qasm;
    if (!code || code.startsWith('//')) { showToast('Generate QASM first', 'warning'); return; }
    const blob = new Blob([code], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'circuit.qasm' }).click();
    URL.revokeObjectURL(url);
    showToast('QASM exported', 'success');
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const bg = isDarkMode ? 'bg-slate-950 text-white' : 'bg-gray-50 text-gray-900';

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg}`}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        <Header
          onSimulate={handleSimulate}
          shots={shots}
          qubits={qubits}
          depth={depth}
          isDarkMode={isDarkMode}
          onToggleTheme={() => setDarkMode(v => !v)}
          isSimulating={isSimulating}
        />

        {/* ── Main two-column layout ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-6 items-start">

          {/* ── Left panel ── */}
          <div className="space-y-5">
            <ResultsSummary results={results} isDarkMode={isDarkMode} qubits={qubits} />
            <CountsOutput   counts={results.counts} isDarkMode={isDarkMode} />
            <ParametrizedGates
              onApplyGate={handleApplyParametrized}
              qubits={qubits}
              isDarkMode={isDarkMode}
            />
          </div>

          {/* ── Right / Centre panel (circuit is king) ── */}
          <div className="space-y-5">
            <VisualCircuitEditor
              grid={grid}
              shots={shots}
              onPlaceGate={placeGate}
              onPlaceMultiGate={placeMultiGate}
              onMoveGate={moveGate}
              onRemoveGate={removeGate}
              onQubitsChange={handleQubitsChange}
              onDepthChange={handleDepthChange}
              onShotsChange={setShots}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClear}
              onExportQASM={handleExportQASM}
              onRandomize={handleRandomize}
              isDarkMode={isDarkMode}
            />

            <ResultsTabs
              stateVectorOutput={svOutput}
              tensorNetworkOutput={tnOutput}
              plotProbs={plotProbs}
              isLoading={isSimulating}
              isDarkMode={isDarkMode}
            />

            <CodeTabs
              codeOutputs={codeOutputs}
              simOutputs={simOutputs}
              countOutputs={countOutputs}
              onGenerate={handleCodeGenerate}
              onSimulate={handleCodeSimulate}
              isDarkMode={isDarkMode}
            />
          </div>
        </div>

        <Footer
          onSimulate={handleSimulate}
          isDarkMode={isDarkMode}
          isSimulating={isSimulating}
        />
      </div>
    </div>
  );
};
