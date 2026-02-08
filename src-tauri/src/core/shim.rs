use std::collections::HashMap;

/// The "Pancho Shim" Registry Parser
/// Bypasses wineserver by reading the system.reg and user.reg files directly
pub struct NativeRegistry {
    pub values: HashMap<String, String>,
}

impl NativeRegistry {
    pub fn new(prefix_path: &std::path::Path) -> Self {
        let mut values = HashMap::new();
        let user_reg = prefix_path.join("user.reg");
        
        if let Ok(content) = std::fs::read_to_string(user_reg) {
            let mut current_key = String::new();
            for line in content.lines() {
                if line.starts_with('[') && line.ends_with(']') {
                    current_key = line[1..line.len()-1].to_string();
                } else if line.contains('=') {
                    let parts: Vec<&str> = line.splitn(2, '=').collect();
                    let key = format!("{}\\{}", current_key, parts[0].trim_matches('"'));
                    values.insert(key, parts[1].to_string());
                }
            }
        }
        NativeRegistry { values }
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.values.get(key)
    }
}

/// The System Call Bridge
/// This will eventually be compiled into a .dylib and injected
pub fn translate_sys_call(call_id: u32) -> &'static str {
    match call_id {
        0x1 => "NtCreateProcess",
        0x2 => "NtTerminateProcess",
        // Map to native Mach ports
        _ => "Unknown",
    }
}

