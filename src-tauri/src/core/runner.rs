use std::process::Command;
use std::path::Path;
use std::fs;

#[derive(serde::Serialize)]
pub struct RunResult {
    pub success: bool,
    pub message: String,
}

pub fn find_runner() -> Option<String> {
    // We now prioritize our UNIFIED PANCHO ENGINE above all else
    let paths = [
        "/Users/andresochoa/Library/Application Support/com.andresochoa.tauri-app/engines/pancho-pro-v1/bin/wine64",
        "/opt/homebrew/bin/gameportingtoolkit",
        "/usr/local/bin/gameportingtoolkit",
        "/Applications/Whisky.app/Contents/Resources/wine/bin/wine64",
    ];

    for path in paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

pub fn run_executable(exe_path: &str, prefix_path: &Path, custom_engine: Option<String>) -> Result<RunResult, String> {
    let runner = if let Some(engine) = custom_engine {
        engine
    } else {
        find_runner().ok_or("Pancho-Core Engine not found. Please complete Onboarding.")?
    };
    
    if !prefix_path.exists() {
        fs::create_dir_all(&prefix_path).map_err(|e| e.to_string())?;
    }

    let mut command = Command::new(&runner);
    command.env("WINEPREFIX", prefix_path.to_str().unwrap())
           // UNIFIED PANCHO-CORE OPTIMIZATIONS
           .env("WINEESYNC", "1")
           .env("WINEMSYNC", "1")
           .env("WINEDEBUG", "-all")
           
           // MEMORY MANAGEMENT (Fixes modern game crashes on Apple Silicon)
           .env("WINE_ASLR", "0")
           .env("WINE_FORCE_LARGE_ADDRESS_AWARE", "1")
           
           // GRAPHICS BRIDGE (The "CrossOver" Secret Sauce)
           // We force the D3DMetal bridge which is required for DX11/12
           .env("WINEDLLOVERRIDES", "d3d11,dxgi,d3d12,d3d9,dxgi=n;gameoverlayrenderer,gameoverlayrenderer64=d")
           
           // METAL PERFORMANCE
           .env("MTL_HUD_ENABLED", "1")
           .env("MVK_CONFIG_RESILIENT_REPORTING", "1")
           .env("MVK_CONFIG_GEOMETRY_SHADER", "1")
           .env("MVK_CONFIG_USE_METAL_ARGUMENT_BUFFERS", "1")
           
           .arg(exe_path);

    command.spawn()
        .map_err(|e| format!("Failed to spawn Pancho-Core: {}", e))?;

    Ok(RunResult {
        success: true,
        message: "Launched with Pancho-Core Unified Runtime".to_string(),
    })
}
