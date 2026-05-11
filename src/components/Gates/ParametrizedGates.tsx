import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SliderParams { t: number; p: number; l: number }  // integers: actual = n * π/4
type GateKey = 'U' | 'U1' | 'U2';

interface Props {
  /** Called when the user clicks Apply — places the gate in the circuit */
  onApplyGate: (gateType: GateKey, qubit: number, thetaRad: number, phiRad: number, lambdaRad: number) => void;
  qubits: number;
  isDarkMode: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PI = Math.PI;

/** Convert integer slider step → radians  (step × π/4) */
const toRad = (n: number) => n * PI / 4;

/** Format integer step as a π-fraction string */
function piLabel(n: number): string {
  if (n === 0)  return '0';
  if (n === 4)  return 'π';
  if (n === -4) return '−π';
  if (n === 8)  return '2π';
  if (n === -8) return '−2π';
  const num = n > 0 ? n : -n;
  const sign = n > 0 ? '' : '−';
  if (num % 4 === 0) return `${sign}${num / 4}π`;
  return `${sign}${num}/4 π`;
}

interface Complex { re: number; im: number }

/** Compute the 2×2 unitary matrix for U(θ,φ,λ) (angles in radians) */
function computeMatrix(theta: number, phi: number, lambda: number): [Complex, Complex, Complex, Complex] {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [
    { re:  c,                                      im: 0                              },  // m00
    { re: -Math.cos(lambda) * s,                   im: -Math.sin(lambda) * s          },  // m01
    { re:  Math.cos(phi) * s,                      im:  Math.sin(phi) * s             },  // m10
    { re:  Math.cos(phi + lambda) * c,             im:  Math.sin(phi + lambda) * c    },  // m11
  ];
}

/** Check U†U ≈ I */
function isUnitary([m00, m01, m10, m11]: [Complex, Complex, Complex, Complex]): boolean {
  const col0 = m00.re**2 + m00.im**2 + m10.re**2 + m10.im**2;
  const col1 = m01.re**2 + m01.im**2 + m11.re**2 + m11.im**2;
  const off  = m00.re*m01.re + m00.im*m01.im + m10.re*m11.re + m10.im*m11.im;
  return Math.abs(col0 - 1) < 1e-9 && Math.abs(col1 - 1) < 1e-9 && Math.abs(off) < 1e-9;
}

/** Format a complex number for display in a matrix cell */
function fmtC({ re, im }: Complex): string {
  const near = (x: number) => Math.abs(x) < 5e-4;
  if (near(re) && near(im)) return '0';
  const rPart = near(re) ? '' : re.toFixed(3);
  const iPart = near(im) ? '' : (im > 0 && rPart ? `+${im.toFixed(3)}i` : `${im.toFixed(3)}i`);
  return (rPart + iPart) || '0';
}

/** Multiply two 2×2 complex matrices */
function matMul(
  a: [Complex, Complex, Complex, Complex],
  b: [Complex, Complex, Complex, Complex],
): [Complex, Complex, Complex, Complex] {
  const mul = (x: Complex, y: Complex): Complex => ({
    re: x.re * y.re - x.im * y.im,
    im: x.re * y.im + x.im * y.re,
  });
  const add = (x: Complex, y: Complex): Complex => ({ re: x.re + y.re, im: x.im + y.im });
  return [
    add(mul(a[0], b[0]), mul(a[1], b[2])),
    add(mul(a[0], b[1]), mul(a[1], b[3])),
    add(mul(a[2], b[0]), mul(a[3], b[2])),
    add(mul(a[2], b[1]), mul(a[3], b[3])),
  ];
}

/** Conjugate-transpose of a 2×2 matrix */
function matDagger(
  [m00, m01, m10, m11]: [Complex, Complex, Complex, Complex],
): [Complex, Complex, Complex, Complex] {
  return [
    { re: m00.re, im: -m00.im },
    { re: m10.re, im: -m10.im },
    { re: m01.re, im: -m01.im },
    { re: m11.re, im: -m11.im },
  ];
}

// ─── Single gate card ─────────────────────────────────────────────────────────

const GATE_DEFS: { key: GateKey; title: string; sub: string }[] = [
  { key: 'U',  title: 'U',  sub: '(θ, φ, λ)'         },
  { key: 'U1', title: 'U₁', sub: '(θ₁, φ₁, λ₁)'     },
  { key: 'U2', title: 'U₂', sub: '(θ₂, φ₂, λ₂)'     },
];

const DEFAULTS: Record<GateKey, SliderParams> = {
  U:  { t: 0, p: 0, l: 0 },
  U1: { t: 2, p: 0, l: 0 },   // θ = π/2
  U2: { t: 0, p: 2, l: 0 },   // φ = π/2
};

interface CardProps {
  def: typeof GATE_DEFS[0];
  params: SliderParams;
  onChange: (params: SliderParams) => void;
  onApply: () => void;
  qubit: number;
  qubits: number;
  onQubitChange: (q: number) => void;
  isDarkMode: boolean;
}

const GateCard: React.FC<CardProps> = ({ def, params, onChange, onApply, qubit, qubits, onQubitChange, isDarkMode }) => {
  const [expanded,  setExpanded]  = useState(true);
  const [showProof, setShowProof] = useState(false);
  const [proofPos,  setProofPos]  = useState({ top: 0, left: 0 });
  const proofBtnRef = useRef<HTMLButtonElement>(null);

  // Computed directly (not memoised) so the display always reflects the latest slider values
  const matrix  = computeMatrix(toRad(params.t), toRad(params.p), toRad(params.l));
  const unitary = isUnitary(matrix);
  const dagger  = matDagger(matrix);
  const product = matMul(matrix, dagger);   // U · U†

  const card  = isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200';
  const dim   = isDarkMode ? 'text-slate-400' : 'text-gray-500';
  const mono  = isDarkMode ? 'bg-slate-950 text-slate-200 border-slate-700' : 'bg-gray-50 text-gray-800 border-gray-200';
  const track = isDarkMode
    ? '[&::-webkit-slider-runnable-track]:bg-slate-700 [&::-webkit-slider-thumb]:bg-purple-500'
    : '[&::-webkit-slider-runnable-track]:bg-gray-200 [&::-webkit-slider-thumb]:bg-purple-600';

  const sliders: { key: keyof SliderParams; sym: string }[] = [
    { key: 't', sym: 'θ' },
    { key: 'p', sym: 'φ' },
    { key: 'l', sym: 'λ' },
  ];

  return (
    <div className={`rounded-2xl border shadow-xl overflow-hidden ${card}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="font-semibold text-sm">
          {def.title}
          <span className={`ml-1 text-xs font-normal ${dim}`}>{def.sub}</span>
        </span>
        <div className="flex items-center gap-2">
          {unitary
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            : <XCircle     className="w-3.5 h-3.5 text-red-400"     />
          }
          {expanded
            ? <ChevronUp   className={`w-3.5 h-3.5 ${dim}`} />
            : <ChevronDown className={`w-3.5 h-3.5 ${dim}`} />
          }
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Sliders */}
          {sliders.map(({ key, sym }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{sym}</span>
                <span className={`text-xs font-mono font-semibold text-purple-400`}>
                  {piLabel(params[key])}
                </span>
              </div>
              <input
                type="range"
                min="-8" max="8" step="1"
                value={params[key]}
                onChange={e => onChange({ ...params, [key]: parseInt(e.target.value) })}
                className={`w-full h-2 rounded-full appearance-none cursor-pointer outline-none ${track}`}
              />
              {/* Tick marks */}
              <div className={`flex justify-between mt-0.5 text-[9px] font-mono ${isDarkMode ? 'text-slate-700' : 'text-gray-300'}`}>
                {['-2π', '-π', '-π/2', '0', 'π/2', 'π', '2π'].map(v => (
                  <span key={v}>{v}</span>
                ))}
              </div>
            </div>
          ))}

          {/* Matrix display */}
          <div>
            <p className={`text-[10px] font-medium uppercase tracking-widest mb-1.5 ${dim}`}>
              2×2 Unitary Matrix
            </p>
            <div className={`rounded-xl border p-3 font-mono text-xs ${mono}`}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {matrix.map((cell, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className={`text-[9px] ${isDarkMode ? 'text-slate-600' : 'text-gray-400'}`}>
                      [{Math.floor(idx / 2)},{idx % 2}]
                    </span>
                    <span className={fmtC(cell) === '0' ? (isDarkMode ? 'text-slate-600' : 'text-gray-400') : ''}>
                      {fmtC(cell)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Unitary status + proof tooltip */}
            <div className="relative mt-2">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${unitary ? 'text-emerald-400' : 'text-red-400'}`}>
                {unitary
                  ? <><CheckCircle className="w-3 h-3" /> U†U = I — matrix is unitary</>
                  : <><XCircle     className="w-3 h-3" /> Not unitary — invalid parameters</>
                }
                {/* Info button */}
                <button
                  ref={proofBtnRef}
                  onMouseEnter={() => {
                    if (proofBtnRef.current) {
                      const r = proofBtnRef.current.getBoundingClientRect();
                      setProofPos({ top: r.bottom + 6, left: r.left });
                    }
                    setShowProof(true);
                  }}
                  onMouseLeave={() => setShowProof(false)}
                  className={`ml-1 w-4 h-4 rounded-full border text-[10px] font-bold flex items-center justify-center transition-colors ${
                    isDarkMode
                      ? 'border-slate-500 text-slate-400 hover:border-purple-400 hover:text-purple-400'
                      : 'border-gray-400 text-gray-500 hover:border-purple-500 hover:text-purple-500'
                  }`}
                >
                  i
                </button>
              </div>

              {/* Proof popover — rendered in body portal to escape overflow:hidden */}
              {showProof && ReactDOM.createPortal(
                <div
                  style={{ position: 'fixed', top: proofPos.top, left: proofPos.left, zIndex: 9999 }}
                  className={`rounded-xl border shadow-2xl p-3 text-[10px] font-mono w-72 ${
                    isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-gray-200 text-gray-800'
                  }`}
                >
                  <p className={`text-[9px] uppercase tracking-widest font-semibold mb-2 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>
                    Unitariness proof: U · U† = I
                  </p>
                  <p className={`text-[9px] mb-0.5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>U =</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-2 mb-2">
                    {matrix.map((c, i) => (
                      <span key={i} className={fmtC(c) === '0' ? (isDarkMode ? 'text-slate-600' : 'text-gray-300') : ''}>
                        [{Math.floor(i/2)},{i%2}] {fmtC(c)}
                      </span>
                    ))}
                  </div>
                  <p className={`text-[9px] mb-0.5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>U† =</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-2 mb-2">
                    {dagger.map((c, i) => (
                      <span key={i} className={fmtC(c) === '0' ? (isDarkMode ? 'text-slate-600' : 'text-gray-300') : ''}>
                        [{Math.floor(i/2)},{i%2}] {fmtC(c)}
                      </span>
                    ))}
                  </div>
                  <p className={`text-[9px] mb-0.5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`}>U · U† =</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pl-2 mb-2">
                    {product.map((c, i) => (
                      <span key={i} className={fmtC(c) === '0' ? (isDarkMode ? 'text-slate-600' : 'text-gray-300') : 'text-emerald-400'}>
                        [{Math.floor(i/2)},{i%2}] {fmtC(c)}
                      </span>
                    ))}
                  </div>
                  <div className={`pt-1.5 border-t text-[9px] font-semibold ${unitary ? 'text-emerald-400' : 'text-red-400'} ${isDarkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                    {unitary ? '✓ Product = Identity → Unitary confirmed' : '✗ Product ≠ Identity'}
                  </div>
                </div>,
                document.body,
              )}
            </div>
          </div>

          {/* Target qubit + Apply */}
          <div className="flex items-center gap-3">
            <label className={`flex items-center gap-1.5 text-xs ${dim}`}>
              Target qubit
              <select
                value={qubit}
                onChange={e => onQubitChange(parseInt(e.target.value))}
                className={`rounded-lg px-2 py-1.5 text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500/40 ${
                  isDarkMode ? 'bg-slate-950 border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
                }`}
              >
                {Array.from({ length: qubits }, (_, i) => (
                  <option key={i} value={i}>q{i}</option>
                ))}
              </select>
            </label>

            <button
              onClick={onApply}
              disabled={!unitary}
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-purple-500/20"
            >
              Apply {def.title}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main export ──────────────────────────────────────────────────────────────

export const ParametrizedGates: React.FC<Props> = ({ onApplyGate, qubits, isDarkMode }) => {
  const [sliders, setSliders] = useState<Record<GateKey, SliderParams>>(DEFAULTS);
  const [targets, setTargets] = useState<Record<GateKey, number>>({ U: 0, U1: 0, U2: 0 });

  return (
    <div className="space-y-4">
      {GATE_DEFS.map(def => (
        <GateCard
          key={def.key}
          def={def}
          params={sliders[def.key]}
          onChange={p => setSliders(prev => ({ ...prev, [def.key]: p }))}
          onApply={() =>
            onApplyGate(
              def.key,
              targets[def.key],
              toRad(sliders[def.key].t),
              toRad(sliders[def.key].p),
              toRad(sliders[def.key].l),
            )
          }
          qubit={targets[def.key]}
          qubits={qubits}
          onQubitChange={q => setTargets(prev => ({ ...prev, [def.key]: q }))}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
};
