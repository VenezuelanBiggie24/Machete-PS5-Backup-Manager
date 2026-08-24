const fs = require('fs');
const path = require('path');

const scanningTranslations = {
  en: "SCANNING DIRECTORY...",
  es_ve: "ESCANEANDO DIRECTORIO...",
  fr: "ANALYSE DU RÉPERTOIRE...",
  pt_br: "VERIFICANDO DIRETÓRIO...",
  pt_pt: "A VERIFICAR DIRETÓRIO...",
  de: "VERZEICHNIS WIRD GESCANNT...",
  ru: "СКАНИРОВАНИЕ КАТАЛОГА...",
  ar: "جاري مسح الدليل...",
  zh: "正在扫描目录...",
  ja: "ディレクトリをスキャン中...",
  ko: "디렉토리 스캔 중..."
};

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    
    data.scanning_dir = scanningTranslations[lang] || scanningTranslations.en;
    
    fs.writeFileSync(path.join(localesDir, file), JSON.stringify(data, null, 2));
  }
});
