import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FolderSearch, Settings, Globe, Info, DownloadCloud, RefreshCw, ExternalLink, Activity, ArrowUpCircle, X, Search, ArrowDownAZ, ArrowDown01, PieChart, CheckSquare, Square, Trash2, Send, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { GameCard } from './components/GameCard';
import { HolographicDisk } from './components/HolographicDisk';
import { HackerConsole } from './components/HackerConsole';
import { GameDetailsModal } from './components/GameDetailsModal';
import { StorageAnalyzerModal } from './components/StorageAnalyzerModal';
import { SettingsModal } from './components/SettingsModal';
import { playScanSound, playSuccessSound, playSelectSound, playCancelSound, playMacheteSound, playHoverSound, playPS5GameSelectSound, isAudioMuted, setAudioMuted } from './utils/audio';
import i18n from './i18n';
import logoUrl from './assets/logo.jpg';
import { message, confirm, open } from '@tauri-apps/plugin-dialog';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

interface FileItem {
  name: string;
  path: string;
  ppsa?: string;
  size_bytes?: number;
  is_dir?: boolean;
  local_title?: string;
  local_icon?: string;
  app_ver?: string;
  sdk_ver?: string;
  min_firmware?: string;
  content_id?: string;
  category?: string;
  has_local_icon?: boolean;
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

  // Dynamic version & updater states
  const [appVersion, setAppVersion] = useState("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; body: string } | null>(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateDone, setUpdateDone] = useState(false);

  // Visual Effects & Settings Modal States (Enabled by default)
  const [visualEffects, setVisualEffects] = useState<boolean>(() => {
    return localStorage.getItem('machete_visual_effects') !== 'false';
  });
  const [showSettings, setShowSettings] = useState(false);

  const handleToggleVisualEffects = (val: boolean) => {
    setVisualEffects(val);
    try {
      localStorage.setItem('machete_visual_effects', String(val));
    } catch (_) {}
  };

  // Audio Mute State
  const [muted, setMuted] = useState(isAudioMuted());

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setAudioMuted(next);
    if (!next) {
      playSelectSound();
    }
  };

  // Search, filter & sorting states
  const [searchTerm, setSearchTerm] = useState("");
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'US' | 'EU' | 'JP' | 'OTHER'>('ALL');
  const [sortBy, setSortBy] = useState<'NAME' | 'SIZE_DESC' | 'SIZE_ASC'>('NAME');

  // Inspector & Storage modal states
  const [inspectingGame, setInspectingGame] = useState<FileItem | null>(null);
  const [showStorageAnalyzer, setShowStorageAnalyzer] = useState(false);

  // Multi-selection states
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const toggleSelectGame = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const selectAllFiltered = () => {
    playSelectSound();
    setSelectedPaths(new Set(filteredFiles.map(f => f.path)));
  };

  const clearSelection = () => {
    playCancelSound();
    setSelectedPaths(new Set());
  };

  const selectedFiles = useMemo(() => {
    return files.filter(f => selectedPaths.has(f.path));
  }, [files, selectedPaths]);

  const selectedTotalSize = useMemo(() => {
    return selectedFiles.reduce((acc, f) => acc + (f.size_bytes || 0), 0);
  }, [selectedFiles]);

  const handleBatchDelete = async () => {
    if (selectedPaths.size === 0) return;
    playSelectSound();
    const confirmed = await confirm(
      t("batch_delete_confirm_msg", { count: selectedPaths.size, size: formatBytes(selectedTotalSize) }),
      { title: `${t("batch_delete_confirm_title")} (${selectedPaths.size})`, kind: 'warning' }
    );
    if (!confirmed) return;

    for (const path of Array.from(selectedPaths)) {
      try {
        await invoke('delete_file', { path });
      } catch (e) {
        console.error("Failed to delete", path, e);
      }
    }
    setFiles(prev => prev.filter(f => !selectedPaths.has(f.path)));
    setSelectedPaths(new Set());
    playMacheteSound();
    const activeDir = currentDirRef.current || currentDir;
    if (activeDir) {
      try {
        const disk = await invoke<DiskInfo>('get_disk_space', { path: activeDir });
        setDiskInfo(disk);
      } catch (err) {
        console.error("Could not refresh disk space", err);
      }
    }
  };

  const handleBatchTransfer = async () => {
    if (selectedPaths.size === 0) return;
    try {
      const targetDir = await open({
        directory: true,
        multiple: false,
        title: t("batch_transfer_select_target"),
      });
      if (targetDir && typeof targetDir === 'string') {
        setTransferActive(true);
        await invoke('transfer_items', {
          sources: Array.from(selectedPaths),
          targetDir,
        });
        playSuccessSound();
        const count = selectedPaths.size;
        setSelectedPaths(new Set());
        message(t("batch_transfer_success", { count }), { title: t("app_name"), kind: 'info' });
      }
    } catch (e) {
      console.error(e);
      message(t("delete_error") + ": " + String(e), { title: "Error", kind: 'error' });
    } finally {
      setTransferActive(false);
    }
  };

  const filteredFiles = useMemo(() => {
    return files
      .filter((file) => {
        const meta = file.ppsa ? metadata[file.ppsa] : null;
        const title = (meta?.title || file.name).toLowerCase();
        const ppsa = (file.ppsa || '').toLowerCase();
        const search = searchTerm.toLowerCase().trim();

        // 1. Search Query Filter
        if (search && !title.includes(search) && !ppsa.includes(search)) {
          return false;
        }

        // 2. Region Filter
        if (regionFilter !== 'ALL') {
          const region = meta?.region_flag || '';
          if (regionFilter === 'US' && region !== 'US') return false;
          if (regionFilter === 'EU' && region !== 'EU') return false;
          if (regionFilter === 'JP' && region !== 'JP') return false;
          if (regionFilter === 'OTHER' && (region === 'US' || region === 'EU' || region === 'JP')) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'SIZE_DESC') {
          return (b.size_bytes || 0) - (a.size_bytes || 0);
        }
        if (sortBy === 'SIZE_ASC') {
          return (a.size_bytes || 0) - (b.size_bytes || 0);
        }
        const metaA = a.ppsa ? metadata[a.ppsa]?.title : a.name;
        const metaB = b.ppsa ? metadata[b.ppsa]?.title : b.name;
        return (metaA || a.name).localeCompare(metaB || b.name);
      });
  }, [files, metadata, searchTerm, regionFilter, sortBy]);

  // Fetch the real app version on mount
  useEffect(() => {
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion("?"));
  }, []);

  // Auto-check for updates on startup
  useEffect(() => {
    const autoCheck = async () => {
      try {
        const update = await check();
        if (update?.available) {
          setUpdateAvailable({ version: update.version, body: update.body || "" });
        }
      } catch (_) { /* silent fail on startup */ }
    };
    autoCheck();
  }, []);

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
      
      // 1. Instant Offline Seed: display local title and icon immediately
      const initialMeta: Record<string, MetadataInfo> = {};
      result.forEach(f => {
        if (f.ppsa) {
          initialMeta[f.ppsa] = {
            title: f.local_title || f.name,
            cover: f.local_icon,
          };
        }
      });
      setMetadata(prev => ({ ...initialMeta, ...prev }));
      
      // UNBLOCK UI INSTANTLY: Games appear immediately!
      setIsLoading(false);

      // 2. Background: Non-blocking disk space query
      invoke<DiskInfo>('get_disk_space', { path: dir })
        .then(disk => setDiskInfo(disk))
        .catch(e => console.error("Could not get disk space", e));

      // 3. Background: Asynchronously stream high-resolution vertical covers from CDN / SerialStation
      const ppsas = result.filter(f => f.ppsa).map(f => f.ppsa!);
      const uniquePpsas = [...new Set(ppsas)];
      
      uniquePpsas.forEach(async (ppsa) => {
        try {
          const meta = await invoke<MetadataInfo>('fetch_metadata_rs', { ppsa });
          if (meta) {
            setMetadata(prev => ({
              ...prev,
              [ppsa]: {
                ...meta,
                cover: meta.cover || prev[ppsa]?.cover || initialMeta[ppsa]?.cover,
              }
            }));
          }
        } catch (e) {
          // Keep offline title / local icon on network fallback
        }
      });

      // 4. Background: Asynchronously calculate folder sizes without blocking UI or thrashing disk
      const folderItems = result.filter(f => f.is_dir && (!f.size_bytes || f.size_bytes === 0));
      if (folderItems.length > 0) {
        (async () => {
          for (const folder of folderItems) {
            try {
              const size = await invoke<number>('get_folder_size', { path: folder.path });
              if (size > 0) {
                setFiles(prev => prev.map(item => item.path === folder.path ? { ...item, size_bytes: size } : item));
              }
            } catch (err) {
              console.error(`Could not calculate folder size for ${folder.path}:`, err);
            }
          }
        })();
      }
    } catch (e) {
      console.error(e);
      setIsLoading(false);
      await message(typeof e === 'string' ? e : "Error loading directory", { title: "Error", kind: "error" });
    }
  };


  useEffect(() => {
    currentDirRef.current = currentDir;
  }, [currentDir]);
  useEffect(() => {
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    const timer = setTimeout(() => {
      checkForUpdates(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleDragDrop = (event: any) => {
      const paths: string[] = Array.isArray(event.payload)
        ? event.payload
        : event.payload?.paths || [];
      if (paths && paths.length > 0) {
        if (currentDirRef.current) {
          startTransfer(paths);
        } else {
          const firstPath = paths[0];
          setCurrentDir(firstPath);
          loadDirectory(firstPath);
        }
      }
    };

    const unlistenDropLegacy = listen('tauri://file-drop', handleDragDrop);
    const unlistenDragDrop = listen('tauri://drag-drop', handleDragDrop);

    const unlistenAbout = listen('menu-open-about', () => {
      setShowAbout(true);
    });

    const unlistenSettings = listen('menu-open-settings', () => {
      setShowSettings(true);
    });

    const unlistenCheckUpdate = listen('menu-check-update', () => {
      checkForUpdates();
    });

    return () => {
      unlistenDropLegacy.then(f => f()).catch(console.error);
      unlistenDragDrop.then(f => f()).catch(console.error);
      unlistenAbout.then(f => f()).catch(console.error);
      unlistenSettings.then(f => f()).catch(console.error);
      unlistenCheckUpdate.then(f => f()).catch(console.error);
    };
  }, []);

  const handleDelete = async (filePath: string) => {
    const isConfirmed = await confirm(t("delete_confirm_msg"), {
      title: t("delete_confirm_title"),
      kind: 'warning',
    });
    
    if (isConfirmed) {
      try {
        await invoke('delete_file', { path: filePath });
        setFiles(prev => prev.filter(f => f.path !== filePath));
        playMacheteSound();
        addLog(`[MACHETE] Deleted item: ${filePath}`);

        // Automatically update disk space after deleting!
        const activeDir = currentDirRef.current || currentDir;
        if (activeDir) {
          try {
            const disk = await invoke<DiskInfo>('get_disk_space', { path: activeDir });
            setDiskInfo(disk);
            addLog(`[DISK] Refreshed capacity: ${(disk.free / (1024 * 1024 * 1024)).toFixed(2)} GB free`);
          } catch (err) {
            console.error("Could not refresh disk space after delete", err);
          }
        }
      } catch (e) {
        console.error(e);
        await message(t("delete_error"), { title: "Error", kind: "error" });
      }
    } else {
      playCancelSound();
    }
  };

  const handleRefresh = async () => {
    playScanSound();
    if (currentDir) {
      await loadDirectory(currentDir);
    }
  };

  const handleChangeCover = async (ppsa: string) => {
    playSelectSound();
    await message(t("cover_dimensions_warning"), { title: t("change_cover"), kind: "info" });
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (selected && typeof selected === 'string') {
      try {
        const base64Cover = await invoke<string>("save_custom_cover", { ppsa, imagePath: selected });
        setMetadata(prev => ({ ...prev, [ppsa]: { ...prev[ppsa], cover: base64Cover } }));
        playSuccessSound();
        addLog(`[METADATA] Saved custom cover for ${ppsa}`);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const openRenameModal = (ppsa: string, currentTitle: string) => {
    playSelectSound();
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
        playSuccessSound();
        addLog(`[METADATA] Saved custom title for ${renameData.ppsa}`);
      } catch (e) {
        console.error(e);
      }
    }
    setRenameData(null);
  };

  const checkForUpdates = async (silent = false) => {
    if (updateDownloading) {
      if (!silent) {
        await message(t("update_downloading"), { title: t("update_title"), kind: "info" });
      }
      return;
    }
    setUpdateChecking(true);
    try {
      const update = await check();
      if (update?.available) {
        setUpdateAvailable({ version: update.version, body: update.body || "" });
      } else {
        if (!silent) {
          await message(t("update_none"), { title: t("update_title"), kind: "info" });
        }
      }
    } catch (e: any) {
      console.warn("Update check error:", e);
      const errStr = String(e || "");
      // If endpoint returns 404 / Not Found, it means no newer release manifest is published yet
      if (errStr.includes("404") || errStr.toLowerCase().includes("not found") || errStr.toLowerCase().includes("no update")) {
        if (!silent) {
          await message(t("update_none"), { title: t("update_title"), kind: "info" });
        }
      } else {
        if (!silent) {
          await message(t("update_error"), { title: "Error", kind: "error" });
        }
      }
    } finally {
      setUpdateChecking(false);
    }
  };

  const downloadAndInstall = async () => {
    setUpdateDownloading(true);
    setUpdateProgress(0);
    try {
      const update = await check();
      if (update?.available) {
        let totalLength = 0;
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === 'Started' && event.data.contentLength) {
            totalLength = event.data.contentLength;
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            if (totalLength > 0) {
              setUpdateProgress(Math.round((downloaded / totalLength) * 100));
            }
          } else if (event.event === 'Finished') {
            setUpdateProgress(100);
          }
        });
        setUpdateDone(true);
        setUpdateDownloading(false);
      }
    } catch (e) {
      console.error("downloadAndInstall error:", e);
      await message(t("update_error"), { title: "Error", kind: "error" });
      setUpdateDownloading(false);
    }
  };

  return (
    <div className="min-h-screen p-6 font-sans flex flex-col relative selection:bg-cyan-500/30">
      {visualEffects && <div className="crt-overlay fixed inset-0 pointer-events-none"></div>}
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
        
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Select Directory Button */}
          <button 
            onClick={handleSelectDirectory}
            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 font-bold py-2 px-3.5 rounded-lg flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(0,240,255,0.15)] hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] text-xs font-mono"
            onMouseEnter={playHoverSound}
          >
            <FolderSearch className="w-4 h-4" />
            {t("select_dir")}
          </button>
          
          {/* Mute Audio Button */}
          <button 
            onClick={toggleMute}
            className={`p-2 rounded-lg transition-all border ${
              muted 
                ? 'bg-red-500/10 text-red-400 border-red-500/40 hover:bg-red-500/20' 
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border-slate-700 hover:border-cyan-500/50'
            }`}
            title={muted ? t("mute_toggle_unmute") : t("mute_toggle_mute")}
            onMouseEnter={playHoverSound}
          >
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          {/* Settings Modal Button */}
          <button 
            onClick={() => { playSelectSound(); setShowSettings(true); }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold p-2 rounded-lg transition-colors border border-slate-700 hover:border-cyan-500/50"
            title={t("settings_btn")}
            onMouseEnter={playHoverSound}
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* About Button */}
          <button 
            onClick={() => setShowAbout(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold p-2 rounded-lg transition-colors border border-slate-700 hover:border-slate-500"
            title={t("about")}
            onMouseEnter={playHoverSound}
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
              onMouseEnter={playHoverSound}
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
            {currentDir ? currentDir.split(/[/\\]/).pop() || currentDir : t("drag_drop")}
          </h2>
          <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded-md border border-slate-800">
            {filteredFiles.length} / {files.length} TITLES • {formatBytes(files.reduce((acc, f) => acc + (f.size_bytes || 0), 0))}
          </span>
          {/* Cyberpunk Grid Background */}
          {visualEffects && (
            <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      {currentDir && files.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3 items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800 backdrop-blur-md">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-cyan-400/60 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("search_placeholder")}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500/80 transition-colors font-mono"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Region Filter Chips */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-[11px] font-mono">
            <button
              onClick={() => setRegionFilter('ALL')}
              className={`px-2.5 py-1 rounded transition-colors ${regionFilter === 'ALL' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {t("filter_all")}
            </button>
            <button
              onClick={() => setRegionFilter('US')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${regionFilter === 'US' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              US
            </button>
            <button
              onClick={() => setRegionFilter('EU')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${regionFilter === 'EU' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              EU
            </button>
            <button
              onClick={() => setRegionFilter('JP')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${regionFilter === 'JP' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'}`}
            >
              JP
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-[11px] font-mono">
            <button
              onClick={() => setSortBy('NAME')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${sortBy === 'NAME' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'}`}
              title={t("sort_name")}
            >
              <ArrowDownAZ className="w-3.5 h-3.5" /> {t("sort_name")}
            </button>
            <button
              onClick={() => setSortBy('SIZE_DESC')}
              className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${sortBy === 'SIZE_DESC' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'}`}
              title={t("sort_size")}
            >
              <ArrowDown01 className="w-3.5 h-3.5" /> {t("sort_size")}
            </button>
          </div>

          {/* Action Toolbar Buttons: Storage Analyzer & Select All */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playSelectSound();
                setShowStorageAnalyzer(true);
              }}
              className="px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
              title={t("storage_tooltip")}
              onMouseEnter={playHoverSound}
            >
              <PieChart className="w-3.5 h-3.5" /> {t("storage_btn")}
            </button>

            <button
              onClick={selectedPaths.size === filteredFiles.length ? clearSelection : selectAllFiltered}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
              title={selectedPaths.size === filteredFiles.length && filteredFiles.length > 0 ? t("deselect_all") : t("select_all")}
              onMouseEnter={playHoverSound}
            >
              {selectedPaths.size === filteredFiles.length && filteredFiles.length > 0 ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-cyan-400" /> {t("deselect_all")}
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5" /> {t("select_all")}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Grid of Files */}
      {currentDir && (
        <div className="relative min-h-[300px]">
          <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 transition-opacity duration-300 ${isLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
            <AnimatePresence>
              {filteredFiles.map((file) => {
                const meta = file.ppsa ? metadata[file.ppsa] : null;
                const isSelected = selectedPaths.has(file.path);
                return (
                  <GameCard 
                    key={file.path} 
                    file={file} 
                    meta={meta} 
                    t={t}
                    isSelected={isSelected}
                    visualEffects={visualEffects}
                    onToggleSelect={toggleSelectGame}
                    onOpenDetails={(f: any) => {
                      playPS5GameSelectSound();
                      setInspectingGame(f);
                    }}
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

      {/* Floating Cyberpunk Batch Action Bar */}
      <AnimatePresence>
        {selectedPaths.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 glass-panel px-6 py-3.5 rounded-2xl border border-cyan-400/60 shadow-[0_0_30px_rgba(6,182,212,0.3)] flex items-center gap-6 bg-slate-950/95 backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 font-mono text-xs">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#06b6d4]"></div>
              <span className="text-white font-bold">{selectedPaths.size}</span>
              <span className="text-slate-400">{t("batch_games")} ({formatBytes(selectedTotalSize)})</span>
            </div>

            <div className="h-4 w-px bg-slate-800"></div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleBatchTransfer}
                className="py-1.5 px-3.5 rounded-xl border border-cyan-500/50 bg-cyan-950/60 hover:bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center gap-2 transition-all hover:scale-105"
                onMouseEnter={playHoverSound}
              >
                <Send className="w-3.5 h-3.5" /> {t("batch_transfer_btn")}
              </button>

              <button
                onClick={handleBatchDelete}
                className="py-1.5 px-3.5 rounded-xl border border-red-500/50 bg-red-950/60 hover:bg-red-500/20 text-red-400 text-xs font-mono font-bold flex items-center gap-2 transition-all hover:scale-105"
                onMouseEnter={playHoverSound}
              >
                <Trash2 className="w-3.5 h-3.5" /> {t("batch_delete_btn")} ({selectedPaths.size})
              </button>

              <button
                onClick={clearSelection}
                className="text-slate-400 hover:text-white text-xs font-mono font-bold px-2 py-1 transition-colors"
              >
                {t("batch_cancel_btn")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Details Modal */}
      {inspectingGame && (
        <GameDetailsModal
          game={files.find(f => f.path === inspectingGame.path) || inspectingGame}
          meta={inspectingGame.ppsa ? metadata[inspectingGame.ppsa] : null}
          onClose={() => setInspectingGame(null)}
          onRename={(ppsa, title) => openRenameModal(ppsa, title)}
          onChangeCover={handleChangeCover}
          onDelete={handleDelete}
          t={t}
        />
      )}

      {/* Storage Analyzer Modal */}
      {showStorageAnalyzer && (
        <StorageAnalyzerModal
          files={files}
          metadata={metadata}
          diskInfo={diskInfo}
          onClose={() => setShowStorageAnalyzer(false)}
          onSelectGame={(game) => setInspectingGame(game)}
          t={t}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        visualEffects={visualEffects}
        onToggleVisualEffects={handleToggleVisualEffects}
        audioMuted={muted}
        onToggleAudio={toggleMute}
        onCheckForUpdates={() => checkForUpdates(false)}
        updateChecking={updateChecking}
        onOpenAbout={() => setShowAbout(true)}
        t={t}
      />

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
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                <div className="flex items-center gap-3">
                  <Info className="text-cyan-400 w-5 h-5 flex-shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400">{t("version_label")}</div>
                    <div className="font-semibold text-white">v{appVersion}</div>
                    <div className="text-[10px] text-cyan-500/80">{t("license_info")}</div>
                  </div>
                </div>
                <button 
                  onClick={() => checkForUpdates(false)}
                  disabled={updateChecking}
                  className="px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/40 flex items-center gap-1.5 disabled:opacity-50"
                  title={t("update_check_btn")}
                >
                  {updateChecking ? (
                    <div className="w-3.5 h-3.5 border-2 border-slate-800 border-t-cyan-400 rounded-full animate-spin"></div>
                  ) : (
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                  )}
                  {updateChecking ? t("update_checking") : t("update_check_btn")}
                </button>
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
                {Array.isArray(t("changelogs", { returnObjects: true })) && (t("changelogs", { returnObjects: true }) as any[]).map((log: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="text-cyan-300 font-bold">{log.version}</div>
                    <ul className="list-disc pl-4 mt-1 opacity-80 space-y-0.5">
                      {Array.isArray(log.items) && log.items.map((item: string, itemIdx: number) => (
                        <li key={itemIdx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {/* Floating Mini Update Banner (Non-intrusive Cyberpunk Toast) */}
      <AnimatePresence>
        {updateAvailable && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm w-full p-4 rounded-xl bg-slate-900/95 border border-cyan-500/50 shadow-2xl shadow-cyan-950/80 backdrop-blur-md neon-border"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
                  <ArrowUpCircle className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    {t("update_available_title")}
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      v{updateAvailable.version}
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400 font-mono">
                    v{appVersion} → v{updateAvailable.version}
                  </p>
                </div>
              </div>
              {!updateDownloading && !updateDone && (
                <button 
                  onClick={() => setUpdateAvailable(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
                  title={t("update_later")}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {updateAvailable.body && (
              <div className="mt-2.5 max-h-24 overflow-y-auto p-2 bg-black/40 rounded border border-slate-800 text-[11px] text-slate-300 font-mono custom-scrollbar whitespace-pre-wrap">
                {updateAvailable.body}
              </div>
            )}

            {updateDownloading && (
              <div className="mt-3">
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-slate-400">{t("update_downloading")}</span>
                  <span className="text-cyan-400 font-bold">{updateProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div 
                    className="bg-gradient-to-r from-cyan-600 to-cyan-300 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                    style={{ width: `${updateProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              {!updateDownloading && !updateDone && (
                <>
                  <button 
                    onClick={() => setUpdateAvailable(null)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {t("update_later")}
                  </button>
                  <button 
                    onClick={downloadAndInstall}
                    className="px-3 py-1.5 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg transition-all shadow-[0_0_12px_rgba(0,240,255,0.3)] hover:shadow-[0_0_16px_rgba(0,240,255,0.5)] cursor-pointer"
                  >
                    {t("update_install_btn")}
                  </button>
                </>
              )}
              {updateDone && (
                <button 
                  onClick={() => relaunch()}
                  className="w-full py-2 text-xs font-bold bg-green-500 hover:bg-green-400 text-slate-950 rounded-lg transition-all shadow-[0_0_15px_rgba(34,197,94,0.4)] animate-pulse cursor-pointer"
                >
                  {t("update_relaunch")}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <HackerConsole logs={logs} />
    </div>
  );
}
