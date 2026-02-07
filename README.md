# Pancho 🤠
**A Modern macOS Game Manager for Steam Windows Games**

Pancho is a native macOS application built with **Tauri**, **React**, and **Shadcn UI**. It is designed to help you organize and launch Windows games on macOS using Apple's Game Porting Toolkit (GPTK) or Wine.

## 🚀 Getting Started

### Prerequisites

1.  **Node.js**: [Download](https://nodejs.org/)
2.  **Rust** (Required for Tauri):
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
    *Restart your terminal after installing Rust.*

### Installation

1.  Clone the repository (or open this folder).
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the App

Start the development server:
```bash
npm run tauri dev
```

This will launch the native macOS application window.

## 🛠 Tech Stack

*   **Framework:** [Tauri v2](https://tauri.app) (Rust + Webview)
*   **Frontend:** React + TypeScript + Vite
*   **Styling:** Tailwind CSS
*   **UI Library:** Shadcn UI (Radix Primitives)
*   **Icons:** Lucide React

## ⚠️ Note on Game Compatibility

This prototype contains the **User Interface**. To actually launch games like *No Rest for the Wicked*, you will need to integrate the backend with a GPTK installation.

Future updates will include:
*   Auto-detection of Steam Library.
*   `subprocess` execution of `gameportingtoolkit` command.