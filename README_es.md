<div align="right">
  <a href="README.md">English</a> | <strong>Español</strong> | <a href="README_ve.md">Español (Venezuela)</a>
</div>

<div align="center">

# Machete PS5 Backup Manager

**Catálogo visual y suite de gestión de alto rendimiento para respaldos de PlayStation 5.**

[![Licencia: GPL v3](https://img.shields.io/badge/Licencia-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Plataforma](https://img.shields.io/badge/Plataforma-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)]()
[![Construido con Tauri](https://img.shields.io/badge/Construido%20con-Tauri%20v2%20%2B%20Rust-orange)]()
[![Versión](https://img.shields.io/badge/Versi%C3%B3n-v2.1.2-blue)]()

</div>

---

## Visión General

Administrar dispositivos de almacenamiento externo repletos de respaldos de PlayStation 5 en bruto suele ser un ejercicio de incertidumbre. Los sistemas de archivos contienen con frecuencia cientos de gigabytes identificados únicamente por códigos crípticos como `PPSA04264`, `PPSA29343.exfat` o volcados arbitrarios de particiones. Sin una indexación visual directa, distinguir entre títulos de mundo abierto de gran escala y pequeñas utilidades exige consultar bases de datos externas, convirtiendo el mantenimiento y la liberación de espacio en operaciones de alto riesgo.

**Machete PS5 Backup Manager** resuelve esta fricción. Desarrollado sobre una arquitectura nativa de alta eficiencia, Machete inspecciona los directorios de respaldos, procesa los Title IDs tanto en carpetas estructuradas como en contenedores monolíticos, y ofrece una interfaz visual instantánea con carátulas en calidad 4K, identificación de región y operaciones de archivo precisas.

<div align="center">

![Captura de pantalla de Machete PS5 Backup Manager](public/screenshot.png)

</div>

---

## Capacidades Principales

### Compatibilidad Universal con Contenedores y Respaldos
Machete incorpora reconocimiento profundo de formatos desde nombres de archivo, tablas de partición y estructuras de directorios. Formatos soportados:
* Formatos de imagen monolítica y ShadowMountPlus: `.ffpkg` (UFS), `.exFAT`, `.ffpfs` (PFS), `.ffpfsc` (contenedores comprimidos MicroMount / MkPFS), `.img`, `.bin`, `.dump`, `.raw`, `.iso`, `.pkg`, `.dat`, `.vhd`, `.vhdx`, `.dsk`, `.bak`, `.part`
* Volcados estándar de directorios con metadatos `sce_sys` y archivos `param.json`.

### Red CDN Global Dedicada para Carátulas
* Integración directa con una red edge distribuida en Cloudflare R2 que sirve más de 11.940 carátulas maestras verticales en ultra alta resolución (relación de aspecto 3:4).
* Carátulas con encabezados blancos calados de PS5 renderizados con máxima precisión.
* Latencia de entrega global inferior a 15 ms, con resolución automatizada de fallbacks por región y Title ID.

### Motor de E/S de Alto Rendimiento
* **macOS APFS Copy-On-Write (`clonefile`):** Duplicación instantánea y con consumo cero de espacio adicional para contenedores de respaldos de decenas de gigabytes en volúmenes APFS.
* **Canal Directo de E/S Optimizado:** Búfer de transmisión dedicado de 16 MB en Windows, macOS y Linux para maximizar operaciones secuenciales sostenidas de lectura/escritura en unidades SSD NVMe PCIe y almacenamiento externo.
* Telemetría de transferencia en tiempo real con cálculo continuo de velocidad y tiempo estimado (ETA).

### Anonimato Total y Cero Telemetría
* Soberanía local de datos garantizada: Sin métricas de usuario, sin analítica, sin registro de IP, sin informes de fallos y sin rastreo externo.
* Las peticiones remotas a la CDN omiten encabezados de rastreo y emplean User-Agents genéricos de navegador para evitar la huella digital (fingerprinting).
* El estado de la aplicación, títulos personalizados y carátulas manuales se almacenan exclusivamente en una base de datos JSON local en su sistema de archivos.

### Operaciones Granulares y Seguras
* **Protección ante Eliminación:** Diálogos de confirmación visual multinivel previenen la pérdida accidental de datos al liberar espacio.
* **Sobrescritura Manual de Metadatos:** Permite asignar títulos y carátulas personalizadas para títulos no catalogados o modificaciones caseras.
* **Lectura No Destructiva:** Machete opera bajo un esquema de solo lectura durante la catalogación, preservando archivos y marcas de tiempo originales.

### Localización Integral
Completamente traducido a 11 idiomas:
Español (Castellano y Latinoamérica), Español (Venezuela), Inglés, Francés, Alemán, Italiano, Portugués (Brasil y Portugal), Ruso, Japonés, Chino Simplificado, Coreano y Árabe.

---

## Especificaciones Técnicas

| Componente | Especificación |
|---|---|
| Motor de Ejecución | Tauri v2 |
| Arquitectura Backend | Rust 2021 (Bindings nativos POSIX / Win32 / macOS CoreFoundation) |
| Framework Frontend | React 19 + TypeScript |
| Sistema de Diseño | Tailwind CSS v4 |
| Distribución de Recursos | Cloudflare R2 Global Edge CDN (11.940+ recursos) |
| Base de Datos Local | Almacenamiento JSON soberano en AppData del sistema |
| Licencia | GNU General Public License v3.0 (GPLv3) |

---

## Instalación

Descargue la versión más reciente para su plataforma desde la página de [Releases](https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager/releases):

| Sistema Operativo | Formato de Paquete |
|---|---|
| macOS | `.dmg` / `.app` (Universal Apple Silicon e Intel) |
| Windows | `.msi` / `.exe` (x64) |
| Linux | `.AppImage` / `.deb` (x86_64) |

### Instrucciones Específicas por Plataforma

#### macOS
Si macOS Gatekeeper indica que la aplicación está dañada o no se puede verificar:
1. Mueva `Machete PS5 Backup Manager.app` a la carpeta `/Applications`.
2. Ejecute el siguiente comando en la Terminal para eliminar los atributos de cuarentena:
   ```bash
   xattr -cr "/Applications/Machete PS5 Backup Manager.app"
   ```

#### Windows
Al ejecutar el instalador por primera vez, Windows SmartScreen puede mostrar una advertencia de protección. Haga clic en **Más información** y luego en **Ejecutar de todas formas**.

#### Linux
Asegúrese de otorgar permisos de ejecución al archivo `.AppImage` descargado:
```bash
chmod +x Machete*.AppImage
```

---

## Compilación desde el Código Fuente

### Requisitos Previos
* Node.js 18.0 o superior
* Rust 1.70 o superior (Toolchain `cargo`)

### Instrucciones de Compilación
```bash
# Clonar el repositorio
git clone https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager.git
cd Machete-PS5-Backup-Manager

# Instalar dependencias de frontend
npm install

# Compilar binario nativo optimizado
npm run tauri build
```

---

## Licencia

Este proyecto está licenciado bajo la **GNU General Public License v3.0**. Consulte el archivo [LICENSE](LICENSE) para conocer los términos completos.

Usted tiene la libertad de inspeccionar, modificar y redistribuir este software. Cualquier trabajo derivado debe permanecer bajo la licencia GPLv3, preservando el acceso libre y de código abierto para la comunidad.

---

## Autor

Desarrollado por **VenezuelanBiggie24**.

