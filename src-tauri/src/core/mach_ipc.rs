use mach2::port::*;
use mach2::traps::*;
use mach2::mach_port::mach_port_allocate;
use mach2::kern_return::KERN_SUCCESS;

pub struct MachBroker {
    server_port: mach_port_t,
}

impl MachBroker {
    pub fn new() -> Result<Self, String> {
        let mut port: mach_port_t = MACH_PORT_NULL;
        unsafe {
            let res = mach_port_allocate(
                mach_task_self(),
                MACH_PORT_RIGHT_RECEIVE,
                &mut port,
            );
            if res != KERN_SUCCESS {
                return Err(format!("Failed to allocate Mach port: {}", res));
            }
        }
        Ok(MachBroker { server_port: port })
    }

    pub fn start_listening(&self) {
        println!("Pancho-Mach: Broker listening on port {}", self.server_port);
    }
}

pub fn create_shared_memory_region(size: usize) -> Result<*mut libc::c_void, String> {
    unsafe {
        let mut addr: u64 = 0;
        let res = mach2::vm::mach_vm_allocate(
            mach2::traps::mach_task_self(),
            &mut addr as *mut u64,
            size as u64,
            mach2::vm_statistics::VM_FLAGS_ANYWHERE,
        );

        if res != KERN_SUCCESS {
            return Err(format!("Mach VM allocation failed: {}", res));
        }

        Ok(addr as *mut libc::c_void)
    }
}