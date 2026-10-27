import * as fs from 'fs'
import * as path from 'path'
import { textTool, ToolFactory } from '../util/tool'
import { safeExec, hasTool, section, missingTools, cap } from '../util'

export const binaryTools: ToolFactory = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_reverse — triage a binary for reversing.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_reverse',
    category: 'reverse',
    description:
      'Triage a binary for reverse engineering: file/arch, checksec protections, symbols & imports, interesting strings (flag/password/system), packer detection (UPX), and an r2 function list + main disassembly if radare2 is present. Detects Python (.pyc) and .NET too. Use on ELF/PE/Mach-O reversing challenges.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the binary' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const ft = safeExec(`file "${p}"`, { tolerateFail: true })
      const parts: string[] = [section('file', ft)]
      const low = ft.toLowerCase()

      if (/python .* byte-compiled|\.pyc/.test(low) || p.endsWith('.pyc')) {
        parts.push(section('Python bytecode', 'Decompile with: `pip install decompyle3 uncompyle6` then `decompyle3 file.pyc`, or use pycdc. If magic header is stripped, prepend the correct magic for the Python version.'))
      }
      if (/\.net|mono|assembly/.test(low)) {
        parts.push(section('.NET assembly', 'Decompile with ILSpy / dnSpy / `ilspycmd file.dll`. Look for hardcoded strings and the key-check method.'))
      }

      if (hasTool('checksec')) parts.push(section('checksec', safeExec(`checksec --file="${p}" 2>&1`, { tolerateFail: true })))
      else parts.push(section('checksec', 'not installed (pip install pwntools gives checksec, or apt install checksec)'))

      parts.push(section('symbols (nm, first 40)', safeExec(`nm "${p}" 2>/dev/null | head -40 || echo '(stripped or no symbols)'`, { tolerateFail: true })))
      parts.push(section('imports (objdump -T / dynamic)', safeExec(`objdump -T "${p}" 2>/dev/null | head -30 || echo '(none)'`, { tolerateFail: true })))
      parts.push(section('interesting strings', safeExec(`strings -n 5 "${p}" | grep -iE 'flag|pass|secret|key|system|/bin/sh|cat |token|admin' | head -40`, { tolerateFail: true }) || '(none)'))

      const upx = safeExec(`strings "${p}" | grep -i UPX! | head -1`, { tolerateFail: true })
      if (upx.trim()) parts.push(section('packer', `Looks UPX-packed. Unpack: \`upx -d "${p}" -o unpacked\``))

      if (hasTool('r2') || hasTool('radare2')) {
        const r2 = hasTool('r2') ? 'r2' : 'radare2'
        parts.push(section('r2 functions (aflq)', safeExec(`${r2} -q -c 'aaa; aflq' "${p}" 2>/dev/null | head -50`, { timeoutMs: 40000, tolerateFail: true })))
        parts.push(section('r2 main disasm', safeExec(`${r2} -q -c 'aaa; pdf @ main' "${p}" 2>/dev/null | head -80`, { timeoutMs: 40000, tolerateFail: true })))
      } else {
        parts.push(section('disassembly', 'radare2 not installed. Use Ghidra (headless: analyzeHeadless), or `objdump -d -M intel file | less`. For a quick look: `gdb -batch -ex "disassemble main" file`.'))
      }

      const miss = missingTools(['checksec', 'r2', 'objdump', 'nm'])
      if (miss.length) parts.push(section('missing tools', miss.join(', ')))
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_pwn_recon — exploitation recon.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_pwn_recon',
    category: 'pwn',
    description:
      'Binary-exploitation recon: checksec, GOT/PLT entries, useful ROP gadgets (ROPgadget/ropper: pop rdi, ret, syscall, /bin/sh), one_gadget RCE offsets if a libc is given, and libc version identification. Use on pwn binaries before writing an exploit.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the vulnerable binary' },
      libc: { type: 'string', required: false, description: 'Path to the provided libc.so (enables one_gadget + version id)' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const parts: string[] = []
      if (hasTool('checksec')) parts.push(section('checksec', safeExec(`checksec --file="${p}" 2>&1`, { tolerateFail: true })))
      parts.push(section('GOT/PLT', safeExec(`objdump -R "${p}" 2>/dev/null | head -30 || echo '(no relocations / static)'`, { tolerateFail: true })))

      if (hasTool('ROPgadget')) {
        const g = safeExec(`ROPgadget --binary "${p}" 2>/dev/null`, { timeoutMs: 40000, tolerateFail: true })
        const want = ['pop rdi ; ret', 'pop rsi ; ret', 'pop rdx ; ret', ': ret', 'syscall', '/bin/sh']
        const picked = g.split('\n').filter((l) => want.some((w) => l.includes(w))).slice(0, 40)
        parts.push(section('ROP gadgets (key)', picked.join('\n') || '(none of the usual gadgets found — dump all with `ROPgadget --binary file`)'))
      } else if (hasTool('ropper')) {
        parts.push(section('ropper', safeExec(`ropper --file "${p}" --search "pop rdi" 2>/dev/null | head -20`, { timeoutMs: 40000, tolerateFail: true })))
      } else {
        parts.push(section('ROP', 'ROPgadget/ropper not installed (pip install ropgadget ropper).'))
      }

      if (args.libc && fs.existsSync(args.libc)) {
        parts.push(section('libc version', safeExec(`strings "${args.libc}" | grep -iE 'glibc|GNU C Library' | head -3`, { tolerateFail: true })))
        if (hasTool('one_gadget')) parts.push(section('one_gadget', safeExec(`one_gadget "${args.libc}" 2>/dev/null | head -40`, { timeoutMs: 40000, tolerateFail: true })))
        else parts.push(section('one_gadget', 'not installed (gem install one_gadget) — gives magic execve("/bin/sh") offsets.'))
        parts.push(section('libc offsets hint', 'Leak a libc symbol (e.g. puts@GOT), then use https://libc.rip or `libc-database` to identify, and compute base = leak - libc.sym[name].'))
      }
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_pwn_template — generate a pwntools exploit skeleton file.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_pwn_template',
    category: 'pwn',
    description:
      'Generate a ready-to-edit pwntools exploit skeleton (local/remote toggle, libc loading, ROP helpers, send/recv wrappers, GDB script) and write it to a file. Use to start a pwn exploit quickly.',
    parameters: {
      binary: { type: 'string', required: false, description: 'Binary name/path (default ./chall)' },
      host: { type: 'string', required: false, description: 'Remote host' },
      port: { type: 'number', required: false, description: 'Remote port' },
      libc: { type: 'string', required: false, description: 'libc path to load' },
      out: { type: 'string', required: false, description: 'Output path (default ./exploit.py)' },
    },
    execute(args) {
      const bin = args.binary || './chall'
      const host = args.host || 'HOST'
      const port = args.port || 1337
      const libc = args.libc || ''
      const out = args.out || path.join(ctx?.bash?.cwd || process.cwd(), 'exploit.py')
      const tpl = pwntoolsTemplate(bin, host, String(port), libc)
      try {
        fs.writeFileSync(out, tpl, 'utf-8')
        fs.chmodSync(out, 0o755)
      } catch (e: any) {
        return `Could not write ${out}: ${e.message}\n\n${cap(tpl, 6000)}`
      }
      return `Exploit skeleton written to ${out}\n\n${cap(tpl, 4000)}`
    },
  }),
]

function pwntoolsTemplate(bin: string, host: string, port: string, libc: string): string {
  const libcLine = libc ? `libc = ELF("${libc}", checksec=False)` : `libc = exe.libc`
  return `#!/usr/bin/env python3
from pwn import *

exe = context.binary = ELF("${bin}", checksec=False)
${libcLine}
context.terminal = ["tmux", "splitw", "-h"]

HOST, PORT = "${host}", ${port}

gdbscript = """
# break *main
# break *0x401234
continue
"""

def start():
    if args.REMOTE:
        return remote(HOST, PORT)
    if args.GDB:
        return gdb.debug([exe.path], gdbscript=gdbscript)
    return process([exe.path])

# --- helpers ---
def send_payload(io, payload):
    io.sendlineafter(b">", payload)  # adjust the prompt

io = start()

# === recon notes ===
# checksec: run ctf_pwn_recon first.
# offset to RIP: cyclic(200) -> crash -> cyclic_find(leak)
offset = 40

rop = ROP(exe)
# Example: leak libc via puts(puts@got), return to main, then one_gadget / system("/bin/sh")
# rop.raw(rop.find_gadget(["ret"]))       # stack align
# rop.puts(exe.got["puts"])
# rop.call(exe.sym["main"])

payload  = flat({
    offset: [
        # rop.chain(),
    ]
})

# send_payload(io, payload)
# io.recvline()
# leak = u64(io.recvline().strip().ljust(8, b"\\x00"))
# libc.address = leak - libc.sym["puts"]
# log.success(f"libc base: {hex(libc.address)}")

io.interactive()
`
}
