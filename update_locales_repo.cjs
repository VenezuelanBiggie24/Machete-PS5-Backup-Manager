const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const translations = {
  en: "Official Repository",
  es: "Repositorio Oficial",
  es_ve: "Repositorio Oficial",
  fr: "Dépôt Officiel",
  de: "Offizielles Repository",
  it: "Repository Ufficiale",
  pt_br: "Repositório Oficial",
  pt_pt: "Repositório Oficial",
  ru: "Официальный репозиторий",
  ja: "公式リポジトリ",
  zh: "官方仓库",
  ko: "공식 저장소",
  ar: "المستودع الرسمي"
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    data.repository_label = translations[lang] || translations['en'];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
});
