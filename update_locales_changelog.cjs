const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const changelog = {
  "en": {
    "changelog_title": "Changelog",
    "changelog_v110_title": "v1.1.0 - (Current)",
    "changelog_v110_items": [
      "Custom cover and title support (manual overrides).",
      "Larger default window size for optimal layout.",
      "Added SSD warning during scanning.",
      "Localized changelog and dialogs."
    ],
    "changelog_v100_title": "v1.0.0 - (Release)",
    "changelog_v100_items": [
      "Official rename to Machete PS5 Backup Manager.",
      "Cross-region AI cover fetching fallback.",
      "Relocated PPSA badge to bottom-right.",
      "Strict anonymization of SerialStation requests."
    ]
  },
  "es": {
    "changelog_title": "Historial de Cambios (Changelog)",
    "changelog_v110_title": "v1.1.0 - (Actual)",
    "changelog_v110_items": [
      "Soporte de carátulas y títulos personalizados (base de datos local).",
      "Mayor tamaño de ventana por defecto para visualizar toda la UI.",
      "Aviso incorporado sobre tiempos de carga en discos SSD grandes.",
      "Traducción total del changelog y ventanas de diálogo."
    ],
    "changelog_v100_title": "v1.0.0 - (Lanzamiento)",
    "changelog_v100_items": [
      "Renombre oficial a Machete PS5 Backup Manager.",
      "Búsqueda cruzada de carátulas para IDs sin registro.",
      "Reubicación de etiqueta PPSA a la zona inferior derecha.",
      "Anonimato estricto para peticiones a la API."
    ]
  }
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const cl = changelog[lang] || changelog["en"];
    Object.assign(data, cl);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
});
