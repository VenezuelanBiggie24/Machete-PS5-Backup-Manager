const fs = require('fs');

const locales = {
  fr: {
    "app_name": "Machete",
    "drag_drop": "Glissez-déposez le dossier PS5 PKG ici",
    "machetear": "MACHETEAR (Supprimer)",
    "about": "À propos de Machete",
    "free_space": "Espace Libre",
    "used_space": "Utilisé",
    "author": "VenezuelanBiggie24",
    "select_dir": "Sélectionner un Répertoire",
    "current_dir": "Répertoire Courant:"
  },
  pt_br: {
    "app_name": "Machete",
    "drag_drop": "Arraste e Solte a Pasta PS5 PKG Aqui",
    "machetear": "MACHETEAR (Excluir)",
    "about": "Sobre o Machete",
    "free_space": "Espaço Livre",
    "used_space": "Usado",
    "author": "VenezuelanBiggie24",
    "select_dir": "Selecionar Diretório",
    "current_dir": "Diretório Atual:"
  },
  pt_pt: {
    "app_name": "Machete",
    "drag_drop": "Arraste e Solte a Pasta PS5 PKG Aqui",
    "machetear": "MACHETEAR (Eliminar)",
    "about": "Sobre o Machete",
    "free_space": "Espaço Livre",
    "used_space": "Usado",
    "author": "VenezuelanBiggie24",
    "select_dir": "Selecionar Diretório",
    "current_dir": "Diretório Atual:"
  },
  de: {
    "app_name": "Machete",
    "drag_drop": "PS5 PKG Ordner hierher ziehen",
    "machetear": "MACHETEAR (Löschen)",
    "about": "Über Machete",
    "free_space": "Freier Speicherplatz",
    "used_space": "Verwendet",
    "author": "VenezuelanBiggie24",
    "select_dir": "Verzeichnis auswählen",
    "current_dir": "Aktuelles Verzeichnis:"
  },
  ru: {
    "app_name": "Machete",
    "drag_drop": "Перетащите папку PS5 PKG сюда",
    "machetear": "MACHETEAR (Удалить)",
    "about": "О Machete",
    "free_space": "Свободное место",
    "used_space": "Занято",
    "author": "VenezuelanBiggie24",
    "select_dir": "Выбрать каталог",
    "current_dir": "Текущий каталог:"
  },
  ar: {
    "app_name": "Machete",
    "drag_drop": "اسحب وأفلت مجلد PS5 PKG هنا",
    "machetear": "MACHETEAR (حذف)",
    "about": "عن Machete",
    "free_space": "مساحة حرة",
    "used_space": "مستخدم",
    "author": "VenezuelanBiggie24",
    "select_dir": "حدد المجلد",
    "current_dir": "المجلد الحالي:"
  },
  zh: {
    "app_name": "Machete",
    "drag_drop": "将 PS5 PKG 文件夹拖放到此处",
    "machetear": "MACHETEAR (删除)",
    "about": "关于 Machete",
    "free_space": "可用空间",
    "used_space": "已用",
    "author": "VenezuelanBiggie24",
    "select_dir": "选择目录",
    "current_dir": "当前目录:"
  },
  ja: {
    "app_name": "Machete",
    "drag_drop": "ここにPS5 PKGフォルダをドラッグ＆ドロップ",
    "machetear": "MACHETEAR (削除)",
    "about": "Macheteについて",
    "free_space": "空き容量",
    "used_space": "使用中",
    "author": "VenezuelanBiggie24",
    "select_dir": "ディレクトリを選択",
    "current_dir": "現在のディレクトリ:"
  },
  ko: {
    "app_name": "Machete",
    "drag_drop": "여기에 PS5 PKG 폴더를 드래그 앤 드롭하세요",
    "machetear": "MACHETEAR (삭제)",
    "about": "Machete 정보",
    "free_space": "여유 공간",
    "used_space": "사용됨",
    "author": "VenezuelanBiggie24",
    "select_dir": "디렉토리 선택",
    "current_dir": "현재 디렉토리:"
  }
};

for (const [lang, data] of Object.entries(locales)) {
  fs.writeFileSync(`src/locales/${lang}.json`, JSON.stringify(data, null, 2));
}
