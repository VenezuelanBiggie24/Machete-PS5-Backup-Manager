import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es_ve from './locales/es_ve.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import it from './locales/it.json';
import pt_br from './locales/pt_br.json';
import pt_pt from './locales/pt_pt.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import ko from './locales/ko.json';
import ar from './locales/ar.json';

const resources = {
  en: { translation: en },
  es: { translation: es_ve },
  es_ve: { translation: es_ve },
  fr: { translation: fr },
  de: { translation: de },
  it: { translation: it },
  pt_br: { translation: pt_br },
  pt_pt: { translation: pt_pt },
  ru: { translation: ru },
  ja: { translation: ja },
  zh: { translation: zh },
  ko: { translation: ko },
  ar: { translation: ar },
};

const rawSaved = typeof window !== 'undefined' ? localStorage.getItem('machete_lang') || 'en' : 'en';
const savedLanguage = rawSaved === 'es' ? 'es_ve' : rawSaved;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
