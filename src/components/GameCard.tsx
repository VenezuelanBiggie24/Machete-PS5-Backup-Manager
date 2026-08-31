import React from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { Trash2, Edit2, Image as ImageIcon, Check, Info, ShieldCheck } from 'lucide-react';
import { playHoverSound, playSelectSound, playPS5GameSelectSound } from '../utils/audio';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

interface GameCardProps {
  file: any;
  meta: any;
  t: (key: string, options?: any) => string;
  isSelected?: boolean;
  visualEffects?: boolean;
  onToggleSelect?: (path: string) => void;
  onOpenDetails?: (file: any) => void;
  onDelete: (path: string) => void;
  onRename: (ppsa: string, currentTitle: string) => void;
  onChangeCover: (ppsa: string) => void;
}

export function GameCard({
  file,
  meta,
  t,
  isSelected = false,
  visualEffects = true,
  onToggleSelect,
  onOpenDetails,
  onDelete,
  onRename,
  onChangeCover,
}: GameCardProps) {
  // Smooth damped spring for realistic physical 3D tilt
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 350, damping: 25 });
  const y = useSpring(rawY, { stiffness: 350, damping: 25 });

  const rotateX = useTransform(y, [-100, 100], [10, -10]);
  const rotateY = useTransform(x, [-100, 100], [-10, 10]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!visualEffects) return;
    const rect = event.currentTarget.getBoundingClientRect();
    rawX.set(event.clientX - rect.left - rect.width / 2);
    rawY.set(event.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    if (!visualEffects) return;
    rawX.set(0);
    rawY.set(0);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      onToggleSelect?.(file.path);
    } else {
      onOpenDetails?.(file);
    }
  };

  const [imgError, setImgError] = React.useState(false);

  return (
    <motion.div
      layout={visualEffects}
      style={{ perspective: visualEffects ? 1200 : undefined }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        scale: visualEffects ? (isSelected ? 1.025 : 1) : 1,
        y: visualEffects ? (isSelected ? -10 : 0) : 0,
        zIndex: isSelected ? 20 : 1
      }}
      whileHover={visualEffects ? { 
        y: isSelected ? -16 : -12,
        scale: isSelected ? 1.04 : 1.035,
        zIndex: 35,
        transition: { type: "spring", stiffness: 400, damping: 22 }
      } : undefined}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      key={file.path}
      className="relative group select-none"
    >
      {/* Dynamic Floating Ground Shadow (Visible only with visualEffects) */}
      {visualEffects && (
        <div 
          className={`absolute -bottom-3 left-4 right-4 h-4 rounded-full transition-all duration-300 pointer-events-none ${
            isSelected 
              ? 'scale-110 opacity-90 bg-cyan-500/25 blur-lg' 
              : 'opacity-40 bg-black/80 blur-md group-hover:scale-115 group-hover:opacity-80 group-hover:bg-cyan-500/20 group-hover:blur-lg'
          }`}
        />
      )}

      <motion.div
        style={visualEffects ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={playHoverSound}
        onClick={handleCardClick}
        className={`glass-panel rounded-xl overflow-hidden flex flex-col group border transition-all duration-300 h-full relative cursor-pointer ${
          isSelected
            ? 'border-cyan-400 ring-2 ring-cyan-400/60 shadow-[0_15px_35px_rgba(6,182,212,0.45),0_0_20px_rgba(6,182,212,0.3)] bg-slate-900/90'
            : 'border-slate-800 hover:border-cyan-400/90 hover:shadow-[0_20px_40px_rgba(0,0,0,0.8),0_0_25px_rgba(6,182,212,0.3)] bg-slate-950/80'
        }`}
      >
        {/* Multi-Select Checkbox Indicator */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            playSelectSound();
            onToggleSelect?.(file.path);
          }}
          className={`absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-cyan-400 border-cyan-300 text-black shadow-[0_0_12px_#22d3ee]'
              : 'bg-black/60 border-white/30 text-transparent opacity-0 group-hover:opacity-100 hover:border-cyan-400 hover:bg-black/80'
          }`}
          title={isSelected ? t("deselect_all") : t("select_all")}
        >
          <Check className={`w-4 h-4 stroke-[3] ${isSelected ? 'text-black' : 'text-white/60'}`} />
        </div>

        {/* PS5 Retail Box Container */}
        <div className="aspect-[3/4] bg-slate-950 relative overflow-hidden flex flex-col rounded-t-xl">
          {/* Cover Artwork */}
          <div className="w-full h-full relative overflow-hidden flex items-center justify-center bg-slate-900">
            {meta?.cover && !imgError ? (
              <img
                src={meta.cover}
                alt="cover"
                loading="lazy"
                onError={() => setImgError(true)}
                className={`w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-500 ${visualEffects ? 'group-hover:scale-105' : ''}`}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center">
                <div className="w-10 h-10 rounded-xl border border-cyan-500/20 bg-cyan-950/30 flex items-center justify-center mb-2">
                  <ImageIcon className="w-5 h-5 text-cyan-400/40" />
                </div>
                <span className="text-slate-400 font-mono text-xs line-clamp-2">{file.name}</span>
              </div>
            )}

            {/* Acrylic Sheen Overlay */}
            {visualEffects && (
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none mix-blend-overlay"></div>
            )}
          </div>

          {/* Quick Hover Action Buttons Overlay */}
          <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-center gap-2.5 backdrop-blur-[2px] z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                playPS5GameSelectSound();
                onOpenDetails?.(file);
              }}
              className="glass-panel px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 rounded-lg border border-cyan-500/50 flex items-center gap-2 transition-all hover:scale-105 font-mono shadow-lg"
              onMouseEnter={playHoverSound}
            >
              <Info className="w-4 h-4" /> {t("view_details")}
            </button>
            {file.ppsa && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playSelectSound();
                  onChangeCover(file.ppsa!);
                }}
                className="glass-panel px-4 py-1.5 text-xs font-bold text-yellow-400 hover:bg-yellow-400/20 rounded-lg border border-yellow-500/50 flex items-center gap-2 transition-all hover:scale-105 font-mono"
                onMouseEnter={playHoverSound}
              >
                <ImageIcon className="w-3.5 h-3.5" /> {t("change_cover")}
              </button>
            )}
            {file.ppsa && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  playSelectSound();
                  onRename(file.ppsa!, meta?.title || file.name);
                }}
                className="glass-panel px-4 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700/40 rounded-lg border border-slate-600 flex items-center gap-2 transition-all hover:scale-105 font-mono"
                onMouseEnter={playHoverSound}
              >
                <Edit2 className="w-3.5 h-3.5" /> {t("edit_title")}
              </button>
            )}
          </div>

          {/* Badges in bottom overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-2 flex justify-between items-center z-10 bg-gradient-to-t from-black/85 to-transparent">
            {file.min_firmware ? (
              <span className="bg-purple-950/90 text-purple-300 text-[10px] font-mono px-1.5 py-0.5 rounded border border-purple-500/40 flex items-center gap-1 shadow-sm">
                <ShieldCheck className="w-3 h-3" /> FW {file.min_firmware}+
              </span>
            ) : <div />}
            {file.ppsa && (
              <span className="bg-cyan-950/90 text-cyan-300 text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/40 backdrop-blur-sm shadow-sm">
                {file.ppsa}
              </span>
            )}
          </div>
        </div>

        {/* Card Info Footer */}
        <div className="p-3 bg-slate-950/90 flex-1 flex flex-col justify-between border-t border-slate-800/80">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              {meta?.region_flag && (
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 flex-shrink-0">
                  {meta.region_flag}
                </span>
              )}
              <h3
                className="font-bold text-xs text-white truncate group-hover:text-cyan-300 transition-colors"
                title={meta?.title || file.name}
              >
                {meta?.title || file.name}
              </h3>
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono mt-1">
              <span>{file.size_bytes ? formatBytes(file.size_bytes) : t("calculating")}</span>
              <span>{file.is_dir ? t("format_folder") : t("format_container")}</span>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 font-mono">
              {file.app_ver ? `v${file.app_ver}` : 'PS5 Backup'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                playSelectSound();
                onDelete(file.path);
              }}
              className="text-slate-500 hover:text-red-400 transition-colors p-1"
              title={t('delete')}
              onMouseEnter={playHoverSound}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
