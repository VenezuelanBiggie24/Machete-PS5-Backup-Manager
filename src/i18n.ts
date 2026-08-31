import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import es_ve from './locales/es_ve.json';

const resources = {
  es_ve: { translation: es_ve },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'es_ve',
    fallbackLng: 'es_ve',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
