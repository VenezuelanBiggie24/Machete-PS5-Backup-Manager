const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const translations = {
  "en": "Drag and drop here to copy",
  "es": "Arrastra y suelta aquí para copiar",
  "es_ve": "Arrastra y suelta aquí para copiar",
  "fr": "Glissez et déposez ici pour copier",
  "de": "Hierher ziehen und ablegen, um zu kopieren",
  "it": "Trascina e rilascia qui per copiare",
  "pt": "Arraste e solte aqui para copiar",
  "ru": "Перетащите сюда, чтобы скопировать",
  "ja": "ここにドラッグ＆ドロップしてコピー",
  "zh": "拖放到此处进行复制",
  "ko": "여기로 드래그 앤 드롭하여 복사"
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (translations[lang]) {
      data.drag_drop = translations[lang];
    } else {
      data.drag_drop = translations['en'];
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
});
