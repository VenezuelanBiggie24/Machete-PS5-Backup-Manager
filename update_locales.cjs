const fs = require('fs');
const path = require('path');

const aboutDescTranslations = {
  en: "Developed by VenezuelanBiggie24, a proud Venezuelan developer.",
  es_ve: "Desarrollado por VenezuelanBiggie24, un orgulloso desarrollador venezolano.",
  fr: "Développé par VenezuelanBiggie24, un fier développeur vénézuélien.",
  pt_br: "Desenvolvido por VenezuelanBiggie24, um orgulhoso desenvolvedor venezuelano.",
  pt_pt: "Desenvolvido por VenezuelanBiggie24, um orgulhoso desenvolvedor venezuelano.",
  de: "Entwickelt von VenezuelanBiggie24, einem stolzen venezolanischen Entwickler.",
  ru: "Разработано VenezuelanBiggie24, гордым венесуэльским разработчиком.",
  ar: "تم التطوير بواسطة VenezuelanBiggie24، مطور فنزويلي فخور.",
  zh: "由 VenezuelanBiggie24 开发，一位自豪的委内瑞拉开发者。",
  ja: "ベネズエラの誇り高き開発者、VenezuelanBiggie24によって開発されました。",
  ko: "자랑스러운 베네수엘라 개발자 VenezuelanBiggie24가 개발했습니다."
};

const appSubtitleTranslations = {
  en: "Universal PS5 Manager",
  es_ve: "Gestor Universal de PS5",
  fr: "Gestionnaire Universel PS5",
  pt_br: "Gerenciador Universal de PS5",
  pt_pt: "Gestor Universal de PS5",
  de: "Universeller PS5-Manager",
  ru: "Универсальный менеджер PS5",
  ar: "مدير PS5 العالمي",
  zh: "通用 PS5 管理器",
  ja: "ユニバーサルPS5マネージャー",
  ko: "유니버설 PS5 매니저"
};

const labels = {
  en: { author_label: "Author", version_label: "Version" },
  es_ve: { author_label: "Autor", version_label: "Versión" },
  fr: { author_label: "Auteur", version_label: "Version" },
  pt_br: { author_label: "Autor", version_label: "Versão" },
  pt_pt: { author_label: "Autor", version_label: "Versão" },
  de: { author_label: "Autor", version_label: "Version" },
  ru: { author_label: "Автор", version_label: "Версия" },
  ar: { author_label: "المؤلف", version_label: "الإصدار" },
  zh: { author_label: "作者", version_label: "版本" },
  ja: { author_label: "著者", version_label: "バージョン" },
  ko: { author_label: "저자", version_label: "버전" },
};

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    
    data.about_desc = aboutDescTranslations[lang] || aboutDescTranslations.en;
    data.app_subtitle = appSubtitleTranslations[lang] || appSubtitleTranslations.en;
    data.author_label = labels[lang]?.author_label || labels.en.author_label;
    data.version_label = labels[lang]?.version_label || labels.en.version_label;
    
    fs.writeFileSync(path.join(localesDir, file), JSON.stringify(data, null, 2));
  }
});
