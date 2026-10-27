---
name: ctf-reverse
description: >
  CTF reverse-engineering workflow — ELF/PE/Mach-O triage, static & dynamic
  analysis, decompilation, anti-debug/packers, and common key-check patterns.
  Use for crackmes and "find the flag inside the binary" challenges.
---

# CTF Reverse Engineering Workflow

## 1. Triage — `ctf_reverse`
One call gives: file/arch, checksec, symbols (nm), imports, interesting strings
(flag/password/system), packer detection, and an r2 function list + `main`
disassembly. Also flags Python `.pyc` and .NET assemblies.

## 2. Low-hanging fruit
- `strings -n 6 file | grep -i flag` (the triage already does a filtered pass).
- Hardcoded comparison string → that *is* the flag or the password.
- `ltrace ./bin` / `strace ./bin` to watch `strcmp`, `memcmp`, syscalls.

## 3. Static analysis
- **Ghidra** (headless): `analyzeHeadless proj -import bin -postScript Decompile`.
  Best free decompiler; read the key-check function.
- **`ctf_disasm`**: read one function/address (`target=main` or `0x401234`)
  without dumping the whole binary (radare2, else objdump).
- **radare2/Cutter**: `r2 -A bin; afl; pdf @ main; VV` for the call graph.
- **objdump -d -M intel bin** for a quick disasm.
Look for the routine that compares your input to a target; reverse the transform.

## 4. Dynamic analysis
- **gdb** (pwndbg/gef): break at the compare, inspect registers/memory.
  `b *main+NNN; run; x/s $rsi` to dump the expected string.
- Patch a conditional jump (`jz`→`jmp`/`nop`) to bypass a check, then read output.
- `ltrace -e strcmp` often reveals the password in one line.

## 5. Special targets
- **Packed (UPX)**: `upx -d bin -o unpacked` then re-triage.
- **Python .pyc**: `decompyle3 file.pyc` / `pycdc`. If the magic is stripped,
  prepend the correct magic bytes for the Python version.
- **.NET**: ILSpy / dnSpy / `ilspycmd file.dll` — strings and the check method.
- **Go/Rust**: huge static binaries; use symbol recovery (`GoReSym`), focus on
  `main.main`. Strings are length-prefixed, not NUL-terminated.
- **Anti-debug**: `ptrace(PTRACE_TRACEME)`, timing checks — patch or `LD_PRELOAD`.

## 6. Common key-check patterns
- Byte-by-byte compare with a constant table → read the table.
- XOR/add/sub transform of input vs constant → invert it (use `ctf_crypto_xor`).
- Checksum/hash of input == constant → brute or reverse the hash space.
- VM / custom bytecode interpreter → reconstruct the opcode table, then the program.

Use `ctf_run` for any tool above, and `ctf_extract_flags` on recovered strings.
If the binary takes input and crashes/leaks, switch to the **ctf-pwn** skill.
