export interface QuantumResult {
  state: string;
  probability: number;
  amplitude: number;
}

export interface QuantumResults {
  probabilities: QuantumResult[];
  counts: Record<string, number>;
}

export interface GateParameters {
  theta: number;  // radians
  phi: number;
  lambda: number;
}

export interface QuantumParameters {
  U:  GateParameters;
  U1: GateParameters;
  U2: GateParameters;
}

/** A single gate placed in a circuit cell */
export interface GateCell {
  name: string;
  params?: number[];       // optional gate parameters (radians)
  role?: 'control' | 'target';  // for multi-qubit gates
  partner?: number;        // qubit index of the paired qubit
  groupId?: number;        // group id for same-step multi-qubit ops
}

/** 2-D circuit grid: grid[qubit][step] */
export type CircuitGrid = (GateCell | null)[][];

export interface QuantumState {
  shots: number;
  qubits: number;
  depth: number;
  results: QuantumResults;
  parameters: QuantumParameters;
}

export type SimulationStatus = 'idle' | 'loading' | 'success' | 'error';

export type CodeFormat = 'qasm' | 'qiskit' | 'cirq' | 'cudaq' | 'braket' | 'pennylane';

export interface CodeOutputs {
  qasm:      string;
  qiskit:    string;
  cirq:      string;
  cudaq:     string;
  braket:    string;
  pennylane: string;
}
