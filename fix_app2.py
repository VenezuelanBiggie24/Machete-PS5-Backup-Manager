import re

with open("src/App.tsx", "r") as f:
    app = f.read()

# Replace Disk Info Bar
old_disk_regex = r'\{\/\* Disk Info Bar \*\/\}\s*\{diskInfo && \([\s\S]*?\}\)'
new_disk = """{/* Disk Info Bar */}
      <div className="mb-6 flex justify-between items-center">
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
      </div>"""
app = re.sub(old_disk_regex, new_disk, app)

# Replace Grid mapping
old_grid_regex = r'\{files\.map\(\(file\) => \{\s*const meta = metadata\[file\.ppsa \|\| \'\'\];\s*return \(\s*<motion\.div[\s\S]*?</motion\.div>\s*\);\s*\}\)\}'
new_grid = """{files.map((file) => {
              const meta = metadata[file.ppsa || ''];
              return (
                <GameCard 
                  key={file.path} 
                  file={file} 
                  meta={meta} 
                  t={t} 
                  onDelete={handleDelete} 
                  onRename={submitRename} 
                  onChangeCover={handleChangeCover} 
                />
              );
            })}"""
app = re.sub(old_grid_regex, new_grid, app)

# Replace Hacker Console (Inject it correctly)
app = app.replace("</AnimatePresence>\n      <HackerConsole logs={logs} />\n    </div>\n  );\n}", "</AnimatePresence>\n    </div>\n  );\n}")
app = app.replace("</AnimatePresence>\n    </div>", "</AnimatePresence>\n      <HackerConsole logs={logs} />\n    </div>")

with open("src/App.tsx", "w") as f:
    f.write(app)

print("App.tsx fixed again.")
