import React from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '../Toast/ToastProvider';

interface CountsOutputProps {
  counts: Record<string, number>;
  isDarkMode: boolean;
}

export const CountsOutput: React.FC<CountsOutputProps> = ({ counts, isDarkMode }) => {
  const { showToast } = useToast();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(counts, null, 2));
      setCopied(true);
      showToast('Counts copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showToast('Failed to copy counts', 'error');
    }
  };

  return (
    <div className={`rounded-2xl p-6 ${
      isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200'
    } border shadow-xl`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Counts / JSON Output</h3>
        <button
          onClick={handleCopy}
          className={`p-2 rounded-lg transition-colors ${
            isDarkMode
              ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
              : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
          }`}
          aria-label="Copy counts to clipboard"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      
      <div className={`rounded-lg p-4 font-mono text-sm overflow-auto max-h-40 ${
        isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-gray-50 border-gray-200'
      } border`}>
        <pre className="whitespace-pre-wrap">
          {JSON.stringify(counts, null, 2)}
        </pre>
      </div>
    </div>
  );
};