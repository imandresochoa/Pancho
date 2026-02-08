use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::wine::runner::WineRunnerType;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RegistryValueType {
    String,
    DWord,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub key: String,
    pub value_name: String,
    pub value_type: RegistryValueType,
    pub value_data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BottleTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub env_vars: HashMap<String, String>,
    pub registry_entries: Vec<RegistryEntry>,
    pub dll_overrides: HashMap<String, String>,
    pub winetricks_packages: Vec<String>,
    pub recommended_runner: Option<WineRunnerType>,
}

impl BottleTemplate {
    pub fn steam_gaming() -> Self {
        let mut env = HashMap::new();
        env.insert("WINEESYNC".to_string(), "1".to_string());
        env.insert("DXVK_HUD".to_string(), "fps".to_string());
        env.insert("MTL_HUD_ENABLED".to_string(), "1".to_string());
        // Fix for Steam CEF issues
        env.insert("WINE_D3D11_ALLOW_SWAPCHAIN_RECREATION".to_string(), "1".to_string());

        let mut dlls = HashMap::new();
        // Modern gaming usually prefers native D3D if available (D3DMetal/DXVK)
        dlls.insert("d3d11".to_string(), "native".to_string());
        dlls.insert("d3d12".to_string(), "native".to_string());
        
        // Steam registry keys
        let registry = vec![
            RegistryEntry {
                key: r"HKEY_CURRENT_USER\Software\Valve\Steam".to_string(),
                value_name: "SteamPath".to_string(),
                value_type: RegistryValueType::String,
                value_data: r"C:\Program Files (x86)\Steam".to_string(),
            },
            RegistryEntry {
                 key: r"HKEY_CURRENT_USER\Software\Valve\Steam".to_string(),
                 value_name: "SteamExe".to_string(),
                 value_type: RegistryValueType::String,
                 value_data: r"C:\Program Files (x86)\Steam\steam.exe".to_string(),
            }
        ];

        Self {
            id: "steam_gaming".to_string(),
            name: "Steam Gaming".to_string(),
            description: "Optimized for Steam and modern DX11/12 games using D3DMetal.".to_string(),
            env_vars: env,
            registry_entries: registry,
            dll_overrides: dlls,
            winetricks_packages: vec!["vcrun2019".to_string(), "dotnet48".to_string()],
            recommended_runner: Some(WineRunnerType::GPTK),
        }
    }

    pub fn standard_gaming() -> Self {
        let mut env = HashMap::new();
        env.insert("WINEESYNC".to_string(), "1".to_string());

        Self {
            id: "standard_gaming".to_string(),
            name: "Standard Gaming".to_string(),
            description: "General purpose gaming configuration for older titles (DX9/10).".to_string(),
            env_vars: env,
            registry_entries: vec![],
            dll_overrides: HashMap::new(),
            winetricks_packages: vec!["d3dx9".to_string()],
            recommended_runner: Some(WineRunnerType::Standard),
        }
    }

    pub fn application() -> Self {
        Self {
            id: "application".to_string(),
            name: "Desktop Application".to_string(),
            description: "Minimal environment for non-gaming productivity apps.".to_string(),
            env_vars: HashMap::new(),
            registry_entries: vec![],
            dll_overrides: HashMap::new(),
            winetricks_packages: vec!["corefonts".to_string()],
            recommended_runner: None,
        }
    }

    pub fn get_all_templates() -> Vec<Self> {
        vec![
            Self::steam_gaming(),
            Self::standard_gaming(),
            Self::application(),
        ]
    }
}

#[tauri::command]
pub fn get_bottle_templates() -> Vec<BottleTemplate> {
    BottleTemplate::get_all_templates()
}

#[tauri::command]
pub fn get_template_by_id(id: String) -> Option<BottleTemplate> {
    BottleTemplate::get_all_templates().into_iter().find(|t| t.id == id)
}
