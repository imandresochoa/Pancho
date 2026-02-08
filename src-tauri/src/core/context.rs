use std::arch::asm;

pub struct ExecutionContext {
    pub entry_point: usize,
    pub stack_base: *mut libc::c_void,
    pub stack_size: usize,
}

impl ExecutionContext {
    pub fn new(entry_point: usize) -> Self {
        let stack_size = 2 * 1024 * 1024; // 2MB stack
        let stack_base = unsafe {
            libc::mmap(
                std::ptr::null_mut(),
                stack_size,
                libc::PROT_READ | libc::PROT_WRITE,
                libc::MAP_PRIVATE | libc::MAP_ANONYMOUS,
                -1,
                0
            )
        };

        ExecutionContext {
            entry_point,
            stack_base,
            stack_size,
        }
    }

    /// THE JUMP: This is the moment of truth where we hand control to the Windows binary.
    /// We use inline assembly to set up the stack and jump.
    /// 
    /// SAFETY: This is extremely dangerous. We are manually manipulating the 
    /// instruction pointer and stack.
    pub unsafe fn launch(&self) -> ! {
        let stack_ptr = (self.stack_base as usize + self.stack_size - 16) as *mut usize;
        let entry = self.entry_point;

        println!("Pancho-Context: JUMPING to entry point 0x{:x}", entry);

        // Windows x64 Calling Convention Setup
        // We clear registers and align the stack to 16 bytes
        asm!(
            "mov rsp, {stack}",   // Set the new stack pointer
            "xor rax, rax",       // Clear registers for a clean state
            "xor rbx, rbx",
            "xor rcx, rcx",
            "xor rdx, rdx",
            "xor rsi, rsi",
            "xor rdi, rdi",
            "xor r8, r8",
            "xor r9, r9",
            "xor r10, r10",
            "xor r11, r11",
            "xor r12, r12",
            "xor r13, r13",
            "xor r14, r14",
            "xor r15, r15",
            "jmp {entry}",        // THE JUMP
            stack = in(reg) stack_ptr,
            entry = in(reg) entry,
            options(noreturn)
        );
    }
}
