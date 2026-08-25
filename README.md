<div align="center">

# 🔪 Machete PS5 Backup Manager

**Stop gambling with your backups. Start seeing them.**

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)]()
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%20%2B%20Rust-orange)]()

</div>

---

## The Problem

You have a 2TB external drive full of PS5 backups. Dozens of `.exFAT` files, `.ffpfsc` files, and folders — all named with cryptic codes like `PPSA04264` or `PPSA29343.exfat`. Which one is that massive open-world RPG? Which one is your favorite racing simulator? You have no idea. And when you need to free up space, you're one wrong click away from deleting 96GB of the wrong game. **Forever.**

That chaos ends today.

## The Solution

**Machete PS5 Backup Manager** scans your backup directory, reads the PPSA ID from every file and folder name, and instantly fetches the **official game title and high-quality cover art** from the SerialStation database. In seconds, your unreadable mess becomes a stunning visual gallery where you can identify every single backup at a glance.

No more guessing. No more accidents. No more disasters.

<div align="center">

![Machete PS5 Backup Manager Screenshot](public/screenshot.png)

</div>

---

## ✨ Features

### 🔍 Smart Recognition
Machete automatically detects `.exFAT` files, `.ffpfsc` files, and folders containing PS5 backups. It extracts the PPSA Title ID and resolves it to the real game name and region — no manual input needed.

### 🎨 Instant Cover Art
Every recognized game gets its official box art pulled directly from SerialStation. Your backup drive goes from a wall of text to a visual library in seconds. Cross-region fallback ensures maximum coverage.

### 🛡️ Zero Risk to Your Files
Machete **never** renames, moves, or modifies your original files. All custom titles and cover overrides are stored in a local database on your system. Your backups stay exactly as they are.

### ✏️ Manual Overrides
Game not recognized? No problem. Hover over any entry to manually edit the display title or assign a custom cover image — all stored locally, all reversible.

### 🗑️ Safe Deletion
When you need to free up space, Machete's delete function shows a clear, localized warning before permanently removing any file or folder. No silent deletions, no surprises.

### 🌍 11 Languages
English, Spanish (Venezuela), French, German, Italian, Portuguese (BR & PT), Russian, Japanese, Chinese, Korean, and Arabic. Every label, every warning, every changelog entry — fully translated.

### 🕵️ Privacy First
All API requests are fully anonymized. No tracking headers, no identifiable user agents, no cookies. Machete leaves zero trace of your activity on any external server.

### ⚡ Blazing Fast
Built with **Tauri + Rust** on the backend and **React + TypeScript** on the frontend. Native performance on every platform, with a fraction of the memory footprint of Electron-based alternatives.

---

## 🚀 Installation

### Download
Head to the [Releases](https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager/releases) page and download the installer for your platform:

| Platform | Format |
|----------|--------|
| macOS | `.dmg` / `.app` |
| Windows | `.msi` / `.exe` |
| Linux | `.AppImage` / `.deb` |

> [!WARNING]  
> **macOS Users:** If you receive an error saying the app is *"damaged and can't be opened"*, this is a standard macOS security feature for open-source apps. 
> To fix it, drag the app to your **Applications** folder, open your **Terminal**, and run this command:
> ```bash
> xattr -cr "/Applications/Machete PS5 Backup Manager.app"
> ```


### Build from Source
```bash
git clone https://github.com/VenezuelanBiggie24/Machete-PS5-Backup-Manager.git
cd Machete-PS5-Backup-Manager
npm install
npm run tauri build
```

**Requirements:** Node.js 18+, Rust 1.70+

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust (Tauri v2) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| API | SerialStation (anonymized) |
| i18n | i18next (11 languages) |
| Local DB | JSON file in system AppData |

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

You are free to use, modify, and redistribute this software. Any derivative work must also be released under GPLv3. This code will remain free and open source, forever.

---

## 👤 Author

**VenezuelanBiggie24**

A proud Venezuelan developer. Although the realities of communism forced me to leave my home, that adversity turned into resilience, allowing me today to write code and create borderless solutions from anywhere in the world.

---

<div align="center">

⭐ **If Machete saved you from a backup disaster, consider leaving a star** ⭐

</div>
