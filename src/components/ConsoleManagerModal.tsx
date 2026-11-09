import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Send, 
  RefreshCw, 
  Search, 
  Trash2, 
  HardDrive, 
  Wifi, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Gamepad2, 
  ArrowDownAZ,
  ArrowDown01,
  Info,
  Radar
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { FileItem } from '../App';
import { GameCard } from './GameCard';
import { GameDetailsModal } from './GameDetailsModal';
import { 
  playSelectSound, 
  playCancelSound, 
  playHoverSound, 
  playScanSound, 
  playSuccessSound, 
  playMacheteSound,
  playPS5GameSelectSound 
} from '../utils/audio';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function resolveStorageBadge(item: any): string {
  if (item.storage_label && item.storage_label.trim().startsWith('[')) {
    return item.storage_label;
  }
  const p = (item.path || '').replace(/\\/g, '/');
  if (p.startsWith('/mnt/ext')) {
    const segs = p.split('/');
    const mount = segs.slice(0, 3).join('/'); // e.g. /mnt/ext0 or /mnt/ext1
    const sub = segs[3] || 'games';
    return `[M.2 SSD] ${mount}/${sub}`;
  }
  if (p.startsWith('/data')) {
    const sub = p.replace('/data', '').split('/')[1] || 'games';
    return `[Interno] /data/${sub}`;
  }
  if (p.startsWith('/user/app')) {
    return '[Interno] /user/app';
  }
  if (p.startsWith('/mnt/usb0')) {
    const sub = p.replace('/mnt/usb0', '').split('/')[1] || 'games';
    return `[USB 0] /mnt/usb0/${sub}`;
  }
  if (p.startsWith('/mnt/usb1')) {
    const sub = p.replace('/mnt/usb1', '').split('/')[1] || 'games';
    return `[USB 1] /mnt/usb1/${sub}`;
  }
  if (p.startsWith('/mnt/usb')) {
    return `[USB] ${p.substring(0, p.lastIndexOf('/')) || p}`;
  }
  return p.includes('/') ? p.substring(0, p.lastIndexOf('/')) : p;
}

function normalizeConsoleGame(raw: any): FileItem {
  const ppsa = raw.title_id || raw.ppsa;
  const name = raw.title || raw.name || ppsa || 'Unknown Title';
  const size_bytes = typeof raw.size === 'number' ? raw.size : (raw.size_bytes || 0);

  let storage_label = raw.storage_label || '';
  if (raw.storage_device && raw.storage_label) {
    if (!raw.storage_label.includes(raw.storage_device)) {
      storage_label = `[${raw.storage_device}] ${raw.storage_label}`;
    }
  } else if (!storage_label || !storage_label.startsWith('[')) {
    storage_label = resolveStorageBadge(raw);
  }

  return {
    name,
    path: raw.path,
    ppsa,
    size_bytes,
    is_dir: raw.format === 'folder' || raw.is_dir || true,
    storage_label,
    local_title: raw.title || raw.name,
    local_icon: raw.cover || raw.local_icon,
  };
}

interface DiscoveredConsole {
  ip: string;
  port: number;
  status: string;
  is_daemon: boolean;
}

interface ConsoleManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  visualEffects?: boolean;
  t: (key: string, options?: any) => string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'scanning' | 'error';
type SortOption = 'NAME' | 'SIZE_DESC' | 'SIZE_ASC' | 'PATH';

export function ConsoleManagerModal({
  isOpen,
  onClose,
  visualEffects = true,
  t,
}: ConsoleManagerModalProps) {
  // Connection states
  const [ip, setIp] = useState<string>(() => {
    return localStorage.getItem('machete_ps5_ip') || '192.168.1.100';
  });
  const [payloadPort, setPayloadPort] = useState<number>(() => {
    const saved = localStorage.getItem('machete_ps5_payload_port');
    return saved ? parseInt(saved, 10) : 9021;
  });
  const [daemonPort, setDaemonPort] = useState<number>(() => {
    const saved = localStorage.getItem('machete_ps5_daemon_port');
    if (!saved || saved === '9035' || saved === '9039') {
      localStorage.setItem('machete_ps5_daemon_port', '9038');
      return 9038;
    }
    return parseInt(saved, 10);
  });

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Operation flags
  const [isSendingPayload, setIsSendingPayload] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // Games and metadata state
  const [games, setGames] = useState<FileItem[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  
  // Filtering & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('NAME');
  const [selectedStorageFilter, setSelectedStorageFilter] = useState<string>('ALL');

  // Deletion modal state
  const [gameToDelete, setGameToDelete] = useState<FileItem | null>(null);

  // Inspector modal state
  const [inspectingGame, setInspectingGame] = useState<FileItem | null>(null);

  // Handle IP persistence
  const handleIpChange = (newIp: string) => {
    setIp(newIp);
    localStorage.setItem('machete_ps5_ip', newIp);
  };

  const handlePayloadPortChange = (val: number) => {
    setPayloadPort(val);
    localStorage.setItem('machete_ps5_payload_port', String(val));
  };

  const handleDaemonPortChange = (val: number) => {
    setDaemonPort(val);
    localStorage.setItem('machete_ps5_daemon_port', String(val));
  };

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameToDelete) {
          setGameToDelete(null);
        } else if (inspectingGame) {
          setInspectingGame(null);
        } else {
          playCancelSound();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, gameToDelete, inspectingGame, onClose]);

  // Enrich game metadata via fetch_metadata_rs
  const enrichMetadata = useCallback(async (items: FileItem[]) => {
    // 1. First assign local icons/titles
    const initialMeta: Record<string, any> = {};
    items.forEach(item => {
      if (item.ppsa) {
        initialMeta[item.ppsa] = {
          title: item.local_title || item.name,
          cover: item.local_icon,
        };
      }
    });
    setMetadata(prev => ({ ...initialMeta, ...prev }));

    // 2. Query Machete's metadata engine
    const uniquePpsas = Array.from(new Set(items.map(i => i.ppsa).filter(Boolean))) as string[];
    for (const ppsa of uniquePpsas) {
      try {
        const meta = await invoke<any>('fetch_metadata_rs', { ppsa });
        if (meta) {
          setMetadata(prev => ({
            ...prev,
            [ppsa]: {
              ...meta,
              cover: meta.cover || prev[ppsa]?.cover || initialMeta[ppsa]?.cover,
            }
          }));
        }
      } catch (err) {
        console.warn(`[CONSOLE] Metadata query for ${ppsa} skipped:`, err);
      }
    }
  }, []);

  // Discover PS5 Consoles on Local Network
  const handleDiscoverConsoles = async () => {
    playSelectSound();
    setIsDiscovering(true);
    setNotification(null);
    setStatusMessage(t('scanning_network'));

    try {
      const results = await invoke<DiscoveredConsole[]>('discover_ps5_consoles');
      if (results && results.length > 0) {
        const found = results[0];
        setIp(found.ip);
        localStorage.setItem('machete_ps5_ip', found.ip);

        if (found.is_daemon || found.port === 9038 || found.port === 9039) {
          if (found.port && found.port !== daemonPort) {
            setDaemonPort(found.port);
            localStorage.setItem('machete_ps5_daemon_port', String(found.port));
          }
        } else if (found.port === 9021 || found.port === 9020) {
          if (found.port && found.port !== payloadPort) {
            setPayloadPort(found.port);
            localStorage.setItem('machete_ps5_payload_port', String(found.port));
          }
        }

        setNotification({
          type: 'success',
          text: t('ps5_detected', { ip: found.ip, status: found.status }),
        });
        playSuccessSound();
      } else {
        setNotification({
          type: 'info',
          text: t('ps5_not_found'),
        });
      }
    } catch (err: any) {
      playCancelSound();
      const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
      setNotification({
        type: 'error',
        text: errStr,
      });
    } finally {
      setIsDiscovering(false);
      setStatusMessage(null);
    }
  };

  // Send Payload Handler
  const handleSendPayload = async () => {
    playSelectSound();
    setIsSendingPayload(true);
    setStatus('connecting');
    setNotification(null);
    setStatusMessage(t('console_sending_payload'));

    try {
      await invoke('send_console_payload', { 
        ip: ip.trim(), 
        port: Number(payloadPort) || 9021 
      });
      playSuccessSound();
      setStatus('connected');
      setStatusMessage(null);
      setNotification({
        type: 'success',
        text: t('console_payload_success')
      });
    } catch (err: any) {
      playCancelSound();
      setStatus('error');
      const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
      setStatusMessage(null);
      setNotification({
        type: 'error',
        text: t('console_payload_error', { error: errStr })
      });
    } finally {
      setIsSendingPayload(false);
    }
  };

  // Scan Console Games Handler with Auto-Payload Fallback
  const handleScanConsole = async () => {
    playSelectSound();
    setIsScanning(true);
    setStatus('scanning');
    setNotification(null);
    setStatusMessage(t('console_status_scanning'));

    const consoleIp = ip.trim();
    const dPort = Number(daemonPort) || 9038;
    const pPort = Number(payloadPort) || 9021;

    try {
      // 1. Check if daemon is responding
      let isDaemonAlive = false;
      try {
        isDaemonAlive = await invoke<boolean>('check_console_status', { ip: consoleIp, port: dPort });
      } catch {
        isDaemonAlive = false;
      }

      // 2. If daemon is not running, attempt auto-injection via payload port (9021)
      if (!isDaemonAlive) {
        setStatusMessage(t('console_sending_payload'));
        try {
          await invoke('send_console_payload', { ip: consoleIp, port: pPort });
          // Wait 1.5s for daemon to bind and initialize
          await new Promise(res => setTimeout(res, 1500));
        } catch (payloadErr: any) {
          const payloadErrStr = typeof payloadErr === 'string' ? payloadErr : (payloadErr?.message || JSON.stringify(payloadErr));
          throw new Error(`Demonio no responde en puerto ${dPort} y no se pudo enviar el payload al puerto ${pPort}: ${payloadErrStr}`);
        }
      }

      // 3. Scan games from daemon
      setStatusMessage(t('console_status_scanning'));
      const items = await invoke<any[]>('scan_console_games', { 
        ip: consoleIp, 
        port: dPort 
      });

      // Normalize items with storage_label and fields
      const processedItems: FileItem[] = (items || []).map(normalizeConsoleGame);

      setGames(processedItems);
      setStatus('connected');
      setStatusMessage(null);
      playScanSound();

      if (processedItems.length === 0) {
        setNotification({
          type: 'info',
          text: t('console_empty_desc')
        });
      } else {
        enrichMetadata(processedItems);
      }
    } catch (err: any) {
      playCancelSound();
      setStatus('error');
      const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
      setStatusMessage(null);
      setNotification({
        type: 'error',
        text: errStr
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Remote Delete Execution
  const handleConfirmDelete = async () => {
    if (!gameToDelete) return;
    setIsDeleting(true);

    try {
      await invoke('delete_console_game', {
        ip: ip.trim(),
        port: Number(daemonPort) || 9038,
        game_path: gameToDelete.path,
        path: gameToDelete.path,
      });

      playMacheteSound();
      setGames(prev => prev.filter(g => g.path !== gameToDelete.path));
      setNotification({
        type: 'success',
        text: t('console_delete_success')
      });
      setGameToDelete(null);
    } catch (err: any) {
      playCancelSound();
      const errStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
      setNotification({
        type: 'error',
        text: t('console_delete_error', { error: errStr })
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Storage Location Badges extracted from games
  const storageLocations = useMemo(() => {
    const set = new Set<string>();
    games.forEach(g => {
      if (g.storage_label) {
        const match = g.storage_label.match(/^\[(.*?)\]/);
        if (match && match[1]) {
          set.add(match[1]);
        }
      }
    });
    return Array.from(set);
  }, [games]);

  // Filtered & Sorted Games in a Single Flat Grid
  const filteredGames = useMemo(() => {
    return games
      .filter(game => {
        const meta = game.ppsa ? metadata[game.ppsa] : null;
        const title = (meta?.title || game.name).toLowerCase();
        const ppsa = (game.ppsa || '').toLowerCase();
        const storage = (game.storage_label || '').toLowerCase();
        const path = (game.path || '').toLowerCase();
        const query = searchTerm.toLowerCase().trim();

        // 1. Text Search Filter
        if (query) {
          const match = title.includes(query) || ppsa.includes(query) || storage.includes(query) || path.includes(query);
          if (!match) return false;
        }

        // 2. Storage Location Filter
        if (selectedStorageFilter !== 'ALL') {
          if (!game.storage_label?.includes(`[${selectedStorageFilter}]`)) {
            return false;
          }
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
        if (sortBy === 'PATH') {
          const pathA = a.storage_label || a.path || '';
          const pathB = b.storage_label || b.path || '';
          return pathA.localeCompare(pathB);
        }
        const metaA = a.ppsa ? metadata[a.ppsa]?.title : a.name;
        const metaB = b.ppsa ? metadata[b.ppsa]?.title : b.name;
        const titleA = metaA || a.name || '';
        const titleB = metaB || b.name || '';
        return titleA.localeCompare(titleB);
      });
  }, [games, metadata, searchTerm, selectedStorageFilter, sortBy]);

  const totalBytes = useMemo(() => {
    return games.reduce((acc, g) => acc + (g.size_bytes || 0), 0);
  }, [games]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="glass-panel w-full max-w-7xl h-[92vh] max-h-[96vh] rounded-2xl border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.25)] flex flex-col bg-slate-950/95 overflow-hidden relative"
        >
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60 backdrop-blur-lg flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Gamepad2 className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-wide">
                    {t('console_manager_title')}
                  </h2>
                  {/* Status Indicator Badge */}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border shadow-sm ${
                      status === 'connected'
                        ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
                        : status === 'scanning' || status === 'connecting'
                        ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300 animate-pulse'
                        : status === 'error'
                        ? 'bg-red-950/70 border-red-500/50 text-red-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status === 'connected'
                          ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                          : status === 'scanning' || status === 'connecting'
                          ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'
                          : status === 'error'
                          ? 'bg-red-400 shadow-[0_0_8px_#f87171]'
                          : 'bg-slate-500'
                      }`}
                    />
                    {statusMessage || (
                      status === 'connected'
                        ? t('console_status_connected')
                        : status === 'scanning'
                        ? t('console_status_scanning')
                        : status === 'connecting'
                        ? t('console_sending_payload')
                        : t('console_status_disconnected')
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {t('console_manager_subtitle')}
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                playCancelSound();
                onClose();
              }}
              className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-500 text-slate-400 hover:text-white flex items-center justify-center transition-all"
              title="Cerrar (ESC)"
              onMouseEnter={playHoverSound}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* PS5 Remote Connection Bar */}
          <div className="px-6 py-3 bg-slate-900/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              {/* PS5 IP Input */}
              <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 focus-within:border-cyan-500/60 transition-colors">
                <Wifi className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                  {t('console_ip_label')}:
                </span>
                <input
                  type="text"
                  value={ip}
                  onChange={e => handleIpChange(e.target.value)}
                  placeholder="192.168.1.100"
                  className="bg-transparent border-none text-xs text-white font-mono focus:outline-none w-32 sm:w-36 tracking-wider"
                />
              </div>

              {/* Discover / Scan Network Button */}
              <button
                type="button"
                onClick={handleDiscoverConsoles}
                disabled={isDiscovering || isSendingPayload || isScanning}
                title={t('scan_network_tooltip')}
                onMouseEnter={playHoverSound}
                className="px-3 py-1.5 bg-slate-950/80 hover:bg-cyan-950/50 disabled:opacity-50 text-cyan-400 hover:text-cyan-300 font-mono text-xs font-bold rounded-xl border border-cyan-500/30 hover:border-cyan-400/80 flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              >
                <Radar className={`w-3.5 h-3.5 text-cyan-400 ${isDiscovering ? 'animate-spin' : ''}`} />
                <span>{isDiscovering ? t('scanning_network') : t('scan_network_btn')}</span>
              </button>

              {/* Payload Port Input */}
              <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 focus-within:border-cyan-500/60 transition-colors">
                <span className="text-[11px] text-slate-500 font-mono">Payload:</span>
                <input
                  type="number"
                  value={payloadPort}
                  onChange={e => handlePayloadPortChange(parseInt(e.target.value, 10) || 9021)}
                  className="bg-transparent border-none text-xs text-cyan-300 font-mono focus:outline-none w-14"
                  title={t('console_payload_port')}
                />
              </div>

              {/* Daemon Port Input */}
              <div className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1.5 rounded-xl border border-slate-800 focus-within:border-cyan-500/60 transition-colors">
                <span className="text-[11px] text-slate-500 font-mono">Daemon:</span>
                <input
                  type="number"
                  value={daemonPort}
                  onChange={e => handleDaemonPortChange(parseInt(e.target.value, 10) || 9038)}
                  className="bg-transparent border-none text-xs text-cyan-300 font-mono focus:outline-none w-14"
                  title={t('console_daemon_port')}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSendPayload}
                disabled={isSendingPayload || isScanning || isDiscovering}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-cyan-300 font-mono text-xs font-bold rounded-xl border border-cyan-500/30 hover:border-cyan-400 flex items-center gap-2 transition-all shadow-sm"
                onMouseEnter={playHoverSound}
              >
                <Send className={`w-3.5 h-3.5 ${isSendingPayload ? 'animate-pulse' : ''}`} />
                <span>{isSendingPayload ? t('console_sending_payload') : t('console_send_payload')}</span>
              </button>

              <button
                onClick={handleScanConsole}
                disabled={isScanning || isSendingPayload || isDiscovering}
                className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-black font-mono text-xs font-bold rounded-xl border border-cyan-400 flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-102"
                onMouseEnter={playHoverSound}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? t('console_scanning_games') : t('console_scan_games')}</span>
              </button>
            </div>
          </div>

          {/* Feedback & Notification Alerts */}
          {notification && (
            <div
              className={`px-6 py-2.5 text-xs font-mono flex items-center justify-between border-b transition-all flex-shrink-0 ${
                notification.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
                  : notification.type === 'error'
                  ? 'bg-red-950/80 border-red-500/40 text-red-200'
                  : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {notification.type === 'error' && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                {notification.type === 'info' && <Info className="w-4 h-4 text-cyan-400 shrink-0" />}
                <span>{notification.text}</span>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-white/60 hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Search, Filter & Stats Toolbar */}
          <div className="px-6 py-3 bg-slate-900/20 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
            {/* Search Input */}
            <div className="flex items-center gap-2 bg-slate-950/90 px-3 py-1.5 rounded-xl border border-slate-800 focus-within:border-cyan-500/60 w-full sm:w-80">
              <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={t('console_search_placeholder')}
                className="bg-transparent border-none text-xs text-white placeholder-slate-500 font-mono focus:outline-none w-full"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-slate-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Storage Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedStorageFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                  selectedStorageFilter === 'ALL'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                TODOS ({games.length})
              </button>
              {storageLocations.map(loc => {
                const count = games.filter(g => g.storage_label?.includes(`[${loc}]`)).length;
                return (
                  <button
                    key={loc}
                    onClick={() => setSelectedStorageFilter(loc)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all border ${
                      selectedStorageFilter === loc
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    [{loc}] ({count})
                  </button>
                );
              })}
            </div>

            {/* Sorting & Stats Summary */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setSortBy('NAME')}
                  className={`p-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition-all ${
                    sortBy === 'NAME' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                  }`}
                  title={t('console_sort_name')}
                >
                  <ArrowDownAZ className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSortBy(sortBy === 'SIZE_DESC' ? 'SIZE_ASC' : 'SIZE_DESC')}
                  className={`p-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition-all ${
                    sortBy.startsWith('SIZE') ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                  }`}
                  title={t('console_sort_size')}
                >
                  <ArrowDown01 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSortBy('PATH')}
                  className={`p-1.5 rounded-lg text-xs font-mono flex items-center gap-1 transition-all ${
                    sortBy === 'PATH' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white'
                  }`}
                  title={t('console_sort_path')}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="text-[11px] text-slate-400 font-mono bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 hidden md:inline">
                {filteredGames.length} / {games.length} TITLES • {formatBytes(totalBytes)}
              </span>
            </div>
          </div>

          {/* Flat Grid Area (All Games Rendered Together Without Folder Grouping) */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
            {filteredGames.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-center mb-4">
                  <Gamepad2 className="w-8 h-8 text-cyan-400/50" />
                </div>
                <h3 className="text-sm font-bold text-slate-200 font-mono mb-2">
                  {games.length === 0 ? t('console_empty_title') : 'No hay juegos que coincidan con la búsqueda'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md font-mono leading-relaxed">
                  {games.length === 0 ? t('console_empty_desc') : 'Prueba cambiando los términos de búsqueda o el filtro de almacenamiento.'}
                </p>
                {games.length === 0 && (
                  <div className="mt-5 flex gap-3">
                    <button
                      onClick={handleSendPayload}
                      disabled={isSendingPayload || isScanning}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-bold rounded-xl border border-cyan-500/40 flex items-center gap-2"
                      onMouseEnter={playHoverSound}
                    >
                      <Send className="w-4 h-4" />
                      <span>{t('console_send_payload')}</span>
                    </button>
                    <button
                      onClick={handleScanConsole}
                      disabled={isScanning || isSendingPayload}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-mono text-xs font-bold rounded-xl border border-cyan-400 flex items-center gap-2"
                      onMouseEnter={playHoverSound}
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>{t('console_scan_games')}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredGames.map(game => {
                  const meta = game.ppsa ? metadata[game.ppsa] : null;
                  return (
                    <GameCard
                      key={game.path}
                      file={game}
                      meta={meta}
                      t={t}
                      visualEffects={visualEffects}
                      onOpenDetails={() => {
                        playPS5GameSelectSound();
                        setInspectingGame(game);
                      }}
                      onDelete={() => {
                        playCancelSound();
                        setGameToDelete(game);
                      }}
                      onRename={(ppsa, newTitle) => {
                        setMetadata(prev => ({
                          ...prev,
                          [ppsa]: { ...prev[ppsa], title: newTitle }
                        }));
                      }}
                      onChangeCover={async (ppsa) => {
                        try {
                          const selected = await open({
                            multiple: false,
                            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
                          });
                          if (selected && typeof selected === 'string') {
                            const base64Cover = await invoke<string>('save_custom_cover', { ppsa, imagePath: selected });
                            setMetadata(prev => ({
                              ...prev,
                              [ppsa]: { ...prev[ppsa], cover: base64Cover }
                            }));
                            playSuccessSound();
                          }
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct Remote Deletion Confirmation Modal */}
          {gameToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="bg-slate-900 border-2 border-red-500/50 p-6 rounded-2xl max-w-md w-full shadow-2xl shadow-red-950/40 relative overflow-hidden"
              >
                {/* Red warning glow */}
                <div className="absolute -top-16 -right-16 w-32 h-32 bg-red-500/20 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-500/40 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white font-mono">
                      {t('console_delete_confirm_title')}
                    </h3>
                    <p className="text-[11px] text-red-400/90 font-mono">
                      PlayStation 5 ({ip})
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 mb-4">
                  <div className="font-bold text-xs text-white truncate mb-1">
                    {metadata[gameToDelete.ppsa || '']?.title || gameToDelete.name}
                  </div>
                  {gameToDelete.storage_label && (
                    <div className="text-[10px] text-cyan-300 font-mono mb-1 truncate">
                      {gameToDelete.storage_label}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 font-mono break-all bg-black/40 p-1.5 rounded border border-slate-800/80">
                    {gameToDelete.path}
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-mono mb-4 leading-relaxed">
                  {t('console_delete_confirm_msg', { path: gameToDelete.path })}
                </p>

                <p className="text-[11px] text-amber-400/90 font-mono mb-5 flex items-center gap-1.5 bg-amber-950/30 p-2 rounded-lg border border-amber-500/30">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('console_delete_warning')}</span>
                </p>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      playCancelSound();
                      setGameToDelete(null);
                    }}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold rounded-xl border border-slate-700 transition-colors"
                  >
                    {t('batch_cancel_btn') || 'Cancelar'}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-xl border border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] flex items-center gap-2 transition-all hover:scale-102"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isDeleting ? t('console_deleting') : t('machetear')}</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Game Details Inspector Modal */}
          {inspectingGame && (
            <GameDetailsModal
              game={inspectingGame}
              meta={inspectingGame.ppsa ? metadata[inspectingGame.ppsa] : null}
              onClose={() => setInspectingGame(null)}
              onRename={(ppsa, title) => {
                setMetadata(prev => ({
                  ...prev,
                  [ppsa]: { ...prev[ppsa], title }
                }));
              }}
              onChangeCover={async (targetPpsa) => {
                try {
                  const selected = await open({
                    multiple: false,
                    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
                  });
                  if (selected && typeof selected === 'string') {
                    const base64Cover = await invoke<string>('save_custom_cover', { ppsa: targetPpsa, imagePath: selected });
                    setMetadata(prev => ({
                      ...prev,
                      [targetPpsa]: { ...prev[targetPpsa], cover: base64Cover }
                    }));
                    playSuccessSound();
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              onDelete={() => {
                setGameToDelete(inspectingGame);
                setInspectingGame(null);
              }}
              t={t}
            />
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
