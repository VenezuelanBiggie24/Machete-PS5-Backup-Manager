const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const translations = {
  "en": {
    "delete_confirm_title": "Confirm Deletion",
    "delete_confirm_msg": "Are you sure you want to permanently delete this title? This action cannot be undone."
  },
  "es": {
    "delete_confirm_title": "Confirmar Eliminación",
    "delete_confirm_msg": "¿Estás seguro de que deseas eliminar este título permanentemente? Esta acción no se puede deshacer."
  },
  "es_ve": {
    "delete_confirm_title": "Confirmar Eliminación",
    "delete_confirm_msg": "¿Estás seguro de que deseas eliminar este título permanentemente? Esta acción no se puede deshacer."
  },
  "fr": {
    "delete_confirm_title": "Confirmer la suppression",
    "delete_confirm_msg": "Êtes-vous sûr de vouloir supprimer définitivement ce titre ? Cette action est irréversible."
  },
  "de": {
    "delete_confirm_title": "Löschen bestätigen",
    "delete_confirm_msg": "Sind Sie sicher, dass Sie diesen Titel dauerhaft löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden."
  },
  "it": {
    "delete_confirm_title": "Conferma eliminazione",
    "delete_confirm_msg": "Sei sicuro di voler eliminare definitivamente questo titolo? Questa azione non può essere annullata."
  },
  "pt_br": {
    "delete_confirm_title": "Confirmar exclusão",
    "delete_confirm_msg": "Tem certeza de que deseja excluir permanentemente este título? Esta ação não pode ser desfeita."
  },
  "pt_pt": {
    "delete_confirm_title": "Confirmar eliminação",
    "delete_confirm_msg": "Tem a certeza de que deseja eliminar permanentemente este título? Esta ação não pode ser desfeita."
  },
  "ru": {
    "delete_confirm_title": "Подтвердите удаление",
    "delete_confirm_msg": "Вы уверены, что хотите навсегда удалить эту игру? Это действие нельзя отменить."
  },
  "ja": {
    "delete_confirm_title": "削除の確認",
    "delete_confirm_msg": "このタイトルを完全に削除してもよろしいですか？この操作は元に戻せません。"
  },
  "zh": {
    "delete_confirm_title": "确认删除",
    "delete_confirm_msg": "您确定要永久删除此游戏吗？此操作无法撤销。"
  },
  "ko": {
    "delete_confirm_title": "삭제 확인",
    "delete_confirm_msg": "이 타이틀을 영구적으로 삭제하시겠습니까? 이 작업은 실행 취소할 수 없습니다."
  },
  "ar": {
    "delete_confirm_title": "تأكيد الحذف",
    "delete_confirm_msg": "هل أنت متأكد أنك تريد حذف هذا العنوان نهائيًا؟ لا يمكن التراجع عن هذا الإجراء."
  }
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (translations[lang]) {
      data.delete_confirm_title = translations[lang].delete_confirm_title;
      data.delete_confirm_msg = translations[lang].delete_confirm_msg;
    } else {
      data.delete_confirm_title = translations['en'].delete_confirm_title;
      data.delete_confirm_msg = translations['en'].delete_confirm_msg;
    }
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
});
