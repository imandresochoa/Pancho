use goblin::pe::PE;
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct ExecutableInfo {
    pub path: String,
    pub machine: String,
    pub entry_point: u64,
    pub sections: usize,
    pub is_64_bit: bool,
}

pub fn load_executable(path_str: &str) -> Result<ExecutableInfo, String> {
    let path = Path::new(path_str);
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    match PE::parse(&buffer) {
        Ok(pe) => {
            let machine = match pe.header.coff_header.machine {
                0x8664 => "x86_64",
                0x014c => "x86",
                _ => "Unknown",
            };

            Ok(ExecutableInfo {
                path: path_str.to_string(),
                machine: machine.to_string(),
                entry_point: pe.entry as u64,
                sections: pe.sections.len(),
                is_64_bit: pe.is_64,
            })
        },
        Err(e) => Err(format!("Failed to parse PE file: {}", e)),
    }
}
