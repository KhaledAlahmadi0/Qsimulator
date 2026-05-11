"""
Quantum Circuit Simulation Backend API

A Flask-based REST API for quantum circuit simulation, QASM generation,
and integration with PennyLane and Qiskit frameworks.

Author: Quantum Simulation Team
Version: 1.0.0
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import re
import subprocess
import tempfile
import os
import json
import pennylane as qml
from typing import Dict, List

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
QASM_FILE = os.path.abspath("circuit.qasm")
QISKIT_FILE = os.path.abspath("qiskit_code.qiskit")

# Disable deferred measurements for compatibility
os.environ["PENNYLANE_DISABLE_DEFERRED_MEASUREMENTS"] = "1"

# =============================================================================
# QUANTUM GATE DEFINITIONS
# =============================================================================

# Single-qubit gates
I = np.eye(2, dtype=complex)
H = (1 / np.sqrt(2)) * np.array([[1, 1], [1, -1]], dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
P = np.array([[1, 0], [0, 1j]], dtype=complex)
T   = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=complex)
Sdg = np.array([[1, 0], [0, -1j]], dtype=complex)
Tdg = np.array([[1, 0], [0, np.exp(-1j * np.pi / 4)]], dtype=complex)

GATE_MAP = {
    'H': H,
    'X': X,
    'Y': Y,
    'Z': Z,
    'P': P,
    'S': P,       # S == P (both are phase gate)
    'T': T,
    'S†': Sdg, 'Sdg': Sdg,
    'T†': Tdg, 'Tdg': Tdg,
    'I': I,
}

# Global unitary parameters (radians)
UNITARY_PARAMS = {
    "UNITARY": {"theta": 0.0, "phi": 0.0, "lambda": 0.0},
    "UNITARY_1": {"theta": 0.0, "phi": 0.0, "lambda": 0.0},
    "UNITARY_2": {"theta": 0.0, "phi": 0.0, "lambda": 0.0},
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def u_matrix(theta: float, phi: float, lam: float) -> np.ndarray:
    """
    Generate U(θ, φ, λ) matrix following OpenQASM 2.0 / Qiskit convention.
    
    Args:
        theta: Rotation angle around Y-axis
        phi: Phase angle
        lam: Additional phase angle
        
    Returns:
        2x2 unitary matrix
    """
    c = np.cos(theta / 2.0)
    s = np.sin(theta / 2.0)
    return np.array([
        [c, -np.exp(1j * lam) * s],
        [np.exp(1j * phi) * s, np.exp(1j * (phi + lam)) * c]
    ], dtype=complex)

def initialize_state(n_qubits: int) -> np.ndarray:
    """Initialize quantum state |00...0⟩."""
    state = np.zeros(2 ** n_qubits, dtype=complex)
    state[0] = 1.0
    return state

def parse_circuit(text: str) -> List[List[str]]:
    """Parse circuit text into 2D array format."""
    lines = text.strip().split('\n')
    return [[item for item in line.split('-') if item] for line in lines]

def apply_controlled_x(state: np.ndarray, control: int, target: int, n_qubits: int) -> np.ndarray:
    """
    Apply CNOT gate using matrix multiplication.
    Works for any pair of control and target qubit indices.
    """
    import functools

    # Projectors
    P0 = np.array([[1, 0], [0, 0]], dtype=complex)
    P1 = np.array([[0, 0], [0, 1]], dtype=complex)

    # Build operator: (I - |1⟩⟨1|_control) ⊗ I + |1⟩⟨1|_control ⊗ X_target
    ops_identity = []
    ops_x = []

    for i in range(n_qubits):
        if i == control:
            ops_identity.append(P0)
            ops_x.append(P1)
        elif i == target:
            ops_identity.append(I)
            ops_x.append(X)
        else:
            ops_identity.append(I)
            ops_x.append(I)

    # Tensor product
    op_I = functools.reduce(np.kron, ops_identity)
    op_X = functools.reduce(np.kron, ops_x)

    return (op_I + op_X) @ state

def apply_controlled_gate(state: np.ndarray, control: int, target: int, gate_matrix: np.ndarray, n_qubits: int) -> np.ndarray:
    """Apply a controlled single-qubit gate to the state vector."""
    import functools
    P0 = np.array([[1, 0], [0, 0]], dtype=complex)
    P1 = np.array([[0, 0], [0, 1]], dtype=complex)
    ops_identity = []
    ops_gate     = []
    for i in range(n_qubits):
        if i == control:
            ops_identity.append(P0)
            ops_gate.append(P1)
        elif i == target:
            ops_identity.append(I)
            ops_gate.append(gate_matrix)
        else:
            ops_identity.append(I)
            ops_gate.append(I)
    op_I = functools.reduce(np.kron, ops_identity)
    op_G = functools.reduce(np.kron, ops_gate)
    return (op_I + op_G) @ state

def apply_swap(state: np.ndarray, q1: int, q2: int, n_qubits: int) -> np.ndarray:
    """Apply SWAP gate to the given state vector."""
    import functools

    if q1 == q2:
        return state

    # SWAP matrix for 2 qubits
    SWAP = np.array([
        [1, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1]
    ], dtype=complex)

    # Permute qubits so q1 and q2 are adjacent
    perm = list(range(n_qubits))
    i, j = sorted([q1, q2])
    perm.pop(j)
    perm.pop(i)
    perm = perm[:i] + [i, j] + perm[i:]

    def permute_state(state, perm):
        dim = len(state)
        n = int(np.log2(dim))
        out = np.zeros_like(state)
        for i in range(dim):
            b = format(i, f'0{n}b')
            pb = ''.join([b[p] for p in perm])
            out[int(pb, 2)] = state[i]
        return out

    def inverse_perm(p):
        inv = [0] * len(p)
        for i, j in enumerate(p):
            inv[j] = i
        return inv

    # Apply permutation, SWAP, then reverse permutation
    state = permute_state(state, perm)
    
    ops = [np.eye(2)] * n_qubits
    ops[i] = SWAP
    ops.pop(i + 1)
    full_swap = functools.reduce(np.kron, ops)
    state = full_swap @ state
    
    return permute_state(state, inverse_perm(perm))

# =============================================================================
# CIRCUIT SIMULATION
# =============================================================================

def apply_circuit(circuit: List[List[str]]) -> np.ndarray:
    """Apply quantum circuit to initial state and return final state."""
    n_qubits = len(circuit)
    n_moments = len(circuit[0])
    state = initialize_state(n_qubits)

    for t in range(n_moments):
        moment_gates = []
        skip_moment = True
        cx_groups   = {}
        swap_groups = {}
        crot_groups = {}  # (base, angle, group_id) -> {control, target}

        # Process each qubit in this moment
        for q in range(n_qubits):
            gate = circuit[q][t]
            if gate == 'I':
                moment_gates.append(I)
                continue

            # Multi-CX gates (e.g., X.0#0)
            match_cx_multi = re.match(r'X\.(\d+)#(\d+)', gate)
            if match_cx_multi:
                group_id, role = map(int, match_cx_multi.groups())
                cx_groups[group_id] = cx_groups.get(group_id, {'control': []})
                if role == 1:
                    cx_groups[group_id]['target'] = q
                else:
                    cx_groups[group_id]['control'].append(q)
                moment_gates.append(None)
                skip_moment = False
                continue

            # Single-CX gates (e.g., X#0, X#1)
            match_cx_single = re.match(r'X#(\d+)', gate)
            if match_cx_single:
                group = 0
                role = int(match_cx_single.group(1))
                cx_groups[group] = cx_groups.get(group, {'control': []})
                if role == 1:
                    cx_groups[group]['target'] = q
                else:
                    cx_groups[group]['control'].append(q)
                moment_gates.append(None)
                skip_moment = False
                continue

            # Multi-SWAP gates (e.g., S.0#0)
            match_swap_multi = re.match(r'S\.(\d+)#(\d+)', gate)
            if match_swap_multi:
                group_id, role = map(int, match_swap_multi.groups())
                swap_groups[group_id] = swap_groups.get(group_id, [])
                swap_groups[group_id].append(q)
                moment_gates.append(None)
                skip_moment = False
                continue

            # Single-SWAP gates (e.g., S#0)
            match_swap_single = re.match(r'S#(\d+)', gate)
            if match_swap_single:
                group_id = 0
                swap_groups[group_id] = swap_groups.get(group_id, [])
                swap_groups[group_id].append(q)
                moment_gates.append(None)
                skip_moment = False
                continue

            # Controlled rotation gates: CRX<angle>.<group>#<role>
            match_crot = re.match(r'(CRX|CRY|CRZ)([-\d.]+)\.(\d+)#(\d+)', gate)
            if match_crot:
                base, angle_str, gid_str, role_str = match_crot.groups()
                angle = float(angle_str)
                gid   = int(gid_str)
                role  = int(role_str)
                key   = (base, angle, gid)
                if key not in crot_groups:
                    crot_groups[key] = {}
                if role == 0:
                    crot_groups[key]['control'] = q
                else:
                    crot_groups[key]['target'] = q
                moment_gates.append(None)
                skip_moment = False
                continue

            # Rotation gates: RX<angle>, RY<angle>, RZ<angle>
            match_rot = re.match(r'(RX|RY|RZ)([-\d.]+)?$', gate)
            if match_rot:
                base  = match_rot.group(1)
                angle = float(match_rot.group(2)) if match_rot.group(2) else 0.0
                c, s  = np.cos(angle / 2), np.sin(angle / 2)
                if base == 'RX':
                    matrix = np.array([[c, -1j * s], [-1j * s, c]], dtype=complex)
                elif base == 'RY':
                    matrix = np.array([[c, -s], [s, c]], dtype=complex)
                else:  # RZ
                    matrix = np.array([[np.exp(-1j * angle / 2), 0],
                                       [0, np.exp(1j * angle / 2)]], dtype=complex)
                moment_gates.append(matrix)
                skip_moment = False
                continue

            # Single-qubit gates
            sq_matrix: np.ndarray = GATE_MAP.get(gate, I)  # type: ignore[assignment]
            moment_gates.append(sq_matrix)
            skip_moment = False

        if skip_moment:
            continue

        # Apply single-qubit gates
        full_gate: np.ndarray = I
        first = True
        for g in moment_gates:
            m = I if g is None else g
            full_gate = m if first else np.kron(full_gate, m)
            first = False
        state = np.matmul(full_gate, state)

        # Apply CX groups
        for group in cx_groups.values():
            controls = group.get('control', [])
            target = group.get('target')
            if controls and target is not None:
                for ctrl in controls:
                    state = apply_controlled_x(state, ctrl, target, n_qubits)

        # Apply SWAP groups
        for group_id, group in swap_groups.items():
            if len(group) == 2:
                q1, q2 = group
                state = apply_swap(state, q1, q2, n_qubits)

        # Apply controlled rotation groups
        for (base, angle, _gid), grp in crot_groups.items():
            ctrl   = grp.get('control')
            target = grp.get('target')
            if ctrl is not None and target is not None:
                c, s = np.cos(angle / 2), np.sin(angle / 2)
                if base == 'CRX':
                    rot = np.array([[c, -1j * s], [-1j * s, c]], dtype=complex)
                elif base == 'CRY':
                    rot = np.array([[c, -s], [s, c]], dtype=complex)
                else:  # CRZ
                    rot = np.array([[np.exp(-1j * angle / 2), 0],
                                    [0, np.exp(1j * angle / 2)]], dtype=complex)
                state = apply_controlled_gate(state, ctrl, target, rot, n_qubits)

    return state

def format_output(state: np.ndarray, bar_length: int = 20) -> str:
    """Format quantum state output with probability bars."""
    results = []
    for i, amp in enumerate(state):
        prob = np.abs(amp) ** 2
        if prob > 1e-6:
            bitstring = format(i, f'0{int(np.log2(len(state)))}b')
            results.append((bitstring, prob))

    width = len(str(len(results)))
    lines = []
    for i, (bitstring, prob) in enumerate(results):
        bars = round(prob * bar_length)
        empty = bar_length - bars
        line = (
            str(i + 1).rjust(width) + "  " +
            f"|{bitstring}⟩  " +
            "█" * bars + "░" * empty +
            f"{round(prob * 100):>3}% chance"
        )
        lines.append(line)
    return "\n" + "\n".join(lines) + "\n"

# =============================================================================
# QASM GENERATION
# =============================================================================

def circuit_to_qasm(circuit: List[List[str]]) -> str:
    """Convert circuit to OpenQASM 2.0 format."""
    n_qubits = len(circuit)
    n_moments = len(circuit[0])
    index_map = {q: q for q in range(n_qubits)}

    lines = [
        'OPENQASM 2.0;',
        'include "qelib1.inc";',
        f'qreg q[{n_qubits}];',
        f'creg c[{n_qubits}];'
    ]

    for t in range(n_moments):
        cx_groups        = {}
        cz_groups        = {}
        cy_groups        = {}
        ch_groups        = {}
        swap_groups      = {}
        rxx_groups       = {}
        ryy_groups       = {}
        rzz_groups       = {}
        crot_qasm_groups = {}  # key=(base_lower, angle_str, gid) -> {q: role}
        cu_groups = {
            "UNITARY":   {},
            "UNITARY_1": {},
            "UNITARY_2": {},
        }

        for q in range(n_qubits):
            gate = circuit[q][t]

            if gate in ('I', ''):
                continue
            elif gate in ('H', 'X', 'Y', 'Z', 'T', 'P', 'S'):
                lines.append(f'{gate.lower()} q[{index_map[q]}];')
                continue
            elif gate in ('S†', 'Sdg'):
                lines.append(f'sdg q[{index_map[q]}];')
                continue
            elif gate in ('T†', 'Tdg'):
                lines.append(f'tdg q[{index_map[q]}];')
                continue

            # Single-qubit U/U1/U2 gates
            if gate == 'U':
                p = UNITARY_PARAMS["UNITARY"]
                lines.append(f'u({p["theta"]}, {p["phi"]}, {p["lambda"]}) q[{index_map[q]}];')
                continue
            if gate == 'U1':
                p = UNITARY_PARAMS["UNITARY_1"]
                lines.append(f'u({p["theta"]}, {p["phi"]}, {p["lambda"]}) q[{index_map[q]}];')
                continue
            if gate == 'U2':
                p = UNITARY_PARAMS["UNITARY_2"]
                lines.append(f'u({p["theta"]}, {p["phi"]}, {p["lambda"]}) q[{index_map[q]}];')
                continue

            # Rotation gates (frontend sends RX1.5708 format)
            match_rot = re.match(r'(RX|RY|RZ)([-\d.]+)?$', gate)
            if match_rot:
                base  = match_rot.group(1).lower()  # rx, ry, rz
                angle = match_rot.group(2) or '0'
                lines.append(f'{base}({angle}) q[{index_map[q]}];')
                continue

            # Controlled rotation gates: CRX1.5708.0#0 / CRX1.5708.0#1
            match_crot = re.match(r'(CRX|CRY|CRZ)([-\d.]+)\.(\d+)#(\d+)', gate)
            if match_crot:
                base, angle_str, gid_str, role_str = match_crot.groups()
                gid  = int(gid_str)
                role = int(role_str)
                key  = (base.lower(), angle_str, gid)
                if key not in crot_qasm_groups:
                    crot_qasm_groups[key] = {}
                crot_qasm_groups[key][q] = role
                continue

            # Controlled gates
            for prefix, group_dict in [('X', cx_groups), ('Z', cz_groups), ('Y', cy_groups), ('H', ch_groups)]:
                match = re.match(rf'{prefix}(?:\.(\d+))?#(\d+)', gate)
                if match:
                    group = int(match.group(1)) if match.group(1) else 0
                    idx = int(match.group(2))
                    if group not in group_dict:
                        group_dict[group] = {}
                    group_dict[group][q] = idx
                    break

            # Ising gates
            for prefix, group_dict in [('XX', rxx_groups), ('YY', ryy_groups), ('ZZ', rzz_groups)]:
                match = re.match(rf'{prefix}(?:\.(\d+))?#(\d+)', gate)
                if match:
                    power = int(match.group(1)) if match.group(1) else 0
                    idx = int(match.group(2))
                    if power not in group_dict:
                        group_dict[power] = {}
                    group_dict[power][q] = idx
                    break

            # Controlled U-family gates
            mU  = re.match(r'U(?:\.(\d+))?#(\d+)', gate)
            mU1 = re.match(r'U1(?:\.(\d+))?#(\d+)', gate)
            mU2 = re.match(r'U2(?:\.(\d+))?#(\d+)', gate)
            if mU or mU1 or mU2:
                if mU:
                    key2 = "UNITARY"
                    g = int(mU.group(1)) if mU.group(1) else 0
                    idx = int(mU.group(2))
                elif mU1:
                    key2 = "UNITARY_1"
                    g = int(mU1.group(1)) if mU1.group(1) else 0
                    idx = int(mU1.group(2))
                else:
                    key2 = "UNITARY_2"
                    g = int(mU2.group(1)) if mU2.group(1) else 0  # type: ignore[union-attr]
                    idx = int(mU2.group(2))                        # type: ignore[union-attr]
                if g not in cu_groups[key2]:
                    cu_groups[key2][g] = {}
                cu_groups[key2][g][q] = idx
                continue

            # SWAP gates
            match_swap = re.match(r'S(?:\.(\d+))?#(\d+)', gate)
            if match_swap:
                group = int(match_swap.group(1)) if match_swap.group(1) else 0
                swap_groups.setdefault(group, []).append(q)

        # Append controlled gates
        for group in cx_groups.values():
            _append_controlled_gate(lines, group, 'cx')
        for group in cz_groups.values():
            _append_controlled_gate(lines, group, 'cz')
        for group in cy_groups.values():
            _append_controlled_gate(lines, group, 'cy')
        for group in ch_groups.values():
            _append_controlled_gate(lines, group, 'ch')

        # Ising gates
        for group in rxx_groups.values():
            _append_controlled_gate(lines, group, 'rxx(1)')
        for group in ryy_groups.values():
            _append_controlled_gate(lines, group, 'ryy(1)')
        for group in rzz_groups.values():
            _append_controlled_gate(lines, group, 'rzz(1)')

        # Controlled rotation gates
        for (base, angle_str, _gid), grp in crot_qasm_groups.items():
            ctrl = next((q for q, r in grp.items() if r == 0), None)
            tgt  = next((q for q, r in grp.items() if r == 1), None)
            if ctrl is not None and tgt is not None:
                lines.append(f'{base}({angle_str}) q[{index_map[ctrl]}], q[{index_map[tgt]}];')

        # Controlled U-family gates
        for gdict in cu_groups["UNITARY"].values():
            _append_controlled_u(lines, gdict, UNITARY_PARAMS["UNITARY"])
        for gdict in cu_groups["UNITARY_1"].values():
            _append_controlled_u(lines, gdict, UNITARY_PARAMS["UNITARY_1"])
        for gdict in cu_groups["UNITARY_2"].values():
            _append_controlled_u(lines, gdict, UNITARY_PARAMS["UNITARY_2"])

        # SWAP gates
        for group in swap_groups.values():
            if len(group) == 2:
                q1, q2 = group
                lines.append(f'swap q[{index_map[q1]}], q[{index_map[q2]}];')

    # Final measurements
    for q in range(n_qubits):
        lines.append(f'measure q[{index_map[q]}] -> c[{index_map[q]}];')

    return '\n'.join(lines)

def _append_controlled_gate(lines: List[str], group: Dict, gate: str) -> None:
    """Helper to append controlled 2-qubit gate from a group dict."""
    control = target = None
    for q, idx in group.items():
        if idx == 0:
            control = q
        elif idx == 1:
            target = q
    if control is not None and target is not None:
        lines.append(f'{gate} q[{control}], q[{target}];')

def _append_controlled_u(lines: List[str], group: Dict, params: Dict) -> None:
    """Helper to append a controlled U with given params dict."""
    control = target = None
    for q, idx in group.items():
        if idx == 0:
            control = q
        elif idx == 1:
            target = q
    if control is not None and target is not None:
        lines.append(
            f'cu({params["theta"]}, {params["phi"]}, {params["lambda"]}) q[{control}], q[{target}];'
        )

# =============================================================================
# PENNYLANE INTEGRATION
# =============================================================================

def read_qasm_file() -> str:
    """Read QASM file content."""
    if not os.path.exists(QASM_FILE):
        raise FileNotFoundError(f"QASM file not found at {QASM_FILE}")
    with open(QASM_FILE, "r") as f:
        return f.read()

def extract_num_wires(qasm_text: str) -> int:
    """Extract number of qubits from QASM text."""
    match = re.search(r"qreg\s+q\[(\d+)\];", qasm_text)
    if not match:
        indices = [int(m) for m in re.findall(r"q\[(\d+)\]", qasm_text)]
        if indices:
            return max(indices) + 1
        raise ValueError("Could not determine number of wires from QASM.")
    return int(match.group(1))

def format_state_vector(state: np.ndarray, num_wires: int, threshold: float = 1e-12) -> str:
    """Format state vector with probability bars (one entry per line)."""
    bar_length = 20
    entries = []
    for i, amp in enumerate(state):
        prob = float(np.abs(amp) ** 2)
        if prob > 1e-6:
            bitstring = format(i, f'0{num_wires}b')  # big-endian: qubit 0 = MSB = leftmost
            entries.append((bitstring, prob))

    if not entries:
        probs = np.abs(state) ** 2
        idx = int(np.argmax(probs))
        entries = [(format(idx, f'0{num_wires}b'), float(probs[idx]))]

    entries.sort(key=lambda x: int(x[0], 2))
    width = len(str(len(entries))) if entries else 1

    lines = []
    for i, (bitstring, prob) in enumerate(entries):
        bars  = round(prob * bar_length)
        empty = bar_length - bars
        line  = (
            str(i + 1).rjust(width) + "  " +
            f"|{bitstring}⟩  " +
            "█" * bars + "░" * empty +
            f"  {round(prob * 100):>3}% chance"
        )
        lines.append(line)
    return ("\n" + "\n".join(lines) + "\n") if lines else "\n\n"

# =============================================================================
# QISKIT INTEGRATION
# =============================================================================

def read_qiskit_file() -> str:
    """Read Qiskit file content."""
    if not os.path.exists(QISKIT_FILE):
        raise FileNotFoundError(f"Qiskit file not found at {QISKIT_FILE}")
    with open(QISKIT_FILE, "r") as f:
        return f.read()

def extract_num_wires_from_qiskit(qiskit_text: str) -> int:
    """Extract number of qubits from Qiskit code."""
    # Look for QuantumRegister(n, 'q') pattern
    match = re.search(r"QuantumRegister\((\d+),\s*['\"]?q['\"]?\)", qiskit_text)
    if match:
        return int(match.group(1))
    
    # Look for QuantumCircuit initialization
    match = re.search(r"QuantumCircuit\((\d+)(?:,\s*(\d+))?\)", qiskit_text)
    if match:
        return int(match.group(1))
    
    # Look for qubits parameter
    match = re.search(r"qubits=(\d+)", qiskit_text)
    if match:
        return int(match.group(1))
    
    raise ValueError("Could not determine number of wires from Qiskit code.")

def build_pl_circuit_from_qiskit(qiskit_text: str):
    """Build PennyLane circuit from Qiskit code."""
    import ast

    lines = qiskit_text.splitlines()
    circuit_lines = []
    circuit_complete = False

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if any(keyword in line for keyword in [
            "backend =", "Aer.get_backend", "transpile(", "run(", "result()", "counts =", "print("
        ]):
            break
        circuit_lines.append(line)

    filtered_qiskit = "\n".join(circuit_lines)

    try:
        from qiskit import QuantumCircuit, QuantumRegister, ClassicalRegister
        exec_globals = {
            "QuantumCircuit": QuantumCircuit,
            "QuantumRegister": QuantumRegister,
            "ClassicalRegister": ClassicalRegister,
            "np": np,
        }

        exec(filtered_qiskit, exec_globals)

        circuit_candidates = [
            val for val in exec_globals.values()
            if isinstance(val, QuantumCircuit)
        ]

        if not circuit_candidates:
            raise ValueError("No valid QuantumCircuit found in the code.")

        circuit_obj = circuit_candidates[-1]

        if circuit_obj.num_qubits == 0:
            raise ValueError("QuantumCircuit has no qubits defined.")

        if len(circuit_obj.data) == 0:
            raise ValueError("QuantumCircuit has no operations defined.")

        # Try native PennyLane from_qiskit
        try:
            from_qiskit = getattr(qml, "from_qiskit")
            return from_qiskit(circuit_obj)
        except Exception:
            pass

        # Fallback: try plugin
        try:
            from importlib import import_module
            qiskit_plugin = import_module("pennylane_qiskit")
            from_qiskit = getattr(qiskit_plugin, "from_qiskit", None)
            if callable(from_qiskit):
                return from_qiskit(circuit_obj)
        except Exception:
            pass

        raise ValueError("Both qml.from_qiskit() and plugin import failed")

    except Exception as e:
        raise ValueError(f"Failed to execute Qiskit code: {str(e)}")

def extract_circuit_only(qiskit_code: str) -> str:
    """Extract only circuit construction code from Qiskit code."""
    lines = qiskit_code.splitlines()
    circuit_lines = []
    started = False

    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("from ") or line.startswith("import "):
            circuit_lines.append(line)
            continue

        if any(keyword in line for keyword in ["QuantumCircuit(", "QuantumRegister(", "ClassicalRegister(", "qc.", "q =", "c ="]):
            started = True

        if started and any(kw in line for kw in [
            "transpile(", "backend =", "Aer.get_backend", "run(", "result(", "get_counts(", "print("]):
            break

        if "qc.measure" in line:
            continue

        if started:
            circuit_lines.append(line)

    return "\n".join(circuit_lines)

# =============================================================================
# PLOTTING UTILITIES
# =============================================================================

def create_plot(state: np.ndarray, num_wires: int, title: str = "Quantum State") -> None:
    """Create matplotlib plot for quantum state probabilities."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        probs = np.abs(state) ** 2
        labels = [format(i, f"0{num_wires}b")[::-1] for i in range(len(state))]
        filtered = [(l, p) for l, p in zip(labels, probs) if p > 1e-6]
        labels, heights = zip(*filtered) if filtered else ([], [])

        BG, ACCENT, BAR, BAR_EDGE = "#0d1117", "#8b5cf6", "#7c3aed", "#a78bfa"
        fig, ax = plt.subplots(figsize=(10, 4), facecolor=BG)
        ax.set_facecolor(BG)
        if labels:
            bars = ax.bar(labels, heights, color=BAR, edgecolor=BAR_EDGE, linewidth=0.8, zorder=3)
            # value labels on top of each bar
            for bar in bars:
                h = bar.get_height()
                if h > 0:
                    ax.text(bar.get_x() + bar.get_width()/2, h + 0.005, f"{h:.2f}",
                            ha="center", va="bottom", color=ACCENT, fontsize=8)
            ax.set_xlabel("Bitstrings", color=ACCENT, fontsize=11, labelpad=8)
            ax.set_ylabel("Probability", color=ACCENT, fontsize=11, labelpad=8)
            ax.tick_params(axis="both", colors=ACCENT)
            plt.xticks(rotation=45, ha="right", color=ACCENT, fontsize=9)
            plt.yticks(color=ACCENT, fontsize=9)
            ax.set_title(title, color=ACCENT, fontsize=13, fontweight="bold", pad=12)
            for spine in ax.spines.values():
                spine.set_edgecolor("#2d2d4e")
            ax.grid(axis="y", color="#1e1e2e", linewidth=0.6, zorder=0)
            ax.set_ylim(0, max(heights) * 1.15)
        else:
            ax.text(0.5, 0.5, "No significant amplitudes", ha="center", va="center",
                    color=ACCENT, fontsize=12)
            ax.set_xticks([]); ax.set_yticks([])
            for spine in ax.spines.values(): spine.set_edgecolor("#2d2d4e")

        fig.tight_layout(pad=1.5)
        plt.savefig("plot.png", dpi=120, bbox_inches='tight', facecolor=BG)
        plt.close()
    except Exception:
        pass  # Plotting is optional

# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.route("/compute", methods=["POST"])
def compute():
    """
    Simulate quantum circuit and return state probabilities.
    
    Request:
        POST /compute
        Content-Type: text/plain
        Body: Circuit text in custom format
        
    Response:
        Content-Type: text/plain
        Body: Formatted probability output with bars
    """
    try:
        text = request.get_data(as_text=True)
        circuit = parse_circuit(text)
        final_state = apply_circuit(circuit)
        report = format_output(final_state)
        return report, 200, {"Content-Type": "text/plain"}
    except Exception as e:
        return f"Error: {str(e)}", 500, {"Content-Type": "text/plain"}

@app.route("/QASM", methods=["POST"])
def generate_qasm():
    """
    Generate OpenQASM 2.0 code from circuit.
    
    Request:
        POST /QASM
        Content-Type: text/plain
        Body: Circuit text in custom format
        
    Response:
        Content-Type: text/plain
        Body: OpenQASM 2.0 code
    """
    try:
        text = request.get_data(as_text=True)
        circuit = parse_circuit(text)
        qasm_code = circuit_to_qasm(circuit)
        with open("circuit.qasm", "w") as f:
            f.write(qasm_code)
        return qasm_code, 200, {"Content-Type": "text/plain"}
    except Exception as e:
        return f"Error: {str(e)}", 500, {"Content-Type": "text/plain"}

@app.route("/unitary", methods=["POST"])
def set_unitary():
    """
    Set parameters for unitary gates.
    
    Request:
        POST /unitary
        Content-Type: application/json
        Body: {"key": "UNITARY|UNITARY_1|UNITARY_2", "theta": float, "phi": float, "lambda": float}
        
    Response:
        Status: 200 (success) or 400 (error)
    """
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return ("", 400)

        key = data.get("key")
        if key not in UNITARY_PARAMS:
            return ("", 400)

        theta = float(data.get("theta", 0))
        phi = float(data.get("phi", 0))
        lam = float(data.get("lambda", 0))

        UNITARY_PARAMS[key]["theta"] = theta
        UNITARY_PARAMS[key]["phi"] = phi
        UNITARY_PARAMS[key]["lambda"] = lam

        return ("", 200)
    except (TypeError, ValueError):
        return ("", 400)

@app.route("/simulate-pennylane", methods=["POST"])
def simulate_pennylane():
    """
    Simulate circuit using PennyLane with QASM input.
    
    Request:
        POST /simulate-pennylane
        Content-Type: application/json
        Body: {} (uses QASM file)
        
    Response:
        Content-Type: application/json
        Body: {"stdout": str, "returncode": int}
    """
    try:
        qasm_text = read_qasm_file()
        qasm_text = re.sub(r"(?mi)^\s*measure\b.*;$", "", qasm_text)
        num_wires = extract_num_wires(qasm_text)

        circuit_fn = qml.from_qasm(qasm_text)
        dev = qml.device("default.tensor", wires=num_wires, method="tn")

        @qml.qnode(dev)
        def qnode():
            circuit_fn()
            return qml.state()

        state = qnode()
        stdout = format_state_vector(state, num_wires)
        probs  = np.abs(state) ** 2
        labels = [format(i, f"0{num_wires}b") for i in range(len(state))]
        probs_dict = {
            lbl: float(p)
            for lbl, p in zip(labels, probs)
            if p > 1e-9
        }

        return jsonify({
            "stdout": stdout,
            "returncode": 0,
            "probs": probs_dict,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/simulate-pennylane-qiskit", methods=["POST"])
def simulate_pennylane_qiskit():
    """
    Simulate circuit using PennyLane with Qiskit input.
    
    Request:
        POST /simulate-pennylane-qiskit
        Content-Type: application/json
        Body: {"qiskit_code": str}
        
    Response:
        Content-Type: application/json
        Body: {"stdout": str, "returncode": int}
    """
    try:
        payload = request.get_json(silent=True) or {}
        qiskit_text = payload.get("qiskit_code", "")
        
        if not qiskit_text:
            return jsonify({"error": "No Qiskit code provided"}), 400

        qiskit_text = extract_circuit_only(qiskit_text)
        num_wires = extract_num_wires_from_qiskit(qiskit_text)
        circuit_fn = build_pl_circuit_from_qiskit(qiskit_text)

        dev = qml.device("default.tensor", wires=num_wires, method="tn")

        @qml.qnode(dev)
        def qnode():
            circuit_fn()
            return qml.state()

        state  = qnode()
        stdout = format_state_vector(state, num_wires)

        return jsonify({"stdout": stdout, "returncode": 0})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/execute-python", methods=["POST"])
def execute_python():
    """
    Execute Python code and return results.
    
    Request:
        POST /execute-python
        Content-Type: application/json
        Body: {"code": str}
        
    Response:
        Content-Type: application/json
        Body: {"stdout": str, "stderr": str, "returncode": int}
    """
    try:
        data = request.get_json()
        code = data.get("code", "")
        
        # Inject a counts → JSON dump so the frontend can draw the chart natively.
        # Works for Qiskit (counts = result.get_counts()),
        # Cirq (counts dict built inline), and Braket (result.measurement_counts).
        JSON_INJECT = (
            "\nimport json as _json"
            "\ntry:"
            "\n    with open('counts.json', 'w') as _f:"
            "\n        _json.dump({str(k): int(v) for k, v in counts.items()}, _f)"
            "\nexcept Exception:"
            "\n    pass"
        )
        if "qiskit" in code or "braket" in code or "cirq" in code:
            if "counts" in code:
                code += JSON_INJECT

        # Fix standalone 'j' imaginary literal (e.g. 2+j → 2+1j) without touching identifiers (job, …)
        code = re.sub(r'(?<!\w)j(?!\w)', '1j', code)

        # Remove stale counts file before running
        if os.path.exists("counts.json"):
            os.remove("counts.json")

        with tempfile.NamedTemporaryFile(mode="w+", suffix=".py", delete=False) as f:
            f.write(code)
            f.flush()

            result = subprocess.run(
                ["python3", f.name],
                capture_output=True,
                text=True,
                timeout=50
            )

        result_data: dict = {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode,
        }

        # Return structured counts so the frontend can render its own chart
        if os.path.exists("counts.json"):
            try:
                with open("counts.json") as f:
                    result_data["counts"] = json.load(f)
            except Exception:
                pass
            try:
                os.remove("counts.json")
            except Exception:
                pass

        return jsonify(result_data)

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Execution timed out"}), 408
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =============================================================================
# CODE GENERATION HELPERS
# =============================================================================

def _gen_qiskit(qasm: str) -> str:
    return f'''from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

qasm_str = """{qasm}"""

qc = QuantumCircuit.from_qasm_str(qasm_str)
print(qc.draw(output="text"))

simulator = AerSimulator()
job = simulator.run(qc, shots=1024)
result = job.result()
# Reverse keys: Qiskit is little-endian (qubit 0 = rightmost); flip to big-endian (qubit 0 = leftmost)
counts = {{k[::-1]: v for k, v in result.get_counts().items()}}
print("\\nMeasurement counts:")
for state, count in sorted(counts.items()):
    bar = "\\u2588" * int(count / max(counts.values()) * 20)
    print(f"  |{{state}}\\u27e9  {{bar}}  {{count}}")
'''

def _gen_cirq(qasm: str) -> str:
    match = re.search(r'qreg\s+q\[(\d+)\]', qasm)
    n = match.group(1) if match else '3'
    return f'''import cirq
import re
import numpy as np

qasm_str = """{qasm}"""

# Build Cirq circuit by parsing QASM operations (no ply dependency)
n_qubits = {n}
q = [cirq.LineQubit(i) for i in range(n_qubits)]
ops = []

def _qi(s):
    m = re.search(r"\\[(\\d+)\\]", s)
    return int(m.group(1)) if m else 0

for raw in qasm_str.split("\\n"):
    line = raw.strip().rstrip(";")
    if not line or any(line.startswith(p) for p in ("OPENQASM", "include", "qreg", "creg", "//", "measure")):
        continue

    # Rotation gates: rx(angle) q[i]
    m_rot = re.match(r"(rx|ry|rz)\\(([^)]+)\\)\\s+(.*)", line)
    if m_rot:
        g, ang, qi_s = m_rot.group(1), float(m_rot.group(2)), _qi(m_rot.group(3))
        if   g == "rx": ops.append(cirq.rx(ang)(q[qi_s]))
        elif g == "ry": ops.append(cirq.ry(ang)(q[qi_s]))
        else:           ops.append(cirq.rz(ang)(q[qi_s]))
        continue

    # Two-qubit gates: cx q[c], q[t]
    m2 = re.match(r"(\\w+)\\s+(q\\[\\d+\\])\\s*,\\s*(q\\[\\d+\\])", line)
    if m2:
        g, c, t = m2.group(1).lower(), _qi(m2.group(2)), _qi(m2.group(3))
        if   g == "cx":   ops.append(cirq.CNOT(q[c], q[t]))
        elif g == "cy":   ops.append(cirq.Y(q[t]).controlled_by(q[c]))
        elif g == "cz":   ops.append(cirq.CZ(q[c], q[t]))
        elif g == "ch":   ops.append(cirq.H(q[t]).controlled_by(q[c]))
        elif g == "swap": ops.append(cirq.SWAP(q[c], q[t]))
        continue

    # Single-qubit gates: h q[0]
    m1 = re.match(r"(\\w+)\\s+(q\\[\\d+\\])", line)
    if m1:
        g, qi_v = m1.group(1).lower(), _qi(m1.group(2))
        if   g == "h":   ops.append(cirq.H(q[qi_v]))
        elif g == "x":   ops.append(cirq.X(q[qi_v]))
        elif g == "y":   ops.append(cirq.Y(q[qi_v]))
        elif g == "z":   ops.append(cirq.Z(q[qi_v]))
        elif g == "s":   ops.append(cirq.S(q[qi_v]))
        elif g == "t":   ops.append(cirq.T(q[qi_v]))
        elif g == "sdg": ops.append(cirq.S(q[qi_v])**-1)
        elif g == "tdg": ops.append(cirq.T(q[qi_v])**-1)
        continue

circuit = cirq.Circuit(ops)
print("Circuit:")
print(circuit)

simulator = cirq.Simulator()
result = simulator.simulate(circuit)
print("\\nFinal state vector:")
state = result.final_state_vector
print("\\nState vector:")
for i, amp in enumerate(state):
    prob = abs(amp) ** 2
    if prob > 1e-6:
        bs = format(i, f"0{{n_qubits}}b")
        bar = "\\u2588" * round(prob * 20)
        print(f"  |{{bs}}\\u27e9  {{bar}}  {{round(prob * 100, 1)}}%")

# Write counts as JSON so the frontend renders the chart natively
counts = {{
    format(i, f"0{{n_qubits}}b"): int(abs(amp)**2 * 1024)
    for i, amp in enumerate(state)
    if abs(amp)**2 > 1e-6
}}
import json as _json
with open("counts.json", "w") as _f:
    _json.dump(counts, _f)
'''

def _gen_braket(qasm: str) -> str:
    match = re.search(r'qreg\s+q\[(\d+)\]', qasm)
    n = match.group(1) if match else '3'
    return f'''from braket.circuits import Circuit
from braket.devices import LocalSimulator
import re

qasm_str = """{qasm}"""

# Build Braket circuit by parsing QASM operations (avoids qelib1.inc dependency)
circuit = Circuit()

def _qi(s):
    m = re.search(r"\\[(\\d+)\\]", s)
    return int(m.group(1)) if m else 0

for raw in qasm_str.split("\\n"):
    line = raw.strip().rstrip(";")
    if not line or any(line.startswith(p) for p in ("OPENQASM", "include", "qreg", "creg", "//", "measure")):
        continue

    # Rotation gates: rx(angle) q[i]
    m_rot = re.match(r"(rx|ry|rz)\\(([^)]+)\\)\\s+(.*)", line)
    if m_rot:
        g, ang, qi_s = m_rot.group(1), float(m_rot.group(2)), _qi(m_rot.group(3))
        if   g == "rx": circuit.rx(qi_s, ang)
        elif g == "ry": circuit.ry(qi_s, ang)
        else:           circuit.rz(qi_s, ang)
        continue

    # Two-qubit gates: cx q[c], q[t]
    m2 = re.match(r"(\\w+)\\s+(q\\[\\d+\\])\\s*,\\s*(q\\[\\d+\\])", line)
    if m2:
        g, c, t = m2.group(1).lower(), _qi(m2.group(2)), _qi(m2.group(3))
        if   g == "cx":   circuit.cnot(c, t)
        elif g == "cy":   circuit.cy(c, t)
        elif g == "cz":   circuit.cz(c, t)
        elif g == "ch":   circuit.h(t).controlled(c)
        elif g == "swap": circuit.swap(c, t)
        continue

    # Single-qubit gates: h q[0]
    m1 = re.match(r"(\\w+)\\s+(q\\[\\d+\\])", line)
    if m1:
        g, qi_v = m1.group(1).lower(), _qi(m1.group(2))
        if   g == "h":   circuit.h(qi_v)
        elif g == "x":   circuit.x(qi_v)
        elif g == "y":   circuit.y(qi_v)
        elif g == "z":   circuit.z(qi_v)
        elif g == "s":   circuit.s(qi_v)
        elif g == "t":   circuit.t(qi_v)
        elif g == "sdg": circuit.si(qi_v)
        elif g == "tdg": circuit.ti(qi_v)
        continue

print("Circuit:")
print(circuit)

device = LocalSimulator()
task = device.run(circuit, shots=1024)
result = task.result()
counts = result.measurement_counts
print("\\nMeasurement counts:")
if counts:
    max_c = max(counts.values())
    for state, count in sorted(counts.items()):
        bar = "\\u2588" * int(count / max_c * 20)
        print(f"  |{{state}}\\u27e9  {{bar}}  {{count}}")

import json as _json
with open("counts.json", "w") as _f:
    _json.dump({{str(k): int(v) for k, v in counts.items()}}, _f)
'''

def _gen_cudaq(qasm: str) -> str:
    match = re.search(r'qreg\s+q\[(\d+)\]', qasm)
    n = match.group(1) if match else '3'
    commented = "\n".join("# " + line for line in qasm.strip().split("\n"))
    return f'''import cudaq

# {n}-qubit circuit (auto-generated from QASM)
# Original QASM:
{commented}

# CUDA-Q kernel — translate QASM operations manually:
# h(qubits[i])            => H gate
# x(qubits[i])            => X gate
# cx(qubits[c], qubits[t])=> CNOT
# rz(angle, qubits[i])    => RZ rotation
# mz(qubits)              => Measure all

@cudaq.kernel
def circuit():
    qubits = cudaq.qvector({n})
    # TODO: add your gates here based on the QASM above

counts = cudaq.sample(circuit, shots_count=1024)
print("Measurement counts:")
print(counts)
'''

def _gen_pennylane(qasm: str) -> str:
    match = re.search(r'qreg\s+q\[(\d+)\]', qasm)
    n = match.group(1) if match else '3'
    return f'''import pennylane as qml
import numpy as np
import re

qasm_str = """{qasm}"""

qasm_clean = re.sub(r"(?mi)^\\s*measure\\b.*;$", "", qasm_str)
circuit_fn = qml.from_qasm(qasm_clean)
num_wires = {n}

dev = qml.device("default.qubit", wires=num_wires)

@qml.qnode(dev)
def qnode():
    circuit_fn()
    return qml.state()

state = qnode()
probs = np.abs(state) ** 2
print("State vector:")
for i, (amp, p) in enumerate(zip(state, probs)):
    if p > 1e-6:
        bs = format(i, f"0{{num_wires}}b")
        bar = "\\u2588" * round(p * 20)
        print(f"  |{{bs}}\\u27e9  {{bar}}  {{round(p * 100, 1)}}%")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
_BG, _AC, _BAR, _BAREDGE = "#0d1117", "#8b5cf6", "#7c3aed", "#a78bfa"
_labels = [format(i, f"0{{num_wires}}b") for i, p in enumerate(probs) if p > 1e-6]
_heights = [float(p) for p in probs if p > 1e-6]
_fig, _ax = plt.subplots(figsize=(10, 4), facecolor=_BG)
_ax.set_facecolor(_BG)
if _labels:
    _bars = _ax.bar(_labels, _heights, color=_BAR, edgecolor=_BAREDGE, linewidth=0.8, zorder=3)
    _mx = max(_heights)
    for _b in _bars:
        _h = _b.get_height()
        if _h > 0: _ax.text(_b.get_x()+_b.get_width()/2, _h+_mx*0.02, f"{{_h:.2f}}", ha="center", va="bottom", color=_AC, fontsize=8)
    _ax.set_xlabel("Bitstrings", color=_AC, fontsize=11, labelpad=8)
    _ax.set_ylabel("Probability", color=_AC, fontsize=11, labelpad=8)
    _ax.set_title("PennyLane Results", color=_AC, fontsize=13, fontweight="bold", pad=12)
    _ax.tick_params(axis="both", colors=_AC)
    plt.xticks(rotation=45, ha="right", color=_AC, fontsize=9)
    plt.yticks(color=_AC, fontsize=9)
    for _sp in _ax.spines.values(): _sp.set_edgecolor("#2d2d4e")
    _ax.grid(axis="y", color="#1e1e2e", linewidth=0.6, zorder=0)
    _ax.set_ylim(0, _mx * 1.15)
_fig.tight_layout(pad=1.5)
plt.savefig("plot.png", dpi=120, bbox_inches="tight", facecolor=_BG)
plt.close()
'''

@app.route("/generate-code", methods=["POST"])
def generate_code_endpoint():
    """
    Generate framework-specific Python code from QASM.

    Request:
        POST /generate-code
        Content-Type: application/json
        Body: {"qasm": str, "format": "qiskit"|"cirq"|"braket"|"cudaq"|"pennylane"}

    Response:
        Content-Type: application/json
        Body: {"code": str}
    """
    try:
        data = request.get_json(silent=True) or {}
        qasm = data.get("qasm", "").strip()
        fmt  = data.get("format", "qiskit")

        if not qasm:
            return jsonify({"error": "No QASM provided"}), 400

        generators = {
            "qiskit":    _gen_qiskit,
            "cirq":      _gen_cirq,
            "braket":    _gen_braket,
            "cudaq":     _gen_cudaq,
            "pennylane": _gen_pennylane,
        }

        gen = generators.get(fmt)
        if gen is None:
            return jsonify({"error": f"Unknown format: {fmt}"}), 400

        return jsonify({"code": gen(qasm)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health_check():
    """
    Health check endpoint.
    
    Response:
        Content-Type: application/json
        Body: {"status": "healthy", "version": "1.0.0"}
    """
    return jsonify({
        "status": "healthy",
        "version": "1.0.0",
        "service": "Quantum Circuit Simulation Backend"
    })

# =============================================================================
# MAIN EXECUTION
# =============================================================================

if __name__ == "__main__":
    app.run(port=7900, debug=True)