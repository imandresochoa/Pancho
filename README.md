# Pancho 🍷🎮

**Pancho** is a lightweight, high-performance Windows compatibility manager for macOS. Built with Tauri and Rust, it provides a native interface for managing Wine and Apple's Game Porting Toolkit (GPTK) through an intuitive "Bottle" system.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey.svg)
![Built with](https://img.shields.io/badge/built%20with-Tauri%20%2F%20Rust%20%2F%20React-orange.svg)

## ✨ Features

- **📦 Bottle Management:** Create isolated Windows environments (Wine prefixes) for different apps or games.
- **🚀 Gaming Optimizations:** 
  - **ESync:** Reduces CPU overhead in multi-threaded games.
  - **D3DMetal:** Deep integration with Apple's Game Porting Toolkit.
  - **Metal HUD:** Real-time performance monitoring (FPS, GPU load).
- **🔍 Smart Scanner:** Automatically detects installed `.exe` files and Steam within your bottles.
- **🛡️ Binary Analysis:** Deep PE analysis (Architecture, Entry Point, Sections) before launching.
- **📁 Native Integration:** Open bottle files directly in Finder and manage installers with a native UI.

## 🛠️ Prerequisites

To use Pancho, you need a Wine runner or GPTK installed. We recommend using Homebrew:

```bash
# Recommended for Gaming
brew install --cask whisky-wine

# Or standard Wine
brew install --cask wine-stable
```

## 🚀 Getting Started

1. **Clone the Repo:**
   ```bash
   git clone https://github.com/andresochoa/Pancho.git
   cd Pancho
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Run in Development:**
   ```bash
   npm run tauri dev
   ```

## 🏗️ Tech Stack

- **Frontend:** React 19, Tailwind CSS, Lucide React, Radix UI.
- **Backend:** Rust, Tauri v2.
- **Binary Parsing:** `goblin`.
- **Process Orchestration:** Custom Wine/GPTK runner.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Built with ❤️ for the macOS gaming community.*
