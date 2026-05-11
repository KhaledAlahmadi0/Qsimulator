import streamlit as st
import requests
import json

API_URL = "http://localhost:7900"

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
                res = requests.post(f"{API_URL}/compute", data=circuit_input, timeout=30)
                if res.ok:
                    st.text("Results:")
                    st.code(res.text, language=None)
                else:
                    st.error(f"Error {res.status_code}: {res.text}")
            except requests.exceptions.ConnectionError:
                st.error("Cannot reach backend. Make sure Flask is running on port 7900.")

    with col2:
        if st.button("Run (PennyLane via QASM)", use_container_width=True):
            try:
                # First generate QASM from the circuit
                qasm_res = requests.post(f"{API_URL}/QASM", data=circuit_input, timeout=30)
                if not qasm_res.ok:
                    st.error(f"QASM generation failed: {qasm_res.text}")
                else:
                    # Then simulate with PennyLane
                    pl_res = requests.post(f"{API_URL}/simulate-pennylane", json={}, timeout=30)
                    if pl_res.ok:
                        data = pl_res.json()
                        st.text("PennyLane Results:")
                        st.code(data.get("stdout", ""), language=None)
                        if "probs" in data:
                            st.bar_chart(data["probs"])
                    else:
                        st.error(f"Error {pl_res.status_code}: {pl_res.text}")
            except requests.exceptions.ConnectionError:
                st.error("Cannot reach backend. Make sure Flask is running on port 7900.")

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
            res = requests.post(f"{API_URL}/QASM", data=qasm_circuit, timeout=30)
            if res.ok:
                st.text("OpenQASM 2.0 Output:")
                st.code(res.text, language="qasm")
            else:
                st.error(f"Error {res.status_code}: {res.text}")
        except requests.exceptions.ConnectionError:
            st.error("Cannot reach backend. Make sure Flask is running on port 7900.")

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
        try:
            res = requests.post(f"{API_URL}/execute-python", json={"code": code_input}, timeout=60)
            if res.ok:
                data = res.json()
                if data.get("stdout"):
                    st.text("Output:")
                    st.code(data["stdout"], language=None)
                if data.get("stderr"):
                    st.warning("Stderr:")
                    st.code(data["stderr"], language=None)
                if data.get("counts"):
                    st.subheader("Measurement Counts")
                    st.bar_chart(data["counts"])
                if data.get("returncode", 0) != 0:
                    st.error(f"Process exited with code {data['returncode']}")
            else:
                st.error(f"Error {res.status_code}: {res.text}")
        except requests.exceptions.ConnectionError:
            st.error("Cannot reach backend. Make sure Flask is running on port 7900.")

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

    if st.button("Generate Code", use_container_width=True):
        try:
            res = requests.post(
                f"{API_URL}/generate-code",
                json={"qasm": qasm_for_gen, "format": framework},
                timeout=30
            )
            if res.ok:
                data = res.json()
                st.text(f"Generated {framework.capitalize()} Code:")
                st.code(data.get("code", ""), language="python")
            else:
                st.error(f"Error {res.status_code}: {res.text}")
        except requests.exceptions.ConnectionError:
            st.error("Cannot reach backend. Make sure Flask is running on port 7900.")

# ── Sidebar: health check ─────────────────────────────────────────────────────
with st.sidebar:
    st.header("Backend Status")
    if st.button("Check Connection"):
        try:
            res = requests.get(f"{API_URL}/health", timeout=5)
            if res.ok:
                st.success("Backend is running")
            else:
                st.error(f"Backend returned {res.status_code}")
        except requests.exceptions.ConnectionError:
            st.error("Backend offline")

    st.markdown("---")
    st.markdown("**Run the Flask backend:**")
    st.code("python backend/backend.py", language="bash")
    st.markdown("**Run this Streamlit app:**")
    st.code("streamlit run streamlit_app.py", language="bash")
