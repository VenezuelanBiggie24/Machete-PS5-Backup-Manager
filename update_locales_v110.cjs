const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const translations = {
  "en": {
    "ssd_warning": "Loading massive files might take a few moments on large drives...",
    "cover_dimensions_warning": "For optimal display, please use a portrait-oriented image (3:4 aspect ratio) like a standard game cover.",
    "edit_title": "Rename Title",
    "change_cover": "Change Cover",
    "rename_prompt": "Enter new title for this game:"
  },
  "es": {
    "ssd_warning": "Cargar archivos masivos puede tardar unos momentos en discos de gran capacidad...",
    "cover_dimensions_warning": "Para una visualización óptima, usa una imagen en formato vertical (relación de aspecto 3:4) tipo póster.",
    "edit_title": "Renombrar Título",
    "change_cover": "Cambiar Carátula",
    "rename_prompt": "Introduce el nuevo título para este juego:"
  },
  "es_ve": {
    "ssd_warning": "Cargar archivos masivos puede tardar unos momentos en discos de gran capacidad...",
    "cover_dimensions_warning": "Para una visualización óptima, usa una imagen en formato vertical (relación de aspecto 3:4) tipo póster.",
    "edit_title": "Renombrar Título",
    "change_cover": "Cambiar Carátula",
    "rename_prompt": "Introduce el nuevo título para este juego:"
  },
  "fr": {
    "ssd_warning": "Le chargement de fichiers massifs peut prendre quelques instants sur de grands disques...",
    "cover_dimensions_warning": "Pour un affichage optimal, veuillez utiliser une image au format portrait (ratio 3:4).",
    "edit_title": "Renommer le titre",
    "change_cover": "Changer la pochette",
    "rename_prompt": "Entrez le nouveau titre pour ce jeu :"
  },
  "de": {
    "ssd_warning": "Das Laden massiver Dateien kann auf großen Laufwerken einen Moment dauern...",
    "cover_dimensions_warning": "Für eine optimale Anzeige verwenden Sie bitte ein Bild im Hochformat (Seitenverhältnis 3:4).",
    "edit_title": "Titel umbenennen",
    "change_cover": "Cover ändern",
    "rename_prompt": "Geben Sie einen neuen Titel für dieses Spiel ein:"
  },
  "it": {
    "ssd_warning": "Il caricamento di file di grandi dimensioni potrebbe richiedere qualche istante...",
    "cover_dimensions_warning": "Per una visualizzazione ottimale, usa un'immagine in formato verticale (rapporto 3:4).",
    "edit_title": "Rinomina titolo",
    "change_cover": "Cambia copertina",
    "rename_prompt": "Inserisci il nuovo titolo per questo gioco:"
  },
  "pt_br": {
    "ssd_warning": "Carregar arquivos massivos pode levar alguns momentos em discos grandes...",
    "cover_dimensions_warning": "Para exibição ideal, use uma imagem em formato retrato (proporção 3:4).",
    "edit_title": "Renomear Título",
    "change_cover": "Alterar Capa",
    "rename_prompt": "Digite o novo título para este jogo:"
  },
  "pt_pt": {
    "ssd_warning": "O carregamento de ficheiros maciços pode demorar alguns momentos...",
    "cover_dimensions_warning": "Para uma exibição ideal, utilize uma imagem em formato retrato (proporção 3:4).",
    "edit_title": "Mudar Título",
    "change_cover": "Alterar Capa",
    "rename_prompt": "Introduza o novo título para este jogo:"
  },
  "ru": {
    "ssd_warning": "Загрузка массивных файлов может занять некоторое время на больших дисках...",
    "cover_dimensions_warning": "Для оптимального отображения используйте вертикальное изображение (соотношение 3:4).",
    "edit_title": "Переименовать",
    "change_cover": "Изменить обложку",
    "rename_prompt": "Введите новое название для этой игры:"
  },
  "ja": {
    "ssd_warning": "大容量ドライブでは、巨大なファイルの読み込みに時間がかかる場合があります...",
    "cover_dimensions_warning": "最適な表示のために、縦長（アスペクト比 3:4）の画像を使用してください。",
    "edit_title": "タイトル変更",
    "change_cover": "カバー変更",
    "rename_prompt": "このゲームの新しいタイトルを入力："
  },
  "zh": {
    "ssd_warning": "在大容量驱动器上加载海量文件可能需要一些时间...",
    "cover_dimensions_warning": "为了获得最佳显示效果，请使用纵向（3:4比例）的图像。",
    "edit_title": "重命名",
    "change_cover": "更改封面",
    "rename_prompt": "输入此游戏的新名称："
  },
  "ko": {
    "ssd_warning": "대용량 드라이브에서 대규모 파일을 로드하는 데 몇 분이 걸릴 수 있습니다...",
    "cover_dimensions_warning": "최적의 디스플레이를 위해 세로 방향(3:4 비율) 이미지를 사용하십시오.",
    "edit_title": "제목 이름 바꾸기",
    "change_cover": "표지 변경",
    "rename_prompt": "이 게임의 새 제목 입력:"
  },
  "ar": {
    "ssd_warning": "قد يستغرق تحميل الملفات الضخمة بضع لحظات على الأقراص الكبيرة...",
    "cover_dimensions_warning": "للحصول على عرض مثالي، يرجى استخدام صورة عمودية (نسبة 3:4).",
    "edit_title": "إعادة تسمية العنوان",
    "change_cover": "تغيير الغلاف",
    "rename_prompt": "أدخل عنوانًا جديدًا لهذه اللعبة:"
  }
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (translations[lang]) {
      Object.assign(data, translations[lang]);
    } else {
      Object.assign(data, translations['en']);
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
});
