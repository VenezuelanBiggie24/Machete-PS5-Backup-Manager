import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FolderSearch, Settings, Globe, Info, DownloadCloud, RefreshCw, ExternalLink, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { GameCard } from './components/GameCard';
import { HolographicDisk } from './components/HolographicDisk';
import { HackerConsole } from './components/HackerConsole';
import { playScanSound, playSuccessSound } from './utils/audio';
import i18n from './i18n';
import logoUrl from './assets/logo.jpg';
import { message, confirm, open } from '@tauri-apps/plugin-dialog';

interface FileItem {
  name: string;
  path: string;
  ppsa?: string;
  size_bytes?: number;
  is_dir?: boolean;
}

interface MetadataInfo {
  title: string;
  cover?: string;
  region_flag?: string;
}

interface DiskInfo {
  total: number;
  free: number;
}



const TransferProgressModal = ({ active }: { active: boolean }) => {
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

  if (!active || !progress) return null;

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


function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function App() {
  const { t } = useTranslation();
  const [currentDir, setCurrentDir] = useState<string | null>(null);
  const currentDirRef = useRef<string | null>(null);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [metadata, setMetadata] = useState<Record<string, MetadataInfo>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [transferActive, setTransferActive] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const addLog = (msg: string) => setLogs(p => [...p, msg].slice(-50));
  const [showAbout, setShowAbout] = useState(false);
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);

  // Rename modal states
  const [renameData, setRenameData] = useState<{ppsa: string, title: string} | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const startTransfer = async (payload: string[]) => {
    if (!currentDirRef.current) return;
    setTransferActive(true);
    try {
      await invoke('transfer_items', {
        sources: payload,
        targetDir: currentDirRef.current
      });
      loadDirectory(currentDirRef.current);
    } catch (e) {
      console.error(e);
      message("Error transfering files: " + String(e), { title: "Error", kind: 'error' });
    } finally {
      setTransferActive(false);
      playSuccessSound();
      addLog(`[SUCCESS] Transfer completed`);
    }
  };

  const handleDropzoneClick = async () => {
    try {
      const selected = await open({
        multiple: true,
      });
      if (selected && Array.isArray(selected) && selected.length > 0) {
        startTransfer(selected);
      } else if (selected && typeof selected === 'string') {
        startTransfer([selected]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected && typeof selected === 'string') {
        setCurrentDir(selected);
        await loadDirectory(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadDirectory = async (dir: string) => {
    setIsLoading(true);
      playScanSound();
      addLog(`[INFO] Scanning directory: ${dir}`);
    try {
      const result = await invoke<FileItem[]>('read_directory', { path: dir });
      setFiles(result);
      
      // Async folder size fetch
      result.forEach(async (file) => {
        if (file.is_dir) {
          try {
            const size = await invoke<number>('get_folder_size', { path: file.path });
            setFiles(prev => prev.map(f => f.path === file.path ? { ...f, size_bytes: size } : f));
          } catch (e) {
            console.error("Error getting folder size for", file.path, e);
          }
        }
      });

      
      try {
        const disk = await invoke<DiskInfo>('get_disk_space', { path: dir });
        setDiskInfo(disk);
      } catch (e) {
        console.error("Could not get disk space", e);
      }

      const ppsas = result.filter(f => f.ppsa).map(f => f.ppsa!);
      const uniquePpsas = [...new Set(ppsas)];
      
      const metaPromises = uniquePpsas.map(async (ppsa) => {
        try {
          const meta = await invoke<MetadataInfo>('fetch_metadata_rs', { ppsa });
          return { ppsa, meta };
        } catch (e) {
          console.error(`Failed to fetch metadata for ${ppsa}`, e);
          return { ppsa, meta: null };
        }
      });
      
      const metaResults = await Promise.all(metaPromises);
      const newMeta: Record<string, MetadataInfo> = {};
      metaResults.forEach(r => {
        if (r.meta) newMeta[r.ppsa] = r.meta;
      });
      
      setMetadata(prev => ({ ...prev, ...newMeta }));
    } catch (e) {
      console.error(e);
      await message(typeof e === 'string' ? e : "Error loading directory", { title: "Error", kind: "error" });
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    currentDirRef.current = currentDir;
  }, [currentDir]);
  useEffect(() => {
    const unlistenDrop = listen('tauri://file-drop', async (event) => {
      const payload = event.payload as string[];
      if (payload && payload.length > 0) {
        if (currentDirRef.current) {
          startTransfer(payload);
        } else {
          const firstPath = payload[0];
          setCurrentDir(firstPath);
          loadDirectory(firstPath);
        }
      }
    });

    

    return () => {
      unlistenDrop.then(f => f()).catch(console.error);
      
    };
  }, []);

  const handleChangeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const handleDelete = async (filePath: string) => {
    const isConfirmed = await confirm(t("delete_confirm_msg"), {
      title: t("delete_confirm_title"),
      kind: 'warning',
    });
    
    if (isConfirmed) {
      try {
        await invoke('delete_file', { path: filePath });
        setFiles(prev => prev.filter(f => f.path !== filePath));
      } catch (e) {
        console.error(e);
        await message(t("delete_error"), { title: "Error", kind: "error" });
      }
    }
  };

  const handleRefresh = async () => {
    if (currentDir) {
      await loadDirectory(currentDir);
    }
  };

  const handleChangeCover = async (ppsa: string) => {
    await message(t("cover_dimensions_warning"), { title: t("change_cover"), kind: "info" });
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (selected && typeof selected === 'string') {
      try {
        const base64Cover = await invoke<string>("save_custom_cover", { ppsa, imagePath: selected });
        setMetadata(prev => ({ ...prev, [ppsa]: { ...prev[ppsa], cover: base64Cover } }));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const openRenameModal = (ppsa: string, currentTitle: string) => {
    setRenameInput(currentTitle);
    setRenameData({ ppsa, title: currentTitle });
  };

  const submitRename = async () => {
    if (renameData && renameInput.trim()) {
      try {
        await invoke("save_custom_title", { ppsa: renameData.ppsa, title: renameInput.trim() });
        setMetadata(prev => ({
          ...prev,
          [renameData.ppsa]: { ...prev[renameData.ppsa], title: renameInput.trim() }
        }));
      } catch (e) {
        console.error(e);
      }
    }
    setRenameData(null);
  };

  const renderChangelogItems = (items: any) => {
    if (!Array.isArray(items)) return null;
    return items.map((item, idx) => <li key={idx}>{item}</li>);
  };

  return (
    <div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">
      <div className="crt-overlay fixed inset-0"></div>
      <TransferProgressModal active={transferActive} />
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-900/20 blur-[120px] rounded-full mix-blend-screen"></div>
      </div>

      {/* Toast Notification for SSD scanning */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, y: -50, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -50, x: "-50%" }}
            className="fixed top-6 left-1/2 z-50 glass-panel border border-cyan-500/50 shadow-[0_0_20px_rgba(0,240,255,0.2)] rounded-lg p-4 flex items-center gap-4 min-w-[300px] max-w-md bg-slate-900/90"
          >
            <div className="w-8 h-8 border-2 border-slate-800 border-t-cyan-400 rounded-full animate-spin flex-shrink-0"></div>
            <div>
              <h4 className="text-cyan-400 font-bold text-sm">{t("scanning_dir")}</h4>
              <p className="text-slate-300 text-xs">{t("ssd_warning")}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 glass-panel p-4 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-400 to-blue-600"></div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center shadow-inner overflow-hidden border border-slate-700">
            <img src={logoUrl} alt="Logo" className="w-full h-full object-cover opacity-90" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-400 drop-shadow-[0_0_10px_rgba(0,240,255,0.3)]">
              {t("app_name")}
            </h1>
            <p className="text-slate-400 text-sm font-medium">{t("app_subtitle")}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <select 
            onChange={(e) => handleChangeLanguage(e.target.value)} 
            value={i18n.language}
            className="bg-slate-900/80 border border-slate-700 text-slate-300 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2 cursor-pointer hover:border-cyan-500/50 transition-colors outline-none"
          >
            <option value="en">🇬🇧 English</option>
            <option value="es_ve">🇻🇪 Español (Venezuela)</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="it">🇮🇹 Italiano</option>
            <option value="pt_br">🇧🇷 Português (BR)</option>
            <option value="pt_pt">🇵🇹 Português (PT)</option>
            <option value="ru">🇷🇺 Русский</option>
            <option value="ja">🇯🇵 日本語</option>
            <option value="zh">🇨🇳 中文</option>
            <option value="ko">🇰🇷 한국어</option>
            <option value="ar">🇸🇦 العربية</option>
          </select>
          
          <button 
            onClick={handleSelectDirectory}
            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.15)] hover:shadow-[0_0_20px_rgba(0,240,255,0.3)]"
          >
            <FolderSearch className="w-4 h-4" />
            {t("select_dir")}
          </button>
          
          <button 
            onClick={() => setShowAbout(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold p-2 rounded-lg transition-colors border border-slate-700 hover:border-slate-500"
            title="About"
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Disk Info Bar */}
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
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative rounded-2xl overflow-hidden glass-panel border border-slate-800/50 mb-6 flex flex-col">
        {/* Header Bar */}
        <div className="px-6 py-3 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/30 backdrop-blur-md sticky top-0 z-20">
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-500" />
            {currentDir ? currentDir.split('/').pop() || currentDir : t("drag_drop")}
          </h2>
          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            {files.length} ITEMS • {formatBytes(files.reduce((acc, f) => acc + (f.size_bytes || 0), 0))}
          </span>
          {/* Cyberpunk Grid Background */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        </div>
      </div>

      {/* Grid of Files */}
      {currentDir && (
        <div className="relative min-h-[300px]">
          
          <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 transition-opacity duration-300 ${isLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
          <AnimatePresence>
            {files.map((file) => {
              const meta = file.ppsa ? metadata[file.ppsa] : null;
              return (
                <GameCard 
                  key={file.path} 
                  file={file} 
                  meta={meta} 
                  t={t} 
                  onDelete={handleDelete} 
                  onRename={(ppsa: string, defaultTitle: string) => openRenameModal(ppsa, defaultTitle)} 
                  onChangeCover={handleChangeCover} 
                />
              );
            })}
          </AnimatePresence>
        </div>
        </div>
      )}

      {/* Drop Zone */}
      {currentDir && (
        <div onClick={handleDropzoneClick} className="mt-8 border-2 border-dashed border-cyan-500/50 rounded-xl p-12 flex flex-col items-center justify-center text-cyan-400/70 hover:bg-cyan-500/5 hover:border-cyan-400 transition-all cursor-pointer neon-border">
          <DownloadCloud className="w-16 h-16 mb-4" />
          <span className="text-xl font-bold">{t("drag_drop")}</span>
          <span className="text-sm mt-2 text-cyan-500/60 font-mono">...or click here to open Finder</span>
        </div>
      )}

      {/* Rename Modal */}
      {renameData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-6 rounded-2xl max-w-sm w-full border border-cyan-500/50 shadow-[0_0_30px_rgba(0,240,255,0.2)]"
          >
            <h3 className="text-lg font-bold text-white mb-2">{t("edit_title")}</h3>
            <p className="text-xs text-cyan-300/80 mb-4 font-mono">{t("rename_prompt")}</p>
            <input 
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white mb-4 outline-none focus:border-cyan-500 transition-colors"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') setRenameData(null);
              }}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setRenameData(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={submitRename}
                className="px-4 py-2 text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-8 rounded-2xl max-w-md w-full border border-cyan-500/50 shadow-[0_0_30px_rgba(0,240,255,0.2)] relative"
          >
            <button onClick={() => setShowAbout(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
            <div className="text-center mb-6">
              <div className="w-24 h-24 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg neon-border p-1 overflow-hidden">
                <img src={logoUrl} alt="Machete Logo" className="w-full h-full object-cover rounded-xl" />
              </div>
              <h2 className="text-2xl font-bold">{t("app_name")}</h2>
              <p className="text-slate-400 mt-1">{t("app_subtitle")}</p>
            </div>
            
            <div className="text-center mb-6 px-4">
              <p className="text-sm text-cyan-300/80 italic">{t("about_desc")}</p>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Globe className="text-cyan-400" />
                <div>
                  <div className="text-xs text-slate-400">{t("author_label")}</div>
                  <div className="font-semibold text-white">{t("author")}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Info className="text-cyan-400" />
                <div>
                  <div className="text-xs text-slate-400">{t("version_label")}</div>
                  <div className="font-semibold text-white">1.2.0</div>
                  <div className="text-[10px] text-cyan-500/80 mt-1">{t("license_info")}</div>
                </div>
              </div>
              <a 
                href="https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 group/gh cursor-pointer"
              >
                <svg className="w-6 h-6 text-cyan-400 group-hover/gh:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                <div className="flex-1">
                  <div className="text-xs text-slate-400">{t("repository_label")}</div>
                  <div className="font-semibold text-cyan-400 group-hover/gh:text-cyan-300 transition-colors text-sm flex items-center gap-1">
                    GitHub <ExternalLink className="w-3 h-3" />
                  </div>
                </div>
              </a>
            </div>
            
            <div className="mt-6 border-t border-cyan-500/30 pt-4">
              <h3 className="text-sm font-semibold text-cyan-400 mb-2">{t("changelog_title")}</h3>
              <div className="bg-black/50 rounded-lg p-3 h-40 overflow-y-auto text-xs text-slate-300 space-y-3 font-mono border border-cyan-500/10 custom-scrollbar">
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v200_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v200_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v123_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v123_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v120_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v120_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v110_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v110_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v100_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v100_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v020_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v020_items", { returnObjects: true }))}
                  </ul>
                </div>
                <div>
                  <div className="text-cyan-300 font-bold">{t("changelog_v010_title")}</div>
                  <ul className="list-disc pl-4 mt-1 opacity-80">
                    {renderChangelogItems(t("changelog_v010_items", { returnObjects: true }))}
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      <HackerConsole logs={logs} />
    </div>
  );
}
