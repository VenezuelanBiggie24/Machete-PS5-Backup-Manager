import re

with open("src/App.tsx", "r") as f:
    app_tsx = f.read()

# 1. Fix handleDelete state bug
app_tsx = app_tsx.replace("setFiles(files.filter(f => f.path !== filePath));", "setFiles(prev => prev.filter(f => f.path !== filePath));")

# 2. Extract TransferProgressModal and remove transferProgress from App
transfer_modal_comp = """
const TransferProgressModal = () => {
  const [progress, setProgress] = useState<{
    percent: number;
    current_file: string;
    speed_bytes_per_sec: number;
    eta_seconds: number;
  } | null>(null);

  useEffect(() => {
    const unlisten = listen('transfer-progress', (event: any) => {
      setProgress(event.payload);
    });
    return () => {
      unlisten.then(f => f()).catch(console.error);
    };
  }, []);

  if (!progress) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md bg-black/60 p-4">
      <div className="bg-slate-900/90 border border-cyan-500/30 p-8 rounded-2xl max-w-lg w-full shadow-2xl shadow-cyan-900/20 neon-border relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="flex items-center space-x-4 mb-6 relative z-10">
          <div className="p-3 bg-cyan-500/10 rounded-full">
            <Activity className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide">SYSTEM OVERRIDE</h3>
            <p className="text-sm text-cyan-400/80 font-mono">Transferring Data...</p>
          </div>
        </div>

        <div className="space-y-4 relative z-10">
          <div>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-slate-400 truncate w-3/4">{progress.current_file}</span>
              <span className="text-cyan-400">{progress.percent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-cyan-600 to-cyan-300 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                style={{ width: `${progress.percent}%` }}
              ></div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs font-mono bg-black/40 p-3 rounded-lg border border-cyan-500/10">
            <div>
              <span className="text-slate-500">SPEED: </span>
              <span className="text-yellow-400">{(progress.speed_bytes_per_sec / 1024 / 1024).toFixed(2)} MB/s</span>
            </div>
            <div>
              <span className="text-slate-500">ETA: </span>
              <span className="text-yellow-400">
                {progress.eta_seconds > 60 
                  ? `${Math.floor(progress.eta_seconds / 60)}m ${Math.floor(progress.eta_seconds % 60)}s` 
                  : `${Math.floor(progress.eta_seconds)}s`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
"""

# Insert TransferProgressModal before App component
app_tsx = app_tsx.replace("function App() {", transfer_modal_comp + "\nfunction App() {")

# Remove transferProgress state from App
app_tsx = re.sub(r'const \[transferProgress, setTransferProgress\] = useState<any>\(null\);\n', '', app_tsx)

# Replace startTransfer logic to avoid setting local transfer progress
old_start = """  const startTransfer = async (payload: string[]) => {
    if (!currentDirRef.current) return;
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
  };"""

new_start = """  const startTransfer = async (payload: string[]) => {
    if (!currentDirRef.current) return;
    try {
      await invoke('transfer_items', {
        sources: payload,
        targetDir: currentDirRef.current
      });
      loadDirectory(currentDirRef.current);
    } catch (e) {
      console.error(e);
      message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
    }
  };"""
app_tsx = app_tsx.replace(old_start, new_start)

# Replace the transfer progress modal JSX inside App return
modal_regex = re.compile(r'\{\/\* Transfer Progress Modal \*\/\}.*?(?=\{\/\* Header \*\/\})', re.DOTALL)
app_tsx = modal_regex.sub('<TransferProgressModal />\n\n      ', app_tsx)

# 3. Add .catch(console.error) to Tauri event unlistens
app_tsx = app_tsx.replace("unlistenDrop.then(f => f());", "unlistenDrop.then(f => f()).catch(console.error);")
app_tsx = app_tsx.replace("unlistenProgress.then(f => f());", "")
app_tsx = app_tsx.replace("const unlistenProgress = listen('transfer-progress', (event) => {\n      setTransferProgress(event.payload as any);\n    });", "")

with open("src/App.tsx", "w") as f:
    f.write(app_tsx)

print("React code patched successfully.")
