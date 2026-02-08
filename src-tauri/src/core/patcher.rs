use std::path::Path;
use crate::core::registry_writer;

pub fn apply_modern_game_patches(_engine_path: &str, prefix_path: &Path) -> Result<(), String> {
    let keys = vec![
        (r"Software\Wine\Direct3D", "CSMT", "00000001"),
        (r"Software\Wine\Direct3D", "MaxVersionGL", "00040005"),
        (r"Software\Wine\Direct3D", "VideoMemorySize", "8192"),
        (r"Software\Wine", "Version", "win10"),
    ];

    registry_writer::inject_registry_keys(prefix_path, keys)
}

pub fn apply_steam_specific_patches(_engine_path: &str, prefix_path: &Path) -> Result<(), String> {
    let keys = vec![
        (r"Software\Valve\Steam", "H264HWAccel", "00000000"),
        (r"Software\Valve\Steam", "DWriteEnable", "00000000"),
        (r"Software\Valve\Steam", "GPUAccelWebViews", "00000000"),
        (r"Software\Valve\Steam", "SmoothScrollWebViews", "00000000"),
    ];

    registry_writer::inject_registry_keys(prefix_path, keys)
}

pub fn optimize_for_metal(_engine_path: &str, prefix_path: &Path) -> Result<(), String> {
    let keys = vec![
        (r"Software\Wine\DllOverrides", "d3d11", "native"),
        (r"Software\Wine\DllOverrides", "d3d12", "native"),
        (r"Software\Wine\DllOverrides", "dxgi", "native"),
        (r"Software\Wine\DllOverrides", "dwrite", "disabled"),
    ];

    registry_writer::inject_registry_keys(prefix_path, keys)
}