import { useState, useRef, useEffect } from 'react';
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';

export function HackerConsole({ logs }: { logs: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-[200] transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -top-10 left-6 glass-panel px-4 py-2 rounded-t-lg border border-b-0 border-cyan-500/50 flex items-center gap-2 text-xs font-mono text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors"
      >
        <Terminal className="w-4 h-4" />
        {isOpen ? 'CLOSE_TERM' : 'OPEN_TERM'}
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      <div className="h-64 bg-slate-950/95 border-t border-cyan-500/50 p-4 font-mono text-xs overflow-y-auto backdrop-blur-md shadow-[0_-10px_30px_rgba(0,240,255,0.1)]">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">&gt; Awaiting system input...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1 leading-relaxed">
              <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>{' '}
              <span className={log.includes('[ERROR]') ? 'text-red-400' : log.includes('[SUCCESS]') ? 'text-green-400' : 'text-cyan-400'}>
                {log}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
