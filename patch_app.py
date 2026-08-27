import re

with open("src/App.tsx", "r") as f:
    content = f.read()

# 1. Add Loader2 and Activity to lucide-react imports
content = re.sub(
    r"import { (.*?) } from 'lucide-react';",
    r"import { \1, Loader2, Activity } from 'lucide-react';",
    content
)

# 2. Add useRef to react imports
content = re.sub(
    r"import { useState, useEffect } from 'react';",
    r"import { useState, useEffect, useRef } from 'react';",
    content
)

# 3. Add transferProgress state and currentDirRef
state_block = """  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const currentDirRef = useRef<string | null>(null);
  
  const [transferProgress, setTransferProgress] = useState<{
    percent: number;
    current_file: string;
    speed_bytes_per_sec: number;
    eta_seconds: number;
  } | null>(null);
"""
content = re.sub(
    r"  const \[currentDir, setCurrentDir\] = useState<string \| null>\(null\);",
    state_block,
    content
)

# 4. Update currentDirRef when currentDir changes
use_effect_block = """
  useEffect(() => {
    currentDirRef.current = currentDir;
  }, [currentDir]);
"""
# insert before the first useEffect
content = re.sub(
    r"  useEffect\(\(\) => {",
    use_effect_block + "\  useEffect(() => {",
    content,
    count=1
)
content = content.replace("\  useEffect", "  useEffect")

# 5. Modify the tauri://file-drop listener
drop_listener = """  useEffect(() => {
    const unlistenDrop = listen('tauri://file-drop', async (event) => {
      const payload = event.payload as string[];
      if (payload && payload.length > 0) {
        if (currentDirRef.current) {
          setTransferProgress({ percent: 0, current_file: "Starting...", speed_bytes_per_sec: 0, eta_seconds: 0 });
          try {
            await invoke('transfer_items', {
              sources: payload,
              targetDir: currentDirRef.current
            });
            setTransferProgress(null);
            loadDirectory(currentDirRef.current);
          } catch (e) {
            console.error(e);
            message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
            setTransferProgress(null);
          }
        } else {
          const firstPath = payload[0];
          setCurrentDir(firstPath);
          loadDirectory(firstPath);
        }
      }
    });

    const unlistenProgress = listen('transfer-progress', (event) => {
      setTransferProgress(event.payload as any);
    });

    return () => {
      unlistenDrop.then(f => f());
      unlistenProgress.then(f => f());
    };
  }, []);"""

# Replace old drop listener
content = re.sub(
    r"  useEffect\(\(\) => \{\n    const unlisten = listen\('tauri://file-drop', \(event\) => \{.*?\n    \};\n  \}, \[\]\);",
    drop_listener,
    content,
    flags=re.DOTALL
)

# 6. Add Transfer Progress UI before "Drop Zone"
progress_ui = """      {/* Transfer Progress Cyberpunk UI */}
      {transferProgress && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-8 rounded-2xl max-w-lg w-full border border-cyan-500 shadow-[0_0_40px_rgba(0,240,255,0.3)] relative overflow-hidden"
          >
            {/* Background Cyberpunk effect */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            
            <div className="flex items-center gap-4 mb-6 relative z-10">
              <Activity className="w-10 h-10 text-cyan-400 animate-pulse" />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white uppercase tracking-widest text-shadow-neon">Transferring Data</h2>
                <div className="text-xs font-mono text-cyan-400 truncate max-w-xs">{transferProgress.current_file}</div>
              </div>
              <div className="text-2xl font-bold font-mono text-cyan-300">
                {Math.round(transferProgress.percent)}%
              </div>
            </div>

            <div className="relative w-full h-4 bg-slate-900 rounded-full overflow-hidden border border-slate-700 mb-6 z-10 shadow-inner">
              <motion.div 
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-600 to-cyan-300 shadow-[0_0_15px_#00f0ff]"
                initial={{ width: 0 }}
                animate={{ width: `${transferProgress.percent}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </div>

            <div className="flex justify-between items-center text-xs font-mono text-slate-400 relative z-10">
              <div className="flex flex-col">
                <span className="text-slate-500 uppercase">Speed</span>
                <span className="text-cyan-300">{formatBytes(transferProgress.speed_bytes_per_sec)}/s</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-slate-500 uppercase">ETA</span>
                <span className="text-yellow-400">{transferProgress.eta_seconds > 0 ? (transferProgress.eta_seconds < 60 ? Math.round(transferProgress.eta_seconds) + "s" : Math.round(transferProgress.eta_seconds / 60) + "m " + Math.round(transferProgress.eta_seconds % 60) + "s") : "Calculating..."}</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}"""

content = content.replace("{/* Drop Zone */}", progress_ui + "\n\n      {/* Drop Zone */}")

with open("src/App.tsx", "w") as f:
    f.write(content)

print("Patching complete!")
