#[cfg(test)]
mod tests {
    use crate::wine::runner::get_wine_runners;
    use crate::bottle::template::BottleTemplate;
    use crate::wine::registry::RegistryManager;
    use crate::gptk::d3dmetal::D3DMetalManager;
    use crate::wine::steam::SteamLauncher;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_critical_path_logic() {
        // 1. Test Wine Detection (M1)
        let runners = get_wine_runners().await.unwrap();
        println!("Detected {} runners", runners.len());

        // 2. Test Template System (M3)
        let steam_template = BottleTemplate::steam_gaming();
        assert_eq!(steam_template.id, "steam_gaming");
        assert!(steam_template.env_vars.contains_key("WINEESYNC"));

        // 3. Test Registry Generation (M4)
        let reg_content = RegistryManager::generate_reg_file(&steam_template.registry_entries);
        assert!(reg_content.contains("Windows Registry Editor Version 5.00"));
        assert!(reg_content.contains(r"Software\Valve\Steam"));

        // 4. Test D3DMetal Detection (M6)
        let libs = D3DMetalManager::detect();
        println!("D3DMetal libs detected: {:?}", libs);

        // 5. Test Steam Status (M9)
        let temp_bottle = tempdir().unwrap();
        let status = SteamLauncher::check_status(temp_bottle.path());
        assert_eq!(status.is_installed, false);
    }
}
