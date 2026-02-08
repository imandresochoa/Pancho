use libc::{mmap, PROT_NONE, MAP_PRIVATE, MAP_ANONYMOUS};

pub struct VirtualMemoryManager {
    pub reserved_regions: Vec<MemoryRegion>,
}

#[derive(serde::Serialize, Clone)]
pub struct MemoryRegion {
    pub start: u64,
    pub size: usize,
    pub label: String,
}

impl VirtualMemoryManager {
    pub fn new() -> Self {
        VirtualMemoryManager {
            reserved_regions: Vec::new(),
        }
    }

    /// Reserves a specific address range for the PE image
    /// This is critical for preventing macOS from allocating 
    /// its own libraries in the game's expected memory space.
    pub fn reserve_address_space(&mut self, base: u64, size: usize, label: &str) -> Result<(), String> {
        unsafe {
            let addr = mmap(
                base as *mut libc::c_void,
                size,
                PROT_NONE,
                MAP_PRIVATE | MAP_ANONYMOUS,
                -1,
                0
            );

            if addr == libc::MAP_FAILED {
                return Err(format!("VMM: Failed to reserve {} at 0x{:x}", label, base));
            }

            self.reserved_regions.push(MemoryRegion {
                start: base,
                size,
                label: label.to_string(),
            });

            println!("Pancho-VMM: Reserved {} at 0x{:x} ({} bytes)", label, base, size);
            Ok(())
        }
    }

    /// Set up the TEB (Thread Environment Block) space
    /// Windows apps expect this at a very specific offset in the segment registers
    pub fn setup_teb_space(&mut self) -> Result<u64, String> {
        let teb_size = 4096; // One page for TEB
        let teb_addr = 0x7ff000000000u64; // High address for 64-bit TEB
        self.reserve_address_space(teb_addr, teb_size, "TEB")?;
        Ok(teb_addr)
    }
}
