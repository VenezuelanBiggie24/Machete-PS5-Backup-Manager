<div align="right">
  <strong>English</strong> | <a href="README_es.md">Español</a> | <a href="README_ve.md">Español (Venezuela)</a>
</div>

<div align="center">

# Machete PS5 Backup Manager

**High-performance, visual catalog and management suite for PlayStation 5 backups.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)]()
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20v2%20%2B%20Rust-orange)]()
[![Version](https://img.shields.io/badge/Version-v2.1.0-blue)]()

</div>

---

## Overview

Managing external storage devices populated with raw PlayStation 5 backups is traditionally an exercise in ambiguity. File systems frequently contain hundreds of gigabytes of cryptographic identifiers such as `PPSA04264`, `PPSA29343.exfat`, or arbitrary partition dumps. Without visual indexing, distinguishing between massive open-world titles and smaller utilities requires cross-referencing external databases, turning storage maintenance and deletion into high-risk operations.

**Machete PS5 Backup Manager** resolves this friction. Built on a high-efficiency native architecture, Machete inspects backup directories, parses Title IDs from structured folders and monolithic containers, and delivers an instant visual interface complete with 4K box art, region identification, and precise file operations.

<div align="center">

![Machete PS5 Backup Manager Screenshot](public/screenshot.png)

</div>

---

## Key Capabilities

### Universal Container Support
Machete features deep format recognition, parsing titles directly from filenames, partition tables, and directory structures. Supported formats include:
* Monolithic image & ShadowMountPlus formats: `.ffpkg` (UFS), `.exFAT`, `.ffpfs` (PFS), `.ffpfsc` (MicroMount / MkPFS compressed containers), `.img`, `.bin`, `.dump`, `.raw`, `.iso`, `.pkg`, `.dat`, `.vhd`, `.vhdx`, `.dsk`, `.bak`, `.part`
* Standard directory dumps containing `sce_sys` metadata and `param.json` structures.

### Proprietary Global Cover CDN
* Direct integration with a distributed Cloudflare R2 edge network serving over 11,940 high-resolution vertical (3:4 aspect ratio) master covers.
* Covers feature precision-rendered white PS5 calqued header templates.
* Global edge delivery consistently clocks under 15ms latency with automated cross-region and Title ID fallback resolution.

### High-Throughput I/O Engine
* **macOS APFS Copy-On-Write (`clonefile`):** Near-instantaneous, zero-storage-overhead duplication of massive multi-gigabyte backup containers on APFS volumes.
* **Optimized Direct I/O Pipeline:** A dedicated 16MB streaming buffer on Windows, macOS, and Linux optimizes sustained sequential read/write operations on PCIe NVMe SSDs and external storage.
* Real-time transfer telemetry calculating precise throughput and ETA indicators.

### Total Anonymity and Zero Telemetry
* Strict local data sovereignty: No user metrics, no analytics, no crash reports, and no external tracking.
* All remote CDN requests strip tracking headers and utilize standardized generic browser User-Agent headers to prevent fingerprinting.
* Application state, custom metadata overrides, and local artwork mappings are persisted strictly within a local JSON database on your filesystem.

### Granular Backup Operations
* **Safe Deletion Guards:** Multi-step visual confirmation dialogues prevent accidental data loss when reclaiming drive space.
* **Metadata & Artwork Overrides:** Manually assign custom titles or select replacement cover art for unlisted or custom builds.
* **Non-Destructive Scanning:** Machete operates in a non-destructive read model during cataloging, ensuring original files and timestamps remain unmodified.

### Comprehensive Localization
Fully localized across 11 languages:
English, Spanish (Castilian & Latin American), Spanish (Venezuela), French, German, Italian, Portuguese (Brazil & Portugal), Russian, Japanese, Simplified Chinese, Korean, and Arabic.

---

## Technical Specifications

| Component | Specification |
|---|---|
| Runtime Engine | Tauri v2 |
| Backend Architecture | Rust 2021 (POSIX / Win32 / macOS CoreFoundation bindings) |
| Frontend Framework | React 19 + TypeScript |
| Design System | Tailwind CSS v4 |
| Asset Delivery | Cloudflare R2 Global Edge CDN (11,940+ assets) |
| Local Database | Sovereign JSON store within OS AppData directory |
| License | GNU General Public License v3.0 (GPLv3) |

---

## Installation

Download the latest release for your platform from the [Releases](https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager/releases) page:

| Operating System | Package Format |
|---|---|
| macOS | `.dmg` / `.app` (Universal Apple Silicon & Intel) |
| Windows | `.msi` / `.exe` (x64) |
| Linux | `.AppImage` / `.deb` (x86_64) |

### Platform-Specific Setup Notes

#### macOS
If macOS Gatekeeper reports that the application is damaged or cannot be verified:
1. Move `Machete PS5 Backup Manager.app` to `/Applications`.
2. Execute the following command in Terminal to strip quarantine attributes:
   ```bash
   xattr -cr "/Applications/Machete PS5 Backup Manager.app"
   ```

#### Windows
When launching the installer for the first time, Windows SmartScreen may present a protection banner. Select **More info** followed by **Run anyway**.

#### Linux
Ensure the downloaded `.AppImage` has appropriate execution permissions:
```bash
chmod +x Machete*.AppImage
```

---

## Building From Source

### Prerequisites
* Node.js 18.0 or higher
* Rust 1.70 or higher (`cargo` toolchain)

### Build Instructions
```bash
# Clone the repository
git clone https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager.git
cd Machete-PS5-Backup-Manager

# Install frontend dependencies
npm install

# Compile optimized native binary
npm run tauri build
```

---

## License

This project is licensed under the **GNU General Public License v3.0**. Review the [LICENSE](LICENSE) file for complete terms.

You are entitled to inspect, modify, and redistribute this software. All derivative works must remain licensed under GPLv3, preserving permanent open-source access for the community.

---

## Author

Developed by **VenezuelanBiggie24**.

