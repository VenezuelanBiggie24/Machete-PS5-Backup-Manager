with open("src/App.tsx", "r") as f:
    app = f.read()

# 1. Imports
app = app.replace("import { motion, AnimatePresence } from 'framer-motion';", "import { motion, AnimatePresence } from 'framer-motion';\nimport { GameCard } from './components/GameCard';\nimport { HolographicDisk } from './components/HolographicDisk';\nimport { HackerConsole } from './components/HackerConsole';\nimport { playScanSound, playSuccessSound } from './utils/audio';")

# 2. Add logs state
app = app.replace("const [transferActive, setTransferActive] = useState(false);", "const [transferActive, setTransferActive] = useState(false);\n  const [logs, setLogs] = useState<string[]>([]);\n  const addLog = (msg: string) => setLogs(p => [...p, msg].slice(-50));")

# 3. Add CRT overlay
app = app.replace('<div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">', '<div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">\n      <div className="crt-overlay fixed inset-0"></div>')

# 4. Replace Disk Info Bar exactly
old_disk = '''      {/* Disk Info Bar */}
      {diskInfo && (
        <div className="mb-6 glass-panel rounded-xl p-4 flex items-center justify-between border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <HardDrive className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{t("free_space")}</div>
              <div className="font-mono text-lg text-slate-200">
                {formatBytes(diskInfo.free)} <span className="text-slate-500 text-sm">/ {formatBytes(diskInfo.total)}</span>
              </div>
            </div>
          </div>
          {currentDir && (
            <button 
              onClick={handleRefresh}
              className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors flex items-center gap-2 text-sm"
              title="Recargar Directorio"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      )}'''

new_disk = '''      {/* Disk Info Bar */}
      <div className="mb-6 flex justify-between items-center z-10">
        <HolographicDisk diskInfo={diskInfo} t={t} />
        {currentDir && (
            <button 
              onClick={handleRefresh}
              className="p-3 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors flex items-center gap-2 border border-slate-700"
              title="Recargar Directorio"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
        )}
      </div>'''
app = app.replace(old_disk, new_disk)

# 5. Replace Grid mapping exactly
old_grid = '''            {files.map((file) => {
              const meta = file.ppsa ? metadata[file.ppsa] : null;
              
              return (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={file.path} 
                  className="glass-panel rounded-xl overflow-hidden flex flex-col group border border-slate-700 hover:border-cyan-500/50 transition-colors"
                >
                  <div className="aspect-[3/4] bg-slate-900 relative">
                    {meta?.cover ? (
                      <img src={meta.cover} alt="cover" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-4 text-center">
                        <span className="text-slate-500 font-mono text-xs">{file.name}</span>
                      </div>
                    )}
                    
                    {/* Hover Overlay Actions */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
                      {file.ppsa && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openRenameModal(file.ppsa!, meta?.title || file.name); }}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border border-slate-600 transition-all shadow-lg"
                          >
                            <Edit2 className="w-3 h-3" /> {t("edit_title")}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleChangeCover(file.ppsa!); }}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 border border-slate-600 transition-all shadow-lg"
                          >
                            <ImageIcon className="w-3 h-3" /> {t("change_cover")}
                          </button>
                        </>
                      )}
                    </div>
                    
                    {file.ppsa && (
                      <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-mono text-cyan-400 border border-cyan-500/30 backdrop-blur-md pointer-events-none z-10">
                        {file.ppsa}
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="text-sm font-semibold truncate" title={meta?.title || file.name}>
                      {meta?.region_flag && <span className="mr-1">{meta.region_flag}</span>}
                      {meta?.title || file.name}
                    </h3>
                    <div className="text-xs text-slate-400 mt-1 font-mono">
                      {file.size_bytes ? formatBytes(file.size_bytes, 1) : "0 GB"}
                    </div>
                    <button 
                      onClick={() => handleDelete(file.path)}
                      className="mt-auto pt-3 flex items-center justify-center gap-2 text-red-500 hover:text-red-400 text-sm font-bold transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t("machetear")}
                    </button>
                  </div>
                </motion.div>
              );
            })}'''

new_grid = '''            {files.map((file) => {
              const meta = file.ppsa ? metadata[file.ppsa] : null;
              return (
                <GameCard 
                  key={file.path} 
                  file={file} 
                  meta={meta} 
                  t={t} 
                  onDelete={handleDelete} 
                  onRename={(ppsa, defaultTitle) => openRenameModal(ppsa, defaultTitle)} 
                  onChangeCover={handleChangeCover} 
                />
              );
            })}'''
app = app.replace(old_grid, new_grid)

# 6. Inject Hacker Console before the last two closing tags of the entire file
# The file ends with:
#       )}
#     </div>
#   );
# }
app = app.replace("      )}\n    </div>\n  );\n}", "      )}\n      <HackerConsole logs={logs} />\n    </div>\n  );\n}")

# 7. Add log calls
app = app.replace("setIsLoading(true);", "setIsLoading(true);\n      playScanSound();\n      addLog(`[INFO] Scanning directory: ${dir}`);")
app = app.replace("setFiles(mappedFiles);", "setFiles(mappedFiles);\n      addLog(`[SUCCESS] Found ${items.length} items`);")
app = app.replace("setTransferActive(false);", "setTransferActive(false);\n      playSuccessSound();\n      addLog(`[SUCCESS] Transfer completed`);")

with open("src/App.tsx", "w") as f:
    f.write(app)

print("App.tsx refactored exactly!")
