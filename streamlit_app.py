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

tab1, tab2, tab3, tab4 = st.tabs(["Simulate", "QASM", "Code Runner", "Generate Code"])

# ── Tab 1: Simulate ──────────────────────────────────────────────────────────
with tab1:
    st.subheader("Circuit Simulation")
    st.markdown("Enter your circuit in the custom text format (one qubit per line, gates separated by `-`).")

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

                # Get state vector via the native backend simulator
                state = apply_circuit(circuit)
                probs = np.abs(state) ** 2

                # Wrap in a PennyLane QubitStateVector circuit to get qml.state()
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
    st.markdown("Convert your circuit to OpenQASM 2.0 format.")

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
    st.markdown("Run Qiskit, Cirq, Braket, or PennyLane code.")

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
        st.warning("CUDA-Q requires a local GPU environment with CUDA installed and cannot run on Streamlit Cloud. Generate the code below and run it locally.")
    else:
        if "runner_code" not in st.session_state or st.session_state.get("runner_fw_prev") != runner_fw:
            st.session_state["runner_code"] = EXAMPLES[runner_fw]
        st.session_state["runner_fw_prev"] = runner_fw

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
                    ["python3", fname],
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
                    with open("counts.json") as f:
                        counts = json.load(f)
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
    st.markdown("Convert a QASM circuit into framework-specific Python code.")

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

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("About")
    st.markdown("Quantum Circuit Simulator — COE619")
    st.markdown("Supports: H, X, Y, Z, T, S, CNOT, SWAP, RX/RY/RZ, CRX/CRY/CRZ, Unitary gates")
    st.markdown("---")
    st.markdown("**Run locally:**")
    st.code("streamlit run streamlit_app.py", language="bash")
