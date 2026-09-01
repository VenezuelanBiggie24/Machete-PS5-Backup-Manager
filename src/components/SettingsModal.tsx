import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Volume2, VolumeX, Globe, ArrowUpCircle, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { playCancelSound, playHoverSound, playSelectSound } from '../utils/audio';

const LANGUAGES = [
  { code: 'en', label: 'English (Default)' },
  { code: 'es_ve', label: 'Español (Venezuela)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt_br', label: 'Português (Brasil)' },
  { code: 'pt_pt', label: 'Português (Portugal)' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '简体中文' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visualEffects: boolean;
  onToggleVisualEffects: (val: boolean) => void;
  audioMuted: boolean;
  onToggleAudio: () => void;
  onCheckForUpdates: () => void;
  updateChecking: boolean;
  onOpenAbout: () => void;
  t: (key: string) => string;
}

export function SettingsModal({
  isOpen,
  onClose,
  visualEffects,
  onToggleVisualEffects,
  audioMuted,
  onToggleAudio,
  onCheckForUpdates,
  updateChecking,
  onOpenAbout,
  t,
}: SettingsModalProps) {
  const { i18n } = useTranslation();

  if (!isOpen) return null;

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('machete_lang', code);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          className="glass-panel w-full max-w-lg rounded-2xl border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden flex flex-col bg-slate-950/95"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-mono font-bold tracking-wider text-cyan-300 uppercase">
                {t("settings_title")}
              </h2>
            </div>
            <button
              onClick={() => { playCancelSound(); onClose(); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/20 border border-transparent hover:border-red-500/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Options */}
          <div className="p-6 flex flex-col gap-5">
            {/* 1. Visual Effects 3D Toggle */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white font-mono">
                    {t("settings_visual_effects")}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("settings_visual_effects_desc")}
                  </p>
                </div>
              </div>

              {/* Modern Switch */}
              <button
                type="button"
                onClick={() => {
                  playSelectSound();
                  onToggleVisualEffects(!visualEffects);
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  visualEffects ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    visualEffects ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 2. Audio Effects Toggle */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg border mt-0.5 ${
                  !audioMuted 
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}>
                  {!audioMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-white font-mono">
                    {t("settings_audio")}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("settings_audio_desc")}
                  </p>
                </div>
              </div>

              {/* Modern Switch */}
              <button
                type="button"
                onClick={() => {
                  onToggleAudio();
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  !audioMuted ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    !audioMuted ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 3. Language Selector */}
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mt-0.5">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white font-mono">
                    {t("settings_language")}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t("settings_language")}
                  </p>
                </div>
              </div>

              <select
                value={i18n.language || 'en'}
                onChange={(e) => {
                  playSelectSound();
                  handleLanguageChange(e.target.value);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-950 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold focus:outline-none focus:border-cyan-400 cursor-pointer shadow-sm max-w-[180px]"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code} className="bg-slate-900 text-white font-sans">
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Quick Actions in Settings */}
            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={() => {
                  playSelectSound();
                  onCheckForUpdates();
                }}
                disabled={updateChecking}
                className="w-full py-2.5 px-4 rounded-xl border border-cyan-500/50 bg-cyan-950/40 hover:bg-cyan-500/20 text-cyan-300 font-mono text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                onMouseEnter={playHoverSound}
              >
                {updateChecking ? (
                  <div className="w-4 h-4 border-2 border-slate-800 border-t-cyan-400 rounded-full animate-spin"></div>
                ) : (
                  <ArrowUpCircle className="w-4 h-4" />
                )}
                {updateChecking ? t("update_checking") : t("update_check_btn")}
              </button>

              <button
                onClick={() => {
                  playSelectSound();
                  onClose();
                  onOpenAbout();
                }}
                className="w-full py-2 px-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 font-mono text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                onMouseEnter={playHoverSound}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> {t("about")} & {t("changelog_title")}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
