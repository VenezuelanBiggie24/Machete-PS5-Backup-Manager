<div align="right">
  <a href="README.md">🇺🇸 English</a> | <a href="README_es.md">🇪🇸 Español</a> | 🇻🇪 <strong>Español (Venezuela)</strong>
</div>

# Machete PS5 Backup Manager 🗡️ | Deja de jugar a la ruleta rusa con tus respaldos

¡Epa, Samurai! Tenemos una colección que acomodar. 🦾🔥

¡Qué lo qué, gente de la scene! Soy **VenezuelanBiggie24** y hoy estoy burda de emocionado de presentarles mi último invento: **Machete PS5 Backup Manager v1.2.0**.

### El beta que todos conocemos
Conectas tu disco externo de 2TB y lo que ves es un arroz con mango: `PPSA04264.exfat`, `PPSA29343`, y unas carpetas con nombres que no significan nada... ¿Cuál de todos esos es el RPG mundo abierto larguísimo? ¿Cuál es tu simulador de carreras favorito? Nadie sabe. Y cuando andas pelando de espacio y necesitas borrar algo, estás a un mal clic de borrar 96GB del juego equivocado. **Para siempre, chamo.**

### El Resuelve (La Solución)
**Machete PS5 Backup Manager** le mete el ojo a tu directorio, lee el código PPSA de cada archivo `.exFAT`, `.ffpfsc` o carpeta, y se descarga automáticamente el nombre oficial y la carátula en full HD desde SerialStation. En cuestión de segundos, ese desastre incomprensible se convierte en una galería visual arrechísima donde puedes identificar cada respaldo de un solo golpe.

### ⚙️ Los Poderes (Características Principales):
* 🔍 **Reconocimiento Pila:** Detecta automáticamente archivos `.exFAT`, `.ffpfsc` y carpetas que contengan IDs de PPSA.
* 🎨 **Carátulas HD Oficiales:** Se bajan de una desde SerialStation para que la grilla se vea criminal.
* 🛡️ **Cero Riesgo:** Machete NUNCA toca, renombra ni echa a perder tus archivos originales. Todo se guarda en una base de datos local sanita.
* ✏️ **Edición a Mano:** ¿No reconoció un juego? Ponle el título tú mismo y clávale una carátula personalizada.
* 🗑️ **Borrado Seguro:** Borra los respaldos desde el disco con una advertencia clara antes de meter la pata.
* 🌍 **11 Idiomas:** Traducido completico para la scene mundial.
* 🕵️ **Privacidad Total:** Las peticiones a la API son 100% anónimas. Cero rastreo, puro modo incógnito.
* ⚡ **Tauri + Rust:** Va a toda mecha. Rendimiento nativo en **Windows, Mac y Linux**.
* 📜 **Licencia GPLv3:** Esto se queda libre y open-source pa' siempre. Nadie lo puede privatizar.
* 📥 **Transferencias Nativas:** Arrastra y suelta archivos o carpetas, o dale clic a la Dropzone pa' abrir el explorador. Tiene una interfaz Cyberpunk brutal de progreso que te calcula la velocidad y cuánto falta (ETA) en tiempo real.

> [!WARNING]  
> **Usuarios de macOS:** Si al abrir la app te sale un error ladilla diciendo que *"está dañada y debe trasladarse a la papelera"*, es una mariquera de seguridad estándar de Apple para apps de código abierto. 
> Para solucionarlo, arrastra la app a tu carpeta de **Aplicaciones**, abre la **Terminal** y lanza este comando:
> ```bash
> xattr -cr "/Applications/Machete PS5 Backup Manager.app"
> ```

> [!NOTE]  
> **Usuarios de Windows:** Al ejecutar el instalador por primera vez, es posible que salte la pantalla azul de Windows SmartScreen ("Windows protegió su PC"). Simplemente dale a **"Más información"** y después a **"Ejecutar de todas formas"** (pa' lante).

> [!NOTE]  
> **Usuarios de Linux:** Si usas el formato `.AppImage`, no te olvides de darle permisos de ejecución antes de abrirlo. Haz clic derecho en el archivo -> Propiedades -> Permisos -> Marca "Permitir ejecutar el archivo como un programa", o lánzate un `chmod +x Machete*.AppImage` en la terminal.

### 📸 Así se ve (Preview)
![Screenshot](./public/screenshot.png)

### Compilar desde cero (Pa' los curiosos)
```bash
git clone https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager.git
cd Machete-PS5-Backup-Manager
npm install
npm run tauri build
```
