import * as fs from 'fs'
import { textTool, ToolFactory } from '../util/tool'
import { runPyHelper, hasTool, safeExec, section, pluginFile, missingTools } from '../util'

export const extraTools: ToolFactory = (ctx) => [
  /* ---------------- AES / block cipher ---------------- */
  textTool(ctx, {
    name: 'ctf_crypto_aes',
    category: 'crypto',
    description:
      'AES / block-cipher helper: detect ECB (repeated blocks), raw encrypt/decrypt (ECB/CBC/CTR with key+iv), and CBC bit-flip editing. Use for symmetric-crypto challenges. For padding/ECB oracles, script the oracle with ctf_run (the ctf-crypto skill explains).',
    parameters: {
      op: { type: 'string', required: true, description: 'detect | enc | dec | flip' },
      data: { type: 'string', required: true, description: 'Ciphertext/plaintext as hex (or base64 with b64=true)' },
      b64: { type: 'boolean', required: false, description: 'Input is base64' },
      key: { type: 'string', required: false, description: 'Key (hex 0x.. or ascii)' },
      iv: { type: 'string', required: false, description: 'IV (hex or ascii)' },
      mode: { type: 'string', required: false, description: 'ecb | cbc | ctr (default cbc)' },
      block: { type: 'number', required: false, description: 'flip: target plaintext block index' },
      pos: { type: 'number', required: false, description: 'flip: byte position in block' },
      old: { type: 'string', required: false, description: 'flip: known current plaintext byte (hex)' },
      new: { type: 'string', required: false, description: 'flip: desired plaintext byte (hex)' },
    },
    execute(args) {
      const a: string[] = [String(args.op), '--data', String(args.data)]
      if (args.b64) a.push('--b64')
      if (args.key) a.push('--key', String(args.key))
      if (args.iv) a.push('--iv', String(args.iv))
      if (args.mode) a.push('--mode', String(args.mode))
      if (args.block != null) a.push('--block', String(args.block))
      if (args.pos != null) a.push('--pos', String(args.pos))
      if (args.old) a.push('--old', String(args.old))
      if (args.new) a.push('--new', String(args.new))
      return runPyHelper('aes_tools.py', a, { timeoutMs: 20000 })
    },
  }),

  /* ---------------- hash cracking ---------------- */
  textTool(ctx, {
    name: 'ctf_crack_hash',
    category: 'crypto',
    description:
      'Identify and crack a password hash. Detects the type, then runs hashcat (preferred) or John with a wordlist (bundled common.txt, or pass a bigger one like rockyou). Returns the plaintext if cracked. For authorised challenges only.',
    parameters: {
      hash: { type: 'string', required: true, description: 'The hash (or a path to a file of hashes with is_file)' },
      is_file: { type: 'boolean', required: false, description: 'Treat hash as a path to a hash file' },
      wordlist: { type: 'string', required: false, description: 'Wordlist path (defaults to bundled common.txt; use rockyou for real cracking)' },
      mode: { type: 'string', required: false, description: 'Explicit hashcat -m mode (skips auto-detect)' },
    },
    execute(args) {
      const idOut = runPyHelper('hash_id.py', [String(args.hash)])
      const wl = args.wordlist || pluginFile('wordlists', 'common.txt') || ''
      if (!wl || !fs.existsSync(wl)) return `${idOut}\n\n[!] No wordlist available — pass wordlist=.`
      const hashFile = args.is_file ? String(args.hash) : (() => {
        const f = `/tmp/ctfhash_${Date.now()}.txt`
        fs.writeFileSync(f, String(args.hash).trim() + '\n')
        return f
      })()
      let crackOut = ''
      if (hasTool('hashcat') && args.mode) {
        crackOut = safeExec(`hashcat -m ${args.mode} -a 0 "${hashFile}" "${wl}" --quiet --potfile-disable 2>&1 | tail -10; echo '--- show ---'; hashcat -m ${args.mode} --show "${hashFile}" "${wl}" 2>/dev/null`, { timeoutMs: 90000, tolerateFail: true })
      } else if (hasTool('john')) {
        crackOut = safeExec(`john --wordlist="${wl}" "${hashFile}" 2>&1 | tail -10; echo '--- cracked ---'; john --show "${hashFile}" 2>/dev/null`, { timeoutMs: 90000, tolerateFail: true })
      } else {
        crackOut = 'Neither hashcat nor john installed. Install one; or try https://crackstation.net for common hashes.'
      }
      if (!args.is_file) safeExec(`rm -f "${hashFile}"`)
      return `${section('identify', idOut)}\n\n${section('crack', crackOut)}`
    },
  }),

  /* ---------------- QR / barcode ---------------- */
  textTool(ctx, {
    name: 'ctf_qr',
    category: 'misc',
    description:
      'Decode QR codes and barcodes from an image with zbarimg, and scan the decoded payload for flags. Use when a challenge image contains a QR/barcode.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the image' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      if (!hasTool('zbarimg')) return 'zbarimg not installed (apt install zbar-tools). Online: zxing.org, or python `pyzbar`.'
      const out = safeExec(`zbarimg -q --raw "${p}" 2>&1`, { tolerateFail: true })
      return out.trim() ? section('decoded', out) : 'No QR/barcode detected. Try cleaning/thresholding the image first, or it may be a partial/damaged code to reconstruct.'
    },
  }),

  /* ---------------- USB HID from pcap ---------------- */
  textTool(ctx, {
    name: 'ctf_pcap_usb',
    category: 'forensics',
    description:
      'Decode USB HID keyboard keystrokes from a pcap/pcapng into the typed text (handles shift & backspace) and scans for a flag. Use for USB-capture forensics challenges.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the USB capture (.pcap/.pcapng)' },
    },
    execute(args) {
      if (!fs.existsSync(args.path)) return `File not found: ${args.path}`
      if (!hasTool('tshark')) return 'tshark not installed (apt install tshark).'
      return runPyHelper('usb_hid.py', [String(args.path)], { timeoutMs: 60000 })
    },
  }),

  /* ---------------- memory forensics ---------------- */
  textTool(ctx, {
    name: 'ctf_memory',
    category: 'forensics',
    description:
      'Memory-image forensics with Volatility 3. Runs a plugin (default: triage set — pslist, cmdline). Pass plugin= for a specific one (windows.filescan, windows.hashdump, windows.netscan, linux.bash, etc.). Use for RAM-dump challenges.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the memory image' },
      plugin: { type: 'string', required: false, description: 'Volatility3 plugin, e.g. windows.pslist (default runs pslist + cmdline)' },
      args: { type: 'string', required: false, description: 'Extra args for the plugin, e.g. "--pid 1234"' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const vol = hasTool('vol') ? 'vol' : hasTool('vol.py') ? 'vol.py' : hasTool('volatility3') ? 'volatility3' : ''
      if (!vol) return 'Volatility3 not installed (pipx install volatility3, then `vol`). For Volatility2 use `ctf_run`.'
      const extra = args.args ? ` ${args.args}` : ''
      if (args.plugin) {
        return section(String(args.plugin), safeExec(`${vol} -f "${p}" ${args.plugin}${extra} 2>&1 | head -120`, { timeoutMs: 120000, tolerateFail: true }))
      }
      const ps = safeExec(`${vol} -f "${p}" windows.pslist 2>&1 | head -60`, { timeoutMs: 120000, tolerateFail: true })
      const cl = safeExec(`${vol} -f "${p}" windows.cmdline 2>&1 | head -60`, { timeoutMs: 120000, tolerateFail: true })
      return `${section('windows.pslist', ps)}\n\n${section('windows.cmdline', cl)}\n\nNext: windows.filescan + dumpfiles, windows.hashdump, windows.netscan, or linux.* for Linux dumps.`
    },
  }),

  /* ---------------- python jail ---------------- */
  textTool(ctx, {
    name: 'ctf_pyjail',
    category: 'misc',
    description:
      'Generate Python-jail escape payloads that avoid a given blacklist, plus char-construction helpers to rebuild banned words. Use for pyjail / sandbox-escape challenges.',
    parameters: {
      blacklist: { type: 'string', required: false, description: 'Banned substrings, comma/space separated (e.g. "import,os,eval,exec")' },
      goal: { type: 'string', required: false, description: 'shell | read | rce (default shell)' },
      encode: { type: 'string', required: false, description: 'Instead: show how to build this string without letters, e.g. "os"' },
    },
    execute(args) {
      const a: string[] = []
      if (args.encode) a.push('--encode', String(args.encode))
      else {
        if (args.blacklist) a.push('--blacklist', String(args.blacklist))
        if (args.goal) a.push('--goal', String(args.goal))
      }
      return runPyHelper('pyjail_gen.py', a, { timeoutMs: 15000 })
    },
  }),

  /* ---------------- targeted disassembly ---------------- */
  textTool(ctx, {
    name: 'ctf_disasm',
    category: 'reverse',
    description:
      'Disassemble a specific function or address in a binary (radare2 if present, else objdump). Use to read one routine (e.g. the key check) without dumping the whole binary.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the binary' },
      target: { type: 'string', required: false, description: 'Symbol (e.g. main) or address (0x401234). Default: main' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const target = args.target ? String(args.target) : 'main'
      if (hasTool('r2') || hasTool('radare2')) {
        const r2 = hasTool('r2') ? 'r2' : 'radare2'
        const at = /^0x/.test(target) ? `@ ${target}` : `@ sym.${target}`
        const out = safeExec(`${r2} -q -c 'aaa; pdf ${at}' "${p}" 2>/dev/null | head -150`, { timeoutMs: 40000, tolerateFail: true })
        if (out.trim()) return section(`r2 pdf ${target}`, out)
      }
      // objdump fallback: grab the function block between its label and the next
      const dump = safeExec(`objdump -d -M intel "${p}" 2>/dev/null | awk '/<${target}>:/{f=1} f{print} f&&/^$/{exit}' | head -150`, { timeoutMs: 30000, tolerateFail: true })
      return dump.trim() ? section(`objdump ${target}`, dump) : `Could not disassemble ${target}. Try an address, or install radare2.`
    },
  }),

  /* ---------------- bit-plane export ---------------- */
  textTool(ctx, {
    name: 'ctf_stego_planes',
    category: 'forensics',
    description:
      'Export each colour channel bit-plane of an image to black/white PNGs (StegSolve-style) for visual inspection, and scan any that decode as QR. Use when LSB tools find nothing but the flag may be drawn in a bit plane.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the image' },
      outdir: { type: 'string', required: false, description: 'Output directory (default <image>_planes)' },
      planes: { type: 'string', required: false, description: 'Comma list of bit indices to export (default 0,1,2,7)' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const a = [p]
      if (args.outdir) a.push(String(args.outdir))
      if (args.planes) a.push(`--planes=${args.planes}`)
      const out = runPyHelper('stego_planes.py', a, { timeoutMs: 40000 })
      // if zbarimg present, try to read QR out of bit0 planes
      let qr = ''
      const dir = args.outdir || p.replace(/\.[^.]+$/, '') + '_planes'
      if (hasTool('zbarimg') && fs.existsSync(dir)) {
        const scan = safeExec(`for f in "${dir}"/plane_*_bit0.png; do zbarimg -q --raw "$f" 2>/dev/null; done`, { tolerateFail: true })
        if (scan.trim()) qr = '\n\n' + section('QR in planes', scan)
      }
      return out + qr
    },
  }),
]
