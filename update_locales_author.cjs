const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const files = fs.readdirSync(localesDir);

const newContent = {
  "en": {
    "about_desc": "Developed by VenezuelanBiggie24, a proud Venezuelan developer. Although the realities of communism forced me to leave my home, that adversity turned into resilience, allowing me today to write code and create borderless solutions from anywhere in the world.",
    "changelog_v020_title": "v0.2.0 - (Beta)",
    "changelog_v020_items": [
      "Incorporation of native deletion prevention system (Native Dialog).",
      "UI restructuring with Cyberpunk styling and dark mode.",
      "Native support for 11 languages with dynamic switching."
    ],
    "changelog_v010_title": "v0.1.0 - (Initial)",
    "changelog_v010_items": [
      "Proof of concept. Asynchronous file reading.",
      "Basic initial connection with SerialStation API.",
      "Disk space calculation."
    ]
  },
  "es": {
    "about_desc": "Desarrollado por VenezuelanBiggie24, un orgulloso desarrollador venezolano. Aunque las realidades del comunismo me obligaron a dejar mi hogar, esa adversidad se transformó en resiliencia, permitiéndome hoy escribir código y crear soluciones sin fronteras desde cualquier rincón del mundo.",
    "changelog_v020_title": "v0.2.0 - (Beta)",
    "changelog_v020_items": [
      "Incorporación de sistema de prevención de borrado (Native Dialog).",
      "Reestructuración de la UI al estilo Cyberpunk y modo oscuro.",
      "Soporte nativo para 11 idiomas con cambio dinámico."
    ],
    "changelog_v010_title": "v0.1.0 - (Inicial)",
    "changelog_v010_items": [
      "Prueba de concepto. Lectura asíncrona de archivos.",
      "Conexión inicial básica con API SerialStation.",
      "Cálculo de espacio de disco disponible."
    ]
  }
};

files.forEach(file => {
  if (file.endsWith('.json')) {
    const lang = file.replace('.json', '');
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Copy the correct language or fallback to 'en' (or 'es' for 'es_ve')
    let sourceContent = newContent["en"];
    if (lang === "es" || lang === "es_ve") {
      sourceContent = newContent["es"];
    }
    
    Object.assign(data, sourceContent);
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    console.log(`Updated ${file}`);
  }
});
