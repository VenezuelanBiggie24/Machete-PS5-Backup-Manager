import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HardDrive, PieChart, ArrowDown01 } from 'lucide-react';
import { playCancelSound, playHoverSound, playSelectSound } from '../utils/audio';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface StorageAnalyzerModalProps {
  files: any[];
  metadata: Record<string, any>;
  diskInfo: { total: number; free: number } | null;
  onClose: () => void;
  onSelectGame: (game: any) => void;
  t: (key: string, options?: any) => string;
}

const COLORS = [
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // purple-500
  '#ec4899', // pink-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#e11d48', // rose-600
];

export function StorageAnalyzerModal({ files, metadata, diskInfo, onClose, onSelectGame, t }: StorageAnalyzerModalProps) {
  // Sort games by size descending
  const sortedGames = useMemo(() => {
    return [...files].sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
  }, [files]);

  const totalGamesSize = useMemo(() => {
    return files.reduce((acc, f) => acc + (f.size_bytes || 0), 0);
  }, [files]);

  const diskTotal = diskInfo?.total || totalGamesSize;
  const diskFree = diskInfo?.free || 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.2 }}
          className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col bg-slate-950/95"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-mono font-bold tracking-wider text-cyan-300 uppercase">
                  {t("storage_analyzer_title")}
                </h2>
                <span className="text-[11px] font-mono text-slate-400">
                  {t("storage_analyzer_subtitle", { count: files.length, size: formatBytes(totalGamesSize) })}
                </span>
              </div>
            </div>
            <button
              onClick={() => { playCancelSound(); onClose(); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 border border-transparent hover:border-red-500/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 custom-scrollbar">
            {/* Disk Overview Gauge Card */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-300 font-bold flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-cyan-400" /> {t("storage_disk_external")}
                </span>
                <span className="text-slate-400">
                  {t("storage_disk_used_of", { 
                    used: formatBytes(diskTotal - diskFree), 
                    total: formatBytes(diskTotal), 
                    free: formatBytes(diskFree) 
                  })}
                </span>
              </div>

              {/* Multi-segment Colored Storage Bar */}
              <div className="w-full h-4 rounded-full bg-slate-950 overflow-hidden flex border border-slate-800 shadow-inner">
                {sortedGames.slice(0, 10).map((g, idx) => {
                  const pct = totalGamesSize > 0 ? ((g.size_bytes || 0) / diskTotal) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={g.path}
                      style={{ width: `${pct}%`, backgroundColor: COLORS[idx % COLORS.length] }}
                      className="h-full transition-all hover:opacity-80 relative group"
                      title={`${metadata[g.ppsa || '']?.title || g.name}: ${formatBytes(g.size_bytes || 0)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>

              {/* Legend Summary */}
              <div className="flex flex-wrap gap-3 pt-1 text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-500"></div>
                  <span className="text-slate-300">{t("storage_legend_ps5")} ({formatBytes(totalGamesSize)})</span>
                </div>
                {diskFree > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
                    <span className="text-slate-400">{t("storage_legend_free")} ({formatBytes(diskFree)})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Games Ranked List by Weight */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1 border-b border-slate-800">
                <span className="flex items-center gap-1.5 font-bold text-cyan-300">
                  <ArrowDown01 className="w-4 h-4" /> {t("storage_heavy_rankings")}
                </span>
                <span>{t("storage_header_size_pct")}</span>
              </div>

              <div className="flex flex-col gap-2">
                {sortedGames.map((game, idx) => {
                  const size = game.size_bytes || 0;
                  const pctOfGames = totalGamesSize > 0 ? (size / totalGamesSize) * 100 : 0;
                  const meta = metadata[game.ppsa || ''];
                  const title = meta?.title || game.local_title || game.name;
                  const color = COLORS[idx % COLORS.length] || '#64748b';

                  return (
                    <motion.div
                      key={game.path}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => { playSelectSound(); onSelectGame(game); onClose(); }}
                      className="p-3 rounded-xl bg-slate-900/40 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/40 flex items-center justify-between gap-4 cursor-pointer transition-colors group"
                      onMouseEnter={playHoverSound}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 text-center font-mono font-bold text-xs text-slate-500 group-hover:text-cyan-400">
                          #{idx + 1}
                        </span>
                        <div
                          className="w-2.5 h-8 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white group-hover:text-cyan-300 truncate font-sans">
                            {title}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                            <span>{game.ppsa || t("no_ppsa")}</span>
                            <span>•</span>
                            <span>{game.is_dir ? t("format_folder") : t("format_container")}</span>
                          </div>
                        </div>
                      </div>

                      {/* Size & Percentage Bar */}
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="font-mono font-bold text-xs text-cyan-300">
                          {formatBytes(size)}
                        </span>
                        <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden flex justify-end">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pctOfGames}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-slate-400">
                          {pctOfGames.toFixed(1)}% {t("storage_of_total")}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
