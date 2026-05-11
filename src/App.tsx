import React from 'react';
import { QuantumPlayground } from './components/QuantumPlayground';
import { ToastProvider }     from './components/Toast/ToastProvider';

function App() {
  return (
    <ToastProvider>
      <QuantumPlayground />
    </ToastProvider>
  );
}

export default App;
