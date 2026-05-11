import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

import streamlit as st
import numpy as np

from backend import (
    parse_circuit,
    apply_circuit,
    format_output,
    circuit_to_qasm,
    _gen_qiskit,
    _gen_cirq,
    _gen_braket,
    _gen_cudaq,
    _gen_pennylane,
)

st.set_page_config(page_title="Quantum Circuit Simulator", layout="wide")
st.title("Quantum Circuit Simulator")
st.markdown(
    "An interactive simulator for designing and running quantum circuits. "
    "Build circuits using standard quantum gates, export to OpenQASM 2.0, "
    "and execute code across multiple quantum frameworks — all in your browser."
)
st.caption("by Khaled Alahmadi · COE619 · King Fahd University of Petroleum & Minerals")

tab1, tab2, tab3, tab4, tab5 = st.tabs(
    ["Simulate", "QASM", "Code Runner", "Generate Code", "🎛 Visual Editor"]
)

# ── Tab 1: Simulate ──────────────────────────────────────────────────────────
with tab1:
    st.subheader("Circuit Simulation")
    st.markdown(
        "Simulate a quantum circuit using the built-in state-vector engine or PennyLane. "
        "Enter your circuit in the custom text format: **one qubit per line**, gates separated by `-`. "
        "Use `I` for identity (no gate). Example: `H-I` applies Hadamard to qubit 0 in moment 1, identity in moment 2."
    )

    circuit_input = st.text_area(
        "Circuit Input",
        value="H-I\nI-X",
        height=150,
        help="Example: H-I\\nI-X  →  Hadamard on qubit 0, X on qubit 1"
    )

    col1, col2 = st.columns(2)

    with col1:
        if st.button("Run (Custom Simulator)", use_container_width=True):
            try:
                circuit = parse_circuit(circuit_input)
                final_state = apply_circuit(circuit)
                report = format_output(final_state)
                st.text("Results:")
                st.code(report, language=None)
            except Exception as e:
                st.error(f"Simulation error: {e}")

    with col2:
        if st.button("Run (PennyLane)", use_container_width=True):
            try:
                import pennylane as qml

                circuit = parse_circuit(circuit_input)
                num_wires = len(circuit)
                state = apply_circuit(circuit)

                dev = qml.device("default.qubit", wires=num_wires)

                @qml.qnode(dev)
                def qnode():
                    qml.StatePrep(state, wires=range(num_wires))
                    return qml.state()

                pl_state = qnode()
                pl_probs = np.abs(pl_state) ** 2

                st.text("PennyLane Results:")
                lines = []
                for i, p in enumerate(pl_probs):
                    if p > 1e-6:
                        bs = format(i, f"0{num_wires}b")
                        bar = "█" * round(p * 20) + "░" * (20 - round(p * 20))
                        lines.append(f"|{bs}⟩  {bar}  {round(p * 100, 1)}%")
                st.code("\n".join(lines), language=None)

                probs_dict = {
                    format(i, f"0{num_wires}b"): float(p)
                    for i, p in enumerate(pl_probs) if p > 1e-6
                }
                if probs_dict:
                    st.bar_chart(probs_dict)

            except Exception as e:
                st.error(f"PennyLane error: {e}")

# ── Tab 2: QASM ───────────────────────────────────────────────────────────────
with tab2:
    st.subheader("Generate QASM")
    st.markdown(
        "Convert your circuit to **OpenQASM 2.0** — the standard open quantum assembly language. "
        "The generated QASM code can be imported into IBM Quantum, Qiskit, PennyLane, and other compatible tools."
    )

    qasm_circuit = st.text_area(
        "Circuit Input",
        value="H-I\nI-X",
        height=150,
        key="qasm_circuit"
    )

    if st.button("Generate QASM", use_container_width=True):
        try:
            circuit = parse_circuit(qasm_circuit)
            qasm_code = circuit_to_qasm(circuit)
            st.text("OpenQASM 2.0 Output:")
            st.code(qasm_code, language="qasm")
        except Exception as e:
            st.error(f"Error: {e}")

# ── Tab 3: Code Runner ────────────────────────────────────────────────────────
with tab3:
    st.subheader("Python Code Runner")
    st.markdown(
        "Write and execute quantum code directly in the browser using your framework of choice. "
        "Select a framework below to load a working Bell-state example, then modify and run it. "
        "Measurement counts are automatically plotted as a bar chart when available."
    )

    EXAMPLES = {
        "Qiskit": """\
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])

simulator = AerSimulator()
job = simulator.run(qc, shots=1024)
result = job.result()
counts = {k[::-1]: v for k, v in result.get_counts().items()}
print("Measurement counts:")
for state, count in sorted(counts.items()):
    bar = "█" * int(count / max(counts.values()) * 20)
    print(f"  |{state}⟩  {bar}  {count}")
""",
        "Cirq": """\
import cirq

q0, q1 = cirq.LineQubit.range(2)
circuit = cirq.Circuit([
    cirq.H(q0),
    cirq.CNOT(q0, q1),
    cirq.measure(q0, q1, key='result')
])
print(circuit)

simulator = cirq.Simulator()
result = simulator.run(circuit, repetitions=1024)
counts = dict(result.multi_measurement_histogram(keys=['result']))
counts = {format(k[0], '02b'): v for k, v in counts.items()}
print("\\nMeasurement counts:")
for state, count in sorted(counts.items()):
    bar = "█" * int(count / max(counts.values()) * 20)
    print(f"  |{state}⟩  {bar}  {count}")
""",
        "Braket": """\
from braket.circuits import Circuit
from braket.devices import LocalSimulator

circuit = Circuit()
circuit.h(0)
circuit.cnot(0, 1)

device = LocalSimulator()
task = device.run(circuit, shots=1024)
result = task.result()
counts = result.measurement_counts
print("Measurement counts:")
for state, count in sorted(counts.items()):
    bar = "█" * int(count / max(counts.values()) * 20)
    print(f"  |{state}⟩  {bar}  {count}")
""",
        "PennyLane": """\
import pennylane as qml
import numpy as np

dev = qml.device("default.qubit", wires=2)

@qml.qnode(dev)
def circuit():
    qml.Hadamard(wires=0)
    qml.CNOT(wires=[0, 1])
    return qml.state()

state = circuit()
probs = np.abs(state) ** 2
print("State vector:")
for i, (amp, p) in enumerate(zip(state, probs)):
    if p > 1e-6:
        bs = format(i, "02b")
        bar = "█" * round(p * 20)
        print(f"  |{bs}⟩  {bar}  {round(p * 100, 1)}%")
""",
        "CUDA-Q": None,
    }

    runner_fw = st.selectbox("Framework", list(EXAMPLES.keys()), key="runner_fw")

    if EXAMPLES[runner_fw] is None:
        st.warning("CUDA-Q requires a local GPU environment with CUDA installed and cannot run on Streamlit Cloud. Generate the code in the Generate Code tab and run it locally.")
    else:
        code_input = st.text_area("Python Code", value=EXAMPLES[runner_fw], height=300, key=f"code_{runner_fw}")

        if st.button("Execute", use_container_width=True):
            import subprocess, tempfile, json, re

            code = code_input
            JSON_INJECT = (
                "\nimport json as _json"
                "\ntry:"
                "\n    with open('counts.json', 'w') as _f:"
                "\n        _json.dump({str(k): int(v) for k, v in counts.items()}, _f)"
                "\nexcept Exception:"
                "\n    pass"
            )
            if any(fw in code for fw in ["qiskit", "braket", "cirq"]) and "counts" in code:
                code += JSON_INJECT

            code = re.sub(r'(?<!\w)j(?!\w)', '1j', code)

            if os.path.exists("counts.json"):
                os.remove("counts.json")

            try:
                with tempfile.NamedTemporaryFile(mode="w+", suffix=".py", delete=False) as f:
                    f.write(code)
                    fname = f.name

                proc = subprocess.run(
                    [sys.executable, fname],
                    capture_output=True, text=True, timeout=60
                )

                if proc.stdout:
                    st.text("Output:")
                    st.code(proc.stdout, language=None)
                if proc.stderr:
                    st.warning("Stderr:")
                    st.code(proc.stderr, language=None)
                if proc.returncode != 0:
                    st.error(f"Process exited with code {proc.returncode}")

                if os.path.exists("counts.json"):
                    with open("counts.json") as cf:
                        counts = json.load(cf)
                    st.subheader("Measurement Counts")
                    st.bar_chart(counts)
                    os.remove("counts.json")

            except subprocess.TimeoutExpired:
                st.error("Execution timed out (60s limit).")
            except Exception as e:
                st.error(f"Error: {e}")

# ── Tab 4: Generate Code ──────────────────────────────────────────────────────
with tab4:
    st.subheader("Generate Framework Code")
    st.markdown(
        "Paste any valid **OpenQASM 2.0** circuit and instantly generate ready-to-run Python code "
        "for your target framework. Useful for porting circuits between tools or learning how different "
        "frameworks express the same quantum operations."
    )

    qasm_for_gen = st.text_area(
        "QASM Input",
        value='OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\nh q[0];\ncx q[0], q[1];\nmeasure q[0] -> c[0];\nmeasure q[1] -> c[1];',
        height=200,
        key="gen_qasm"
    )

    framework = st.selectbox(
        "Target Framework",
        ["qiskit", "cirq", "braket", "cudaq", "pennylane"]
    )

    generators = {
        "qiskit":    _gen_qiskit,
        "cirq":      _gen_cirq,
        "braket":    _gen_braket,
        "cudaq":     _gen_cudaq,
        "pennylane": _gen_pennylane,
    }

    if st.button("Generate Code", use_container_width=True):
        try:
            code = generators[framework](qasm_for_gen)
            st.text(f"Generated {framework.capitalize()} Code:")
            st.code(code, language="python")
        except Exception as e:
            st.error(f"Error: {e}")

# ── Tab 5: Visual Editor ──────────────────────────────────────────────────────
with tab5:
    st.subheader("Visual Circuit Editor")
    st.markdown(
        "Build your circuit visually. **Select a gate** from the palette, then **click a cell** to place it. "
        "For two-qubit gates (CNOT, CZ, SWAP), click the **first qubit** (control), then the **second qubit** "
        "(target) in the **same time step**. Use the sliders to configure rotation and unitary gate parameters."
    )

    # ── Session state init ────────────────────────────────────────────────────
    if "vc_grid" not in st.session_state:
        st.session_state.vc_grid = [["I"] * 6 for _ in range(3)]
    if "vc_pending" not in st.session_state:
        st.session_state.vc_pending = None   # (qubit, moment) of first click
    if "vc_selected" not in st.session_state:
        st.session_state.vc_selected = "H"

    # ── Circuit size controls ─────────────────────────────────────────────────
    cc1, cc2, cc3, cc4 = st.columns([1, 1, 1, 1])
    with cc1:
        nq = st.number_input("Qubits", 1, 6, len(st.session_state.vc_grid), key="vc_nq")
    with cc2:
        nm = st.number_input("Moments", 1, 12, len(st.session_state.vc_grid[0]), key="vc_nm")
    with cc3:
        if st.button("🗑 Clear", use_container_width=True):
            st.session_state.vc_grid = [["I"] * int(nm) for _ in range(int(nq))]
            st.session_state.vc_pending = None
            st.rerun()
    with cc4:
        run_visual = st.button("▶ Run Circuit", use_container_width=True, key="vc_run_btn")

    # Resize grid to match nq/nm
    grid = st.session_state.vc_grid
    nq, nm = int(nq), int(nm)
    while len(grid) < nq:
        grid.append(["I"] * nm)
    grid = grid[:nq]
    for i in range(nq):
        while len(grid[i]) < nm:
            grid[i].append("I")
        grid[i] = grid[i][:nm]
    st.session_state.vc_grid = grid

    # ── Gate palette ──────────────────────────────────────────────────────────
    TWO_QUBIT_GATES = {"CNOT", "CZ", "SWAP"}
    GATE_GROUPS = [
        ("Single",   ["H", "X", "Y", "Z", "S", "T", "S†", "T†"]),
        ("Rotation", ["RX", "RY", "RZ"]),
        ("2-Qubit",  ["CNOT", "CZ", "SWAP"]),
        ("Unitary",  ["U"]),
        ("Erase",    ["I"]),
    ]

    sel = st.session_state.vc_selected
    st.markdown("#### Gate Palette")
    for group_label, gates in GATE_GROUPS:
        pcols = st.columns([0.6] + [0.8] * len(gates) + [10 - len(gates)])
        pcols[0].markdown(f"<span style='color:#94a3b8;font-size:0.8em'>{group_label}</span>", unsafe_allow_html=True)
        for gi, g in enumerate(gates):
            is_sel = g == sel
            btn_style = "**:violet[" + g + "]**" if is_sel else g
            if pcols[gi + 1].button(btn_style, key=f"pal_{g}"):
                st.session_state.vc_selected = g
                st.session_state.vc_pending = None
                st.rerun()

    # ── Parameter sliders ─────────────────────────────────────────────────────
    if sel in ("RX", "RY", "RZ"):
        rot_angle = st.slider(
            f"{sel} angle (radians)", -3.14159, 3.14159, 1.5708, 0.01,
            format="%.4f", key="vc_rot_angle"
        )
        st.caption(f"Current: {sel}({rot_angle:.4f} rad  ≈  {np.degrees(rot_angle):.1f}°)")
    elif sel == "U":
        sc1, sc2, sc3 = st.columns(3)
        u_theta = sc1.slider("θ (theta)", 0.0, 6.2832, 1.5708, 0.01, format="%.4f", key="vc_u_theta")
        u_phi   = sc2.slider("φ (phi)",   0.0, 6.2832, 0.0,    0.01, format="%.4f", key="vc_u_phi")
        u_lam   = sc3.slider("λ (lambda)", 0.0, 6.2832, 0.0,   0.01, format="%.4f", key="vc_u_lam")
        st.caption(f"U({u_theta:.3f}, {u_phi:.3f}, {u_lam:.3f})")

    # ── Pending state notice ──────────────────────────────────────────────────
    pending = st.session_state.vc_pending
    if pending:
        st.info(f"🔵 **{sel}** — first qubit set at q{pending[0]}, t{pending[1]+1}. "
                f"Now click the second qubit in the **same column (t{pending[1]+1})**.")

    # ── Gate visual config ────────────────────────────────────────────────────
    GATE_COLORS = {
        "H": "#7c3aed", "X": "#2563eb", "Y": "#0891b2", "Z": "#059669",
        "S": "#d97706", "T": "#d97706", "S†": "#b45309", "T†": "#b45309",
        "CNOT_ctrl": "#dc2626", "CNOT_tgt": "#dc2626",
        "CZ_ctrl": "#9333ea",   "CZ_tgt": "#9333ea",
        "SWAP_0": "#0284c7",    "SWAP_1": "#0284c7",
    }
    GATE_SYMBOLS = {
        "I": "─", "H": "H", "X": "X", "Y": "Y", "Z": "Z",
        "S": "S", "T": "T", "S†": "S†", "T†": "T†",
        "CNOT_ctrl": "●", "CNOT_tgt": "⊕",
        "CZ_ctrl": "●",   "CZ_tgt": "Z",
        "SWAP_0": "✕",    "SWAP_1": "✕",
    }

    def cell_symbol(g):
        if g.startswith(("RX", "RY", "RZ")):
            return g[:2]
        if g.startswith("U("):
            return "U"
        return GATE_SYMBOLS.get(g, g[:3])

    def cell_color(g):
        if g.startswith(("RX", "RY", "RZ")):
            return "#0369a1"
        if g.startswith("U("):
            return "#ea580c"
        return GATE_COLORS.get(g, "#374151")

    # ── HTML visual circuit display ───────────────────────────────────────────
    st.markdown("---")
    st.markdown("#### Circuit")

    header_cells = ['<th style="width:40px"></th>']
    for m in range(nm):
        header_cells.append(
            f'<th style="text-align:center;color:#64748b;font-size:0.8em;'
            f'padding:4px 8px;min-width:56px">t{m+1}</th>'
        )
    html_rows = [f"<tr>{''.join(header_cells)}</tr>"]

    for q in range(nq):
        cells = [f'<td style="color:#94a3b8;font-weight:bold;padding:4px 8px;font-size:0.9em">q{q}</td>']
        for m in range(nm):
            g = grid[q][m]
            sym   = cell_symbol(g)
            color = cell_color(g)
            is_empty = g == "I"
            bg     = "#0f172a" if is_empty else f"{color}22"
            border = "1px solid #1e293b" if is_empty else f"2px solid {color}"
            glow   = ""
            if pending and pending == (q, m):
                border = "2px solid #fbbf24"
                glow   = "box-shadow:0 0 8px #fbbf2488;"
            cells.append(
                f'<td style="text-align:center;padding:6px 4px;">'
                f'<div style="border:{border};border-radius:6px;'
                f'background:{bg};color:{color};font-weight:bold;'
                f'font-size:0.95em;padding:4px 8px;min-width:48px;{glow}">'
                f'{sym}</div></td>'
            )
        # Vertical connector lines between two-qubit gate pairs in the same moment
        html_rows.append(f"<tr>{''.join(cells)}</tr>")

    st.markdown(
        f'<div style="overflow-x:auto"><table style="border-collapse:separate;'
        f'border-spacing:4px 2px;margin-bottom:8px">{"".join(html_rows)}</table></div>',
        unsafe_allow_html=True,
    )

    # ── Interactive button grid ───────────────────────────────────────────────
    st.markdown("**Click a cell to place the selected gate:**")

    hdr = st.columns([0.5] + [1] * nm)
    for m in range(nm):
        hdr[m + 1].markdown(
            f"<div style='text-align:center;color:#64748b;font-size:0.8em'>t{m+1}</div>",
            unsafe_allow_html=True,
        )

    for q in range(nq):
        row = st.columns([0.5] + [1] * nm)
        row[0].markdown(f"<div style='padding-top:6px;font-weight:bold'>q{q}</div>", unsafe_allow_html=True)
        for m in range(nm):
            g = grid[q][m]
            sym = cell_symbol(g)
            lbl = f"[{sym}]" if g != "I" else "─"
            if pending and pending == (q, m):
                lbl = "🔵"

            if row[m + 1].button(lbl, key=f"vc_{q}_{m}"):
                gate = st.session_state.vc_selected

                if gate in TWO_QUBIT_GATES:
                    if pending is None:
                        st.session_state.vc_pending = (q, m)
                    else:
                        pq, pm = pending
                        if pm == m and pq != q:
                            if gate == "CNOT":
                                grid[pq][m] = "CNOT_ctrl"
                                grid[q][m]  = "CNOT_tgt"
                            elif gate == "CZ":
                                grid[min(pq,q)][m] = "CZ_ctrl"
                                grid[max(pq,q)][m] = "CZ_tgt"
                            elif gate == "SWAP":
                                grid[pq][m] = "SWAP_0"
                                grid[q][m]  = "SWAP_1"
                            st.session_state.vc_grid = grid
                        st.session_state.vc_pending = None
                    st.rerun()

                else:
                    if gate == "I":
                        grid[q][m] = "I"
                    elif gate in ("RX", "RY", "RZ"):
                        angle = st.session_state.get("vc_rot_angle", 1.5708)
                        grid[q][m] = f"{gate}{angle:.4f}"
                    elif gate == "U":
                        th = st.session_state.get("vc_u_theta", 1.5708)
                        ph = st.session_state.get("vc_u_phi",   0.0)
                        la = st.session_state.get("vc_u_lam",   0.0)
                        grid[q][m] = f"U({th:.4f},{ph:.4f},{la:.4f})"
                    else:
                        grid[q][m] = gate
                    st.session_state.vc_grid = grid
                    st.rerun()

    # ── Run circuit ───────────────────────────────────────────────────────────
    if run_visual:
        try:
            import pennylane as qml

            dev = qml.device("default.qubit", wires=nq)

            @qml.qnode(dev)
            def vc_qnode():
                for t in range(nm):
                    processed = set()
                    for q in range(nq):
                        if q in processed:
                            continue
                        g = grid[q][t]
                        if g == "I":
                            pass
                        elif g == "H":   qml.Hadamard(wires=q)
                        elif g == "X":   qml.PauliX(wires=q)
                        elif g == "Y":   qml.PauliY(wires=q)
                        elif g == "Z":   qml.PauliZ(wires=q)
                        elif g == "S":   qml.S(wires=q)
                        elif g == "T":   qml.T(wires=q)
                        elif g in ("S†", "Sdg"): qml.adjoint(qml.S)(wires=q)
                        elif g in ("T†", "Tdg"): qml.adjoint(qml.T)(wires=q)
                        elif g.startswith("RX"):
                            qml.RX(float(g[2:]), wires=q)
                        elif g.startswith("RY"):
                            qml.RY(float(g[2:]), wires=q)
                        elif g.startswith("RZ"):
                            qml.RZ(float(g[2:]), wires=q)
                        elif g.startswith("U("):
                            params = g[2:-1].split(",")
                            qml.U3(float(params[0]), float(params[1]), float(params[2]), wires=q)
                        elif g == "CNOT_ctrl":
                            tgt = next((r for r in range(nq) if r != q and grid[r][t] == "CNOT_tgt"), None)
                            if tgt is not None:
                                qml.CNOT(wires=[q, tgt])
                                processed.add(tgt)
                        elif g == "CZ_ctrl":
                            tgt = next((r for r in range(nq) if r != q and grid[r][t] == "CZ_tgt"), None)
                            if tgt is not None:
                                qml.CZ(wires=[q, tgt])
                                processed.add(tgt)
                        elif g == "SWAP_0":
                            tgt = next((r for r in range(nq) if r != q and grid[r][t] == "SWAP_1"), None)
                            if tgt is not None:
                                qml.SWAP(wires=[q, tgt])
                                processed.add(tgt)
                return qml.state()

            state  = vc_qnode()
            probs  = np.abs(state) ** 2

            st.markdown("---")
            st.subheader("Simulation Results")
            lines = []
            for i, p in enumerate(probs):
                if p > 1e-6:
                    bs  = format(i, f"0{nq}b")
                    bar = "█" * round(p * 20) + "░" * (20 - round(p * 20))
                    lines.append(f"|{bs}⟩  {bar}  {round(p * 100, 1)}%")
            st.code("\n".join(lines) if lines else "(no significant amplitudes)", language=None)

            probs_dict = {
                format(i, f"0{nq}b"): float(p)
                for i, p in enumerate(probs) if p > 1e-6
            }
            if probs_dict:
                st.bar_chart(probs_dict)

            qasm_out = circuit_to_qasm([
                [
                    {"I":"I","H":"H","X":"X","Y":"Y","Z":"Z","S":"S","T":"T",
                     "S†":"S†","T†":"T†","CNOT_ctrl":"X#0","CNOT_tgt":"X#1",
                     "CZ_ctrl":"Z#0","CZ_tgt":"Z#1","SWAP_0":"S#0","SWAP_1":"S#1"
                    }.get(g, g if not g.startswith("U(") else "U")
                    for g in row
                ]
                for row in grid
            ])
            with st.expander("View QASM"):
                st.code(qasm_out, language="qasm")

        except Exception as e:
            st.error(f"Simulation error: {e}")

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("About")
    st.markdown("**Quantum Circuit Simulator**")
    st.markdown("COE619 — Quantum Computing")
    st.markdown("King Fahd University of Petroleum & Minerals")
    st.markdown("**by Khaled Alahmadi**")
    st.markdown("---")
    st.markdown("**Supported Gates**")
    st.markdown(
        "| Type | Gates |\n"
        "|------|-------|\n"
        "| Single-qubit | H, X, Y, Z, S, T, I |\n"
        "| Phase | S†, T†, P |\n"
        "| Rotation | RX, RY, RZ |\n"
        "| Two-qubit | CNOT, CZ, SWAP |\n"
        "| Controlled | CRX, CRY, CRZ |\n"
        "| Unitary | U(θ,φ,λ) |"
    )
    st.markdown("---")
    st.markdown("**Run locally:**")
    st.code("streamlit run streamlit_app.py", language="bash")
