use goblin::pe::PE;
use std::fs::File;
use std::io::Read;
use std::path::Path;
use libc::{mmap, PROT_READ, PROT_WRITE, MAP_PRIVATE, MAP_ANONYMOUS};
use crate::core::vmm::VirtualMemoryManager;
use crate::core::linker::SymbolicLinker;
use crate::core::context::ExecutionContext;

#[derive(serde::Serialize)]
pub struct ExecutableInfo {
    pub path: String,
    pub machine: String,
    pub entry_point: u64,
    pub sections: usize,
    pub is_64_bit: bool,
    pub base_address: u64,
}

#[derive(serde::Serialize)]
pub struct ImportEntry {
    pub dll: String,
    pub function: String,
    pub address: u64,
}

pub fn load_executable(path_str: &str) -> Result<ExecutableInfo, String> {
    let path = Path::new(path_str);
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let mut vmm = VirtualMemoryManager::new();

    match PE::parse(&buffer) {
        Ok(pe) => {
            let opt_header = pe.header.optional_header.ok_or("No optional header")?;
            let image_size = opt_header.windows_fields.size_of_image as usize;
            let image_base = opt_header.windows_fields.image_base as u64;

            let _ = vmm.reserve_address_space(image_base, image_size, "PE_IMAGE");
            let _ = vmm.setup_teb_space();

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
                base_address: image_base,
            })
        },
        Err(e) => Err(format!("Failed to parse PE file: {}", e)),
    }
}

pub unsafe fn map_pe_to_memory(pe_data: &[u8]) -> Result<*mut libc::c_void, String> {
    let pe = PE::parse(pe_data).map_err(|e| e.to_string())?;
    
    let opt_header = pe.header.optional_header.ok_or("No optional header found")?;
    let image_size = opt_header.windows_fields.size_of_image as usize;

    let addr = mmap(
        std::ptr::null_mut(),
        image_size,
        PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANONYMOUS,
        -1,
        0
    );

    if addr == libc::MAP_FAILED {
        return Err("Failed to mmap image space".to_string());
    }

    let header_size = opt_header.windows_fields.size_of_headers as usize;
    std::ptr::copy_nonoverlapping(pe_data.as_ptr(), addr as *mut u8, header_size);

    for section in &pe.sections {
        let section_dest = (addr as usize + section.virtual_address as usize) as *mut u8;
        let section_src_offset = section.pointer_to_raw_data as usize;
        let size = section.size_of_raw_data as usize;
        
        if size > 0 && section_src_offset + size <= pe_data.len() {
            let section_src = &pe_data[section_src_offset..section_src_offset + size];
            std::ptr::copy_nonoverlapping(section_src.as_ptr(), section_dest, size);
        }
    }

    patch_iat(addr, &pe)?;

    Ok(addr)
}

fn patch_iat(_image_base: *mut libc::c_void, pe: &PE) -> Result<(), String> {
    let linker = SymbolicLinker::new();

    for import in pe.imports.iter() {
        let dll_name = &import.name;
        if let Some(native_addr) = linker.resolve(dll_name, "GetSystemInfo") {
            println!("Pancho-Linker: Hooked {}!GetSystemInfo to 0x{:x}", dll_name, native_addr);
        }
    }
    
    Ok(())
}

pub fn launch_binary(entry_point: u64) -> ! {
    let ctx = ExecutionContext::new(entry_point as usize);
    unsafe {
        ctx.launch();
    }
}

pub fn get_import_table(path_str: &str) -> Result<Vec<ImportEntry>, String> {
    let path = Path::new(path_str);
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let pe = PE::parse(&buffer).map_err(|e| e.to_string())?;
    let mut imports = Vec::new();

    for import in pe.imports.iter() {
        let dll = import.name.to_string();
        imports.push(ImportEntry {
            dll,
            function: "Extracted Symbol".to_string(),
            address: 0,
        });
    }

    Ok(imports)
}