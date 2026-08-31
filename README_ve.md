<div align="right">
  <a href="README.md">English</a> | <a href="README_es.md">Español</a> | <strong>Español (Venezuela)</strong>
</div>

# Machete PS5 Backup Manager | Administrador de respaldos para PlayStation 5

Presentamos **Machete PS5 Backup Manager v2.1.1**: la herramienta definitiva para catalogar y gestionar respaldos de PS5 en almacenamiento externo de forma visual, rápida y segura.

### El problema
Conectas tu disco externo de varios terabytes y lo que encuentras es una lista ilegible: `PPSA04264.exfat`, `PPSA29343` y carpetas con códigos crípticos. Resulta imposible distinguir a simple vista qué juego es cada archivo, y un error al intentar liberar espacio puede significar borrar 96GB del título equivocado de manera irreversible.

### La solución
**Machete PS5 Backup Manager** inspecciona tu directorio, extrae el identificador PPSA de cada archivo o carpeta y obtiene de inmediato el título oficial y la carátula maestra en resolución 4K desde nuestra red CDN edge. En segundos, todo el contenido queda organizado en una galería visual de alto rendimiento.

### Características Principales

* **Compatibilidad Universal con Contenedores y ShadowMountPlus:** Reconoce automáticamente archivos `.ffpkg` (UFS), `.exFAT`, `.ffpfs` (PFS), `.ffpfsc` (contenedores comprimidos MicroMount / MkPFS), `.img`, `.bin`, `.dump`, `.raw`, `.iso`, `.pkg`, `.dat`, `.vhd`, `.vhdx`, `.dsk`, `.bak`, `.part`, así como carpetas con metadatos `sce_sys` y `param.json`.
* **CDN Global en Cloudflare R2:** Catálogo de más de 11.940 carátulas maestras verticales (3:4) con encabezados calados blancos de PS5 a latencias menores a 15ms.
* **Duplicación Instantánea en macOS (APFS clonefile):** Copias instantáneas con cero consumo de almacenamiento extra en volúmenes APFS gracias a Copy-On-Write.
* **Búfer de Transmisión de 16MB:** Optimizado para unidades SSD NVMe PCIe y almacenamiento externo en Windows, macOS y Linux con cálculo de velocidad y ETA en tiempo real.
* **Cero Telemetría y Máxima Privacidad:** Sin analítica, sin registro de direcciones IP ni recolección de datos. Peticiones CDN con encabezados de navegador estándar y base de datos JSON local soberana.
* **Operaciones Seguras y No Destructivas:** Advertencias claras antes de eliminar y lectura estricta sin alterar archivos originales ni marcas de tiempo.
* **Edición Manual de Metadatos:** Permite personalizar títulos y carátulas si un juego no está catalogado.
* **11 Idiomas:** Totalmente traducido al español, inglés, francés, alemán, italiano, portugués, ruso, japonés, chino, coreano y árabe.
* **Arquitectura Nativa:** Construido con Tauri v2, Rust 2021, React 19, TypeScript y Tailwind CSS v4.
* **Licencia GPLv3:** Software 100% libre y de código abierto.

### Instalación

Descarga el instalador correspondiente desde la sección de [Releases](https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager/releases):

| Plataforma | Formato |
|---|---|
| macOS | `.dmg` / `.app` |
| Windows | `.msi` / `.exe` |
| Linux | `.AppImage` / `.deb` |

#### macOS
Si el sistema muestra una advertencia de seguridad al abrir la aplicación:
1. Mueve la aplicación a la carpeta `/Applications`.
2. Ejecuta en la Terminal:
   ```bash
   xattr -cr "/Applications/Machete PS5 Backup Manager.app"
   ```

#### Windows
Si Windows SmartScreen muestra la pantalla de protección, haz clic en **Más información** y luego en **Ejecutar de todas formas**.

#### Linux
Asigna permisos de ejecución al `.AppImage`:
```bash
chmod +x Machete*.AppImage
```

### Compilar desde el Código Fuente

```bash
git clone https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager.git
cd Machete-PS5-Backup-Manager
npm install
npm run tauri build
```

---

## Autor

Desarrollado por **VenezuelanBiggie24**.

