export function HolographicDisk({ diskInfo, t }: any) {
  if (!diskInfo) return null;
  
  const total = diskInfo.total / (1024 * 1024 * 1024);
  const free = diskInfo.available / (1024 * 1024 * 1024);
  const used = total - free;
  const percentUsed = (used / total) * 100;
  const isFull = percentUsed > 90;
  
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentUsed / 100) * circumference;
  const colorClass = isFull ? 'text-red-500' : (percentUsed > 75 ? 'text-yellow-400' : 'text-cyan-400');

  return (
    <div className="glass-panel px-6 py-4 rounded-xl border border-slate-700 flex items-center gap-6 shadow-[0_0_15px_rgba(0,0,0,0.5)]">
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg className="w-full h-full holo-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="transparent" className="stroke-slate-800" strokeWidth="8" />
          <circle 
            cx="50" cy="50" r={radius} fill="transparent" 
            className={`stroke-current ${colorClass}`} 
            strokeWidth="8" 
            strokeDasharray={circumference} 
            strokeDashoffset={offset} 
            strokeLinecap="round" 
            filter="drop-shadow(0 0 4px currentColor)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-bold ${colorClass}`}>{Math.round(percentUsed)}%</span>
        </div>
      </div>
      <div>
        <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wider mb-1">{t("free_space")}</h3>
        <p className="text-2xl font-mono font-light text-white">
          {Math.round(free)} <span className="text-sm text-cyan-400">GB</span>
        </p>
        <p className="text-[10px] font-mono text-slate-600 mt-1">/ {Math.round(total)} GB TOTAL</p>
      </div>
    </div>
  );
}
