---
name: ctf-pwn
description: >
  CTF binary-exploitation (pwn) workflow — stack overflows, ROP, format strings,
  GOT overwrite, ret2libc/ret2system, heap (tcache/fastbin), with pwntools. Use
  when a binary reads input and you must get a shell or leak the flag.
---

# CTF Pwn Workflow

## 1. Recon — `ctf_pwn_recon`
Gives checksec, GOT/PLT, key ROP gadgets (pop rdi/rsi/rdx, ret, syscall,
/bin/sh), one_gadget offsets, and libc version id (pass `libc=`). Read the
protections FIRST — they dictate the technique:

| Protection | Implication |
|---|---|
| No canary | straight stack smash to RIP |
| Canary | need a leak (format string / partial overwrite) first |
| NX | no shellcode on stack → ROP / ret2libc |
| No PIE | fixed addresses, easy ROP |
| PIE | need an address leak to defeat ASLR |
| Full RELRO | can't overwrite GOT |

## 2. Scaffold — `ctf_pwn_template`
Writes a pwntools `exploit.py` (local/remote toggle, libc loading, ROP helpers,
GDB script). Edit the prompt string and offset, then iterate.

## 3. Find the offset
`cyclic 200` → feed it → crash → `cyclic_find(<value in RIP/RSP>)` (or in GDB,
read the faulting address). That's your padding to RIP.

## 4. Pick the technique
- **ret2win**: a `win()`/`get_flag()` function exists → overwrite RIP with it
  (mind stack alignment: add a bare `ret` gadget before the call on x86-64).
- **ret2system / ret2libc**: `pop rdi; ret` → `"/bin/sh"` → `system`. If no
  `/bin/sh`, leak libc (puts(puts@got) → ret2main), resolve base, then
  `system("/bin/sh")` or a `one_gadget`.
- **GOT overwrite**: Partial/Full RELRO off → overwrite a GOT entry (e.g. with a
  format-string `%n`) to redirect a call.
- **Format string**: leak stack/canary/libc with `%p`/`%N$p`; arbitrary write
  with `%N$n` / `fmtstr_payload()`.
- **Shellcode**: only if NX is off and the buffer is executable.

## 5. Heap (glibc)
- **tcache poisoning**: double-free or UAF → overwrite fd → allocate onto an
  arbitrary address (watch tcache key & pointer mangling on glibc ≥2.32).
- **fastbin dup**, **unsorted-bin leak** (main_arena → libc base), **House of**
  techniques for modern glibc. Identify glibc version first — behaviour differs.

## 6. Libc identification
Leak a known symbol (e.g. `puts`), then https://libc.rip or `libc-database`:
`./find puts <leaked-last-3-hex>`. Set `libc.address = leak - libc.sym['puts']`.

## 7. Drive the exploit
Use `ctf_run` to launch pwntools against the remote:
`python3 exploit.py REMOTE` (your template reads HOST/PORT). After a shell:
`cat flag*; ls -la`. Then `ctf_extract_flags` on the output.
