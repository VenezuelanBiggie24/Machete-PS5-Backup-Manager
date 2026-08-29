import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es_ve from './locales/es_ve.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import pt_br from './locales/pt_br.json';
import pt_pt from './locales/pt_pt.json';
import de from './locales/de.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('machete_lang') || 'en' : 'en';

const resources = {
  en: { translation: en },
  es_ve: { translation: es_ve },
  es: { translation: es },
  fr: { translation: fr },
  it: { translation: it },
  pt_br: { translation: pt_br },
  pt_pt: { translation: pt_pt },
  de: { translation: de },
  ru: { translation: ru },
  ar: { translation: ar },
  zh: { translation: zh },
  ja: { translation: ja },
  ko: { translation: ko }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
