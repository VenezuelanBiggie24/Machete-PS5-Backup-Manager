const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const licenseTranslations = {
  en: "Distributed under the GPLv3 License",
  es: "Distribuido bajo la Licencia GPLv3",
  es_ve: "Distribuido bajo la Licencia GPLv3",
  fr: "Distribué sous la licence GPLv3",
  de: "Unter der GPLv3-Lizenz vertrieben",
  it: "Distribuito sotto la licenza GPLv3",
  pt_br: "Distribuído sob a Licença GPLv3",
  pt_pt: "Distribuído sob a Licença GPLv3",
  ru: "Распространяется по лицензии GPLv3",
  ja: "GPLv3ライセンスの下で配布",
  zh: "在 GPLv3 许可证下分发",
  ko: "GPLv3 라이선스에 따라 배포됨",
  ar: "موزع بموجب ترخيص GPLv3"
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    data.license_info = licenseTranslations[lang] || licenseTranslations['en'];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file} with license info.`);
  }
});
