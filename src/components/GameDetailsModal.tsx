import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, ExternalLink, Copy, Check, HardDrive, Cpu, ShieldCheck, Tag, FileCode, Trash2, Edit3, Image as ImageIcon, Volume2, VolumeX } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { playSelectSound, playCancelSound, playHoverSound, playPS5GameSelectSound, playBgmTheme, stopBgmTheme } from '../utils/audio';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface GameDetailsModalProps {
  game: any;
  meta: any;
  onClose: () => void;
  onRename: (ppsa: string, currentTitle: string) => void;
  onChangeCover: (ppsa: string) => void;
  onDelete: (path: string) => void;
  t: (key: string, options?: any) => string;
}

export function GameDetailsModal({ game, meta, onClose, onRename, onChangeCover, onDelete, t }: GameDetailsModalProps) {
  const [copied, setCopied] = useState(false);
  
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [computedSize, setComputedSize] = useState<number | null>(game?.size_bytes || null);

  useEffect(() => {
    if (game?.size_bytes && game.size_bytes > 0) {
      setComputedSize(game.size_bytes);
    } else if (game?.is_dir && game?.path) {
      invoke<number>('get_folder_size', { path: game.path })
        .then((sz) => {
          if (sz > 0) setComputedSize(sz);
        })
        .catch(console.error);
    }
  }, [game?.path, game?.size_bytes, game?.is_dir]);

  useEffect(() => {
    let active = true;

    // Trigger native soundtrack playback immediately
    if (game?.path) {
      playBgmTheme(game.path).then((success) => {
        if (!active) return;
        if (success) {
          setHasAudio(true);
          setIsPlayingAudio(true);
        } else {
          // Play atmospheric PS5 game focus chime
          playPS5GameSelectSound();
        }
      }).catch((err) => {
        console.warn("Failed to play game audio:", err);
        if (active) playPS5GameSelectSound();
      });
    }

    return () => {
      active = false;
      stopBgmTheme();
    };
  }, [game?.path]);

  const toggleSoundtrack = () => {
    if (isPlayingAudio) {
      stopBgmTheme();
      setIsPlayingAudio(false);
    } else if (game?.path) {
      playBgmTheme(game.path).then(success => {
        if (success) setIsPlayingAudio(true);
      });
    }
  };

  if (!game) return null;

  const handleCopyTitleId = () => {
    if (game.ppsa) {
      navigator.clipboard.writeText(game.ppsa);
      setCopied(true);
      playSelectSound();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenFolder = async () => {
    playSelectSound();
    try {
      await invoke('open_in_file_manager', { path: game.path });
    } catch (e) {
      console.error("Failed to open file manager:", e);
    }
  };

  const handleOpenProspero = () => {
    playSelectSound();
    if (game.ppsa) {
      window.open(`https://prosperopatches.com/${game.ppsa}`, '_blank');
    }
  };

  const displayTitle = meta?.title || game.local_title || game.name;
  const coverUrl = meta?.cover;

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
          {/* Modal Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#06b6d4]"></div>
              <h2 className="text-sm font-mono font-bold tracking-wider text-cyan-300 uppercase">
                {t("app_name")} // {game.ppsa || t("no_ppsa")}
              </h2>
            </div>
            <button
              onClick={() => { playCancelSound(); onClose(); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 border border-transparent hover:border-red-500/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 custom-scrollbar">
            {/* Left: 4K Box Art Preview */}
            <div className="md:col-span-5 flex flex-col items-center">
              <div className="w-full max-w-[280px] aspect-[3/4] rounded-xl overflow-hidden border border-cyan-500/40 shadow-2xl bg-slate-900 flex items-center justify-center relative group">
                {coverUrl ? (
                  <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-12 h-12 text-slate-600" />
                )}
              </div>

              {/* Quick Image Action Buttons */}
              <div className="flex gap-2 mt-4 w-full max-w-[280px]">
                {game.ppsa && (
                  <button
                    onClick={() => { playSelectSound(); onChangeCover(game.ppsa); }}
                    className="flex-1 py-2 px-3 rounded-lg border border-yellow-500/40 bg-yellow-950/30 text-yellow-300 hover:bg-yellow-500/20 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
                    onMouseEnter={playHoverSound}
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> {t("change_cover")}
                  </button>
                )}
                {game.ppsa && (
                  <button
                    onClick={() => { playSelectSound(); onRename(game.ppsa, displayTitle); }}
                    className="flex-1 py-2 px-3 rounded-lg border border-cyan-500/40 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-500/20 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
                    onMouseEnter={playHoverSound}
                  >
                    <Edit3 className="w-3.5 h-3.5" /> {t("edit_title")}
                  </button>
                )}
              </div>
            </div>

            {/* Right: Technical Metadata & Diagnostics */}
            <div className="md:col-span-7 flex flex-col gap-4">
              {/* Title & Region */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {meta?.region_flag && (
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-400 border border-cyan-500/40 flex-shrink-0">
                      {meta.region_flag}
                    </span>
                  )}
                  <h1 className="text-xl font-black text-white tracking-wide font-sans line-clamp-2">
                    {displayTitle}
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="font-mono text-xs px-2.5 py-1 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold">
                    {game.ppsa || t("no_ppsa")}
                  </span>
                  {game.ppsa && (
                    <button
                      onClick={handleCopyTitleId}
                      className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-[11px] font-mono text-slate-300 flex items-center gap-1 transition-colors"
                      title={t("copy_ppsa")}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? t("copied_to_clipboard") : t("copy_ppsa")}
                    </button>
                  )}
                  {(game.min_firmware || game.sdk_ver) && (
                    <span className="font-mono text-xs px-2.5 py-1 rounded bg-purple-950/80 border border-purple-500/40 text-purple-300 font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> FW {game.min_firmware || game.sdk_ver}+
                    </span>
                  )}
                  {hasAudio && (
                    <button
                      onClick={toggleSoundtrack}
                      className={`px-2.5 py-1 rounded border text-[11px] font-mono font-bold flex items-center gap-1.5 transition-all ${
                        isPlayingAudio 
                          ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)]' 
                          : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                      title="Audio Preview (snd0.at9)"
                    >
                      {isPlayingAudio ? <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                      <span>{isPlayingAudio ? 'BGM: ON' : 'BGM: OFF'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Technical Specifications Grid */}
              <div className="grid grid-cols-2 gap-2.5 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                {/* Size */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">{t("spec_size")}</div>
                    <div className="text-xs font-mono font-bold text-white">
                      {computedSize || game.size_bytes ? formatBytes(computedSize || game.size_bytes!) : t("calculating")}
                    </div>
                  </div>
                </div>

                {/* App Version */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-950/50 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">{t("spec_app_ver")}</div>
                    <div className="text-xs font-mono font-bold text-white">
                      {game.app_ver || '1.00'}
                    </div>
                  </div>
                </div>

                {/* SDK Version */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">{t("spec_sdk")}</div>
                    <div className="text-xs font-mono font-bold text-white">
                      {game.sdk_ver ? `SDK ${game.sdk_ver}` : (game.min_firmware ? `SDK ${game.min_firmware}` : 'SDK 9.00')}
                    </div>
                  </div>
                </div>

                {/* Format / Type */}
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-950/50 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">{t("spec_format")}</div>
                    <div className="text-xs font-mono font-bold text-white uppercase">
                      {game.is_dir ? t("format_folder") : game.name.split('.').pop() || t("format_container")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content ID & File Path */}
              <div className="flex flex-col gap-2 bg-slate-900/40 p-3 rounded-xl border border-slate-800/80 font-mono text-xs">
                {game.content_id && (
                  <div>
                    <span className="text-slate-400 text-[10px] block mb-0.5">{t("spec_content_id")}:</span>
                    <span className="text-cyan-300 text-[11px] select-all break-all">{game.content_id}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 text-[10px] block mb-0.5">{t("spec_path")}:</span>
                  <span className="text-slate-300 text-[11px] select-all break-all">{game.path}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2.5 mt-auto pt-2">
                <button
                  onClick={handleOpenFolder}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-cyan-500/50 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                  onMouseEnter={playHoverSound}
                >
                  <FolderOpen className="w-4 h-4" /> {t("open_in_folder")}
                </button>

                {game.ppsa && (
                  <button
                    onClick={handleOpenProspero}
                    className="py-2.5 px-4 rounded-xl border border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
                    onMouseEnter={playHoverSound}
                  >
                    <ExternalLink className="w-4 h-4" /> {t("open_prospero")}
                  </button>
                )}

                <button
                  onClick={() => { playCancelSound(); onDelete(game.path); onClose(); }}
                  className="py-2.5 px-4 rounded-xl border border-red-500/40 bg-red-950/30 hover:bg-red-500/20 text-red-400 text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all"
                  onMouseEnter={playHoverSound}
                >
                  <Trash2 className="w-4 h-4" /> {t("machetear")}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
