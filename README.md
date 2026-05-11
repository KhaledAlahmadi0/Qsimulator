# |Q⟩ Playground - Interactive Quantum Circuit Builder

A comprehensive quantum computing simulation platform that combines an intuitive visual circuit builder with powerful backend simulation capabilities. Build, visualize, and simulate quantum circuits with support for multiple quantum computing frameworks.

## 🌟 Features

### Frontend
- **Interactive Circuit Builder**: Drag-and-drop quantum gate interface
- **Real-time Visualization**: Live Bloch sphere and probability displays
- **Multi-framework Support**: QASM, PennyLane, and Qiskit integration
- **Responsive Design**: Modern UI with dark/light theme support
- **Parameter Controls**: Adjustable gate parameters with real-time updates
- **Circuit Export**: Generate QASM code and circuit diagrams

### Backend
- **RESTful API**: Flask-based quantum simulation service
- **Multiple Simulators**: Native Python simulation with PennyLane/Qiskit integration
- **QASM Generation**: Automatic OpenQASM code generation
- **Tensor Network Visualization**: Advanced quantum state visualization
- **Cross-platform**: Python backend with CORS support

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **Python** (v3.8 or higher)
- **pip** (Python package manager)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd project-2
   ```

2. **Install Frontend Dependencies**
   ```bash
   npm install
   ```

3. **Set up Python Backend**
   ```bash
   # Create virtual environment
   python -m venv venv
   
   # Activate virtual environment
   # On macOS/Linux:
   source venv/bin/activate
   # On Windows:
   venv\Scripts\activate
   
   # Install Python dependencies
   pip install flask flask-cors numpy pennylane qiskit matplotlib
   ```

### Running the Application

#### Option 1: Development Mode (Recommended)

1. **Start the Backend Server**
   ```bash
   # Make sure virtual environment is activated
   cd backend
   python backend.py
   ```
   The backend will start on `http://localhost:7900`

2. **Start the Frontend Development Server**
   ```bash
   # In a new terminal, from project root
   npm run dev
   ```
   The frontend will start on `http://localhost:5173`

3. **Open your browser** and navigate to `http://localhost:5173`

#### Option 2: Production Build

1. **Build the Frontend**
   ```bash
   npm run build
   ```

2. **Start the Backend**
   ```bash
   cd backend
   python app.py
   ```

3. **Serve the built files** using any static file server, or simply open `index.html` in your browser

## 🏗️ Project Structure

```
project-2/
├── src/                          # React/TypeScript frontend source
│   ├── components/              # React components
│   ├── types/                   # TypeScript type definitions
│   └── App.tsx                  # Main React application
├── backend/                     # Python Flask backend
│   ├── backend.py               # Core quantum simulation logic
│   └── API_DOCUMENTATION.md     # Detailed API documentation
├── packages/                    # Custom quantum libraries
│   ├── quantum-js-util/         # Core quantum computing utilities
│   ├── quantum-js-vis/          # Visualization components
│   └── quantum-js-cli/          # Command-line interface
├── build/                       # Built frontend assets
├── assets/                      # Static assets and demos
├── index.html                   # Main HTML file
├── script.js                    # Legacy JavaScript functionality
└── styles.css                   # Main stylesheet
```

## 🎮 Usage Guide

### Building Quantum Circuits

1. **Add Qubits**: Click the "+" button to add qubits to your circuit
2. **Add Gates**: Drag quantum gates from the toolbar onto the circuit
3. **Adjust Parameters**: Use the parameter controls for parametrized gates
4. **Run Simulation**: Click the "Run Simulation" button to execute the circuit

### Supported Gates

- **Basic Gates**: H (Hadamard), X (Pauli-X), Y (Pauli-Y), Z (Pauli-Z)
- **Phase Gates**: P (Phase), T (T-gate), S (S-gate)
- **Parametrized Gates**: RX, RY, RZ (Rotation gates)
- **Two-qubit Gates**: CNOT, CZ (Controlled gates)

### Visualization Features

- **Probability Bars**: Real-time measurement probability visualization
- **Bloch Sphere**: 3D representation of qubit states
- **Circuit Diagram**: Visual representation of your quantum circuit
- **Tensor Network**: Advanced quantum state visualization

## 🔧 API Documentation

The backend provides a comprehensive REST API for quantum circuit simulation:

### Key Endpoints

- `POST /compute` - Simulate quantum circuits
- `POST /generate_qasm` - Generate OpenQASM code
- `POST /pennylane_simulate` - Run PennyLane simulations
- `POST /qiskit_simulate` - Run Qiskit simulations
- `GET /health` - Health check endpoint

For detailed API documentation, see [backend/API_DOCUMENTATION.md](backend/API_DOCUMENTATION.md)

## 🛠️ Development

### Frontend Development

The frontend is built with:
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Custom quantum libraries** for circuit manipulation

### Backend Development

The backend is built with:
- **Flask** for the web framework
- **NumPy** for numerical computations
- **PennyLane** and **Qiskit** for quantum simulations
- **CORS** support for cross-origin requests

### Building Custom Gates

To add custom gates, modify the `GATE_MAP` in `backend/app.py`:

```python
GATE_MAP = {
    'H': H,
    'X': X,
    'Y': Y,
    'Z': Z,
    # Add your custom gates here
    'CUSTOM': custom_gate_matrix,
}
```

## 🐛 Troubleshooting

### Common Issues

1. **Backend not starting**
   - Ensure Python virtual environment is activated
   - Check that all dependencies are installed: `pip list`
   - Verify Python version is 3.8+

2. **Frontend build errors**
   - Clear node_modules and reinstall: `rm -rf node_modules && npm install`
   - Check Node.js version: `node --version`

3. **CORS errors**
   - Ensure backend is running on port 7900
   - Check browser console for specific error messages

4. **Simulation timeouts**
   - Reduce circuit complexity (fewer qubits/gates)
   - Check backend logs for error details

### Performance Tips

- **Large circuits**: Use the backend API for circuits with >9 qubits
- **Real-time updates**: Disable auto-simulation for complex circuits
- **Browser compatibility**: Use modern browsers (Chrome, Firefox, Safari, Edge)

## 📚 Learning Resources

- [Quantum Computing Fundamentals](https://qiskit.org/textbook/)
- [PennyLane Documentation](https://pennylane.ai/qml/)
- [OpenQASM Specification](https://openqasm.com/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [PennyLane](https://pennylane.ai/) and [Qiskit](https://qiskit.org/)
- UI components inspired by modern quantum computing platforms
- Special thanks to the quantum computing community

---

**Ready to explore quantum computing?** Start building your first quantum circuit at `http://localhost:5173`! 🚀

