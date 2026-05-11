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
                import re

                circuit = parse_circuit(circuit_input)
                qasm_text = circuit_to_qasm(circuit)
                qasm_clean = re.sub(r"(?mi)^\s*measure\b.*;$", "", qasm_text)
                num_wires = len(circuit)

                circuit_fn = qml.from_qasm(qasm_clean)
                dev = qml.device("default.qubit", wires=num_wires)

                @qml.qnode(dev)
                def qnode():
                    circuit_fn()
                    return qml.state()

                state = qnode()
                probs = np.abs(state) ** 2

                st.text("PennyLane Results:")
                lines = []
                for i, (amp, p) in enumerate(zip(state, probs)):
                    if p > 1e-6:
                        bs = format(i, f"0{num_wires}b")
                        bar = "█" * round(p * 20) + "░" * (20 - round(p * 20))
                        lines.append(f"|{bs}⟩  {bar}  {round(p * 100, 1)}%")
                st.code("\n".join(lines), language=None)

                probs_dict = {
                    format(i, f"0{num_wires}b"): float(p)
                    for i, p in enumerate(probs) if p > 1e-6
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

    default_code = """\
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qc = QuantumCircuit(2, 2)
qc.h(0)
qc.cx(0, 1)
qc.measure([0, 1], [0, 1])

simulator = AerSimulator()
job = simulator.run(qc, shots=1024)
result = job.result()
counts = result.get_counts()
print(counts)
"""

    code_input = st.text_area("Python Code", value=default_code, height=300)

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

            result = subprocess.run(
                ["python3", fname],
                capture_output=True, text=True, timeout=50
            )

            if result.stdout:
                st.text("Output:")
                st.code(result.stdout, language=None)
            if result.stderr:
                st.warning("Stderr:")
                st.code(result.stderr, language=None)
            if result.returncode != 0:
                st.error(f"Process exited with code {result.returncode}")

            if os.path.exists("counts.json"):
                with open("counts.json") as f:
                    counts = json.load(f)
                st.subheader("Measurement Counts")
                st.bar_chart(counts)
                os.remove("counts.json")

        except subprocess.TimeoutExpired:
            st.error("Execution timed out (50s limit).")
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
