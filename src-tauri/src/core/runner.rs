use std::process::Command;
use std::path::Path;
use std::fs;
use crate::core::patcher;

#[derive(serde::Serialize)]
pub struct RunResult {
    pub success: bool,
    pub message: String,
}

pub fn find_runner() -> Option<String> {
    let paths = [
        "/opt/homebrew/bin/wine",
        "/usr/local/bin/wine",
        "/Applications/Whisky.app/Contents/Resources/wine/bin/wine",
        "/opt/homebrew/bin/gameportingtoolkit",
    ];

    for path in paths {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    None
}

pub fn run_executable(exe_path: &str, prefix_path: &Path, custom_engine: Option<String>, env_type: &str) -> Result<std::process::Child, String> {
    let runner = if let Some(engine) = custom_engine {
        engine
    } else {
        find_runner().ok_or("Pancho-Core Engine not found. Please create a Pro bottle to trigger setup.")?
    };
    
    let exe_path_buf = Path::new(exe_path);
    let working_dir = exe_path_buf.parent().ok_or("Invalid executable path")?;

    if !prefix_path.exists() {
        fs::create_dir_all(&prefix_path).map_err(|e| e.to_string())?;
    }

    // ONLY APPLY PANCHO PATCHES FOR PRO BOTTLES IF NOT ALREADY DONE
    let patched_flag = prefix_path.join(".pancho_patched");
    if env_type == "pro" {
        if !patched_flag.exists() {
            let _ = patcher::apply_modern_game_patches(&runner, prefix_path);
            let _ = patcher::optimize_for_metal(&runner, prefix_path);
        }
        
        // Steam resets its own registry keys frequently, so we force-patch Steam every launch
        if exe_path.to_lowercase().contains("steam.exe") {
            let _ = patcher::apply_steam_specific_patches(&runner, prefix_path);
        }
        
        if !patched_flag.exists() {
            let _ = std::fs::File::create(patched_flag);
        }
    }

    let is_steam = exe_path.to_lowercase().contains("steam");

    let mut command = Command::new(&runner);
    command.current_dir(working_dir)
           .env("WINEPREFIX", prefix_path.to_str().unwrap())
           // THE "WHISKY/CROSSOVER" STABILITY STACK
           .env("WINEDLLOVERRIDES", "d3d11,d3d12,dxgi=n;d3d9=b;dwrite=d;mscoree,mshtml=;winemenubuilder.exe=d;gameoverlayrenderer,gameoverlayrenderer64=d")
           .env("WINE_SKIP_GECKO_INSTALLATION", "1")
           .env("WINE_SKIP_MONO_INSTALLATION", "1")
           
           // PERFORMANCE & SYNC
           .env("WINEESYNC", "1")
           .env("WINEMSYNC", "1")
           .env("WINEDEBUG", "fixme-all,err-all")
           
           // MEMORY
           .env("WINE_ASLR", "0")
           .env("WINE_FORCE_LARGE_ADDRESS_AWARE", "1")
           .env("WINE_LARGE_ADDRESS_AWARE", "1")
           
           // GRAPHICS (GPTK / Metal)
           .env("MTL_HUD_ENABLED", "1")
           .env("MVK_CONFIG_RESILIENT_REPORTING", "1")
           
           // STEAM FIXES
           .env("STEAM_FORCE_DESKTOPUI_OVERRIDE", "1")
           .env("WINE_DISABLE_GPU_FOR_STEAM", "1")
           .env("PANCHO_MACH_PORT", "1")
           .arg(exe_path);

    if is_steam {
        command.arg("-no-cef-sandbox")
               .arg("-cef-disable-gpu")
               .arg("-cef-disable-d3d11")
               .arg("-all-non-sandbox");
    }

    println!("Pancho-Core: Spawning {} in directory {:?}...", exe_path, working_dir);
    let child = command.spawn()
        .map_err(|e| format!("Failed to spawn Pancho-Core: {}", e))?;

    Ok(child)
}
