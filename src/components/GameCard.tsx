import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Trash2, Edit2, Image as ImageIcon } from 'lucide-react';
import { playHoverSound } from '../utils/audio';

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function GameCard({ file, meta, t, onDelete, onRename, onChangeCover }: any) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const rotateX = useTransform(y, [-100, 100], [15, -15]);
  const rotateY = useTransform(x, [-100, 100], [-15, 15]);
  
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set(event.clientX - rect.left - rect.width / 2);
    y.set(event.clientY - rect.top - rect.height / 2);
  };
  
  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div 
      layout
      style={{ perspective: 1000 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      key={file.path} 
      className="relative group"
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={playHoverSound}
        className="glass-panel rounded-xl overflow-hidden flex flex-col group border border-slate-700 hover:border-cyan-500/80 transition-colors shadow-xl h-full"
      >
        <div className="aspect-[3/4] bg-slate-900 relative">
          {meta?.cover ? (
            <img src={meta.cover} alt="cover" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4 text-center">
              <span className="text-slate-500 font-mono text-xs">{file.name}</span>
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none mix-blend-overlay"></div>
          
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-[2px]">
            {file.ppsa && (
              <button 
                onClick={(e) => { e.stopPropagation(); onChangeCover(file.ppsa!); }}
                className="glass-panel px-4 py-2 text-xs font-bold text-yellow-400 hover:bg-yellow-400/20 rounded border border-yellow-500/50 flex items-center gap-2 transition-all hover:scale-105"
                onMouseEnter={playHoverSound}
              >
                <ImageIcon className="w-4 h-4" /> CHANGE COVER
              </button>
            )}
            {file.ppsa && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRename(file.ppsa!, meta?.title || file.name); }}
                className="glass-panel px-4 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 rounded border border-cyan-500/50 flex items-center gap-2 transition-all hover:scale-105"
                onMouseEnter={playHoverSound}
              >
                <Edit2 className="w-4 h-4" /> RENAME TITLE
              </button>
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-2 flex justify-end z-10 bg-gradient-to-t from-black/80 to-transparent">
            {file.ppsa && (
              <span className="bg-cyan-900/80 text-cyan-300 text-[10px] font-mono px-2 py-1 rounded border border-cyan-500/30 backdrop-blur-sm">
                {file.ppsa}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between relative bg-slate-900/60">
          <div>
            <h3 className="text-sm font-bold text-slate-200 line-clamp-1 mb-1" title={meta?.title || file.name}>
              {meta?.region_flag && <span className="mr-1">{meta.region_flag}</span>}
              {meta?.title || file.name}
            </h3>
            <p className="text-xs font-mono text-slate-500">
              {file.size_bytes ? formatBytes(file.size_bytes, 1) : "0 GB"}
            </p>
          </div>
          <div className="mt-4 flex justify-between items-center border-t border-slate-700/50 pt-3">
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(file.path); }}
              className="text-slate-500 hover:text-red-400 transition-colors glitch-hover flex items-center justify-center w-8 h-8 rounded-full hover:bg-red-400/10"
              title={t("delete_btn")}
              onMouseEnter={playHoverSound}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Machetear</span>
              <span className="text-[9px] font-mono text-slate-600">(Delete)</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
