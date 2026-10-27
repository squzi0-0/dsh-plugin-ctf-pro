import { execSync } from 'child_process'
import * as fs from 'fs'
import { textTool, ToolFactory } from '../util/tool'
import {
  safeExec,
  hasTool,
  section,
  extractFlags,
  cap,
  shannonEntropy,
  printableRatio,
} from '../util'
import { deepDecode, rotBrute } from '../util/decode'

export const universalTools: ToolFactory = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_triage — the first call for any challenge. Classifies the
   * input (file / blob / url), suggests a category + which skill to
   * load, and surfaces quick wins (flags already present, encodings).
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_triage',
    category: 'meta',
    description:
      'START HERE for any new challenge. Classify a file path, raw text blob, or URL: detect likely CTF category, file type, present encodings, and immediate flag hits, then recommend which ctf_* tool and which skill to load next. Call this before anything else.',
    parameters: {
      input: { type: 'string', required: true, description: 'A file path, a URL, or a raw text/encoded blob' },
      kind: {
        type: 'string',
        required: false,
        description: 'Override auto-detection: one of "file", "url", "text"',
      },
    },
    execute(args) {
      const input: string = args.input
      let kind: string = args.kind || ''
      if (!kind) {
        if (/^https?:\/\//i.test(input)) kind = 'url'
        else if (input.length < 4096 && fs.existsSync(input)) kind = 'file'
        else kind = 'text'
      }
      const out: string[] = [`# CTF Triage\nDetected input kind: **${kind}**`]

      if (kind === 'url') {
        out.push(
          section(
            'Recommendation',
            'Category: **web**. Next: `ctf_web_probe` then load skill `ctf-web`. If a login/param is present, consider `ctf_jwt`, SQLi/SSTI/LFI checks from the web skill.',
          ),
        )
        return out.join('\n\n')
      }

      if (kind === 'file') {
        if (!fs.existsSync(input)) return `File not found: ${input}`
        const buf = fs.readFileSync(input).subarray(0, 1024 * 256)
        const ft = safeExec(`file -b "${input}"`, { tolerateFail: true })
        const ent = shannonEntropy(buf).toFixed(2)
        const pr = (printableRatio(buf) * 100).toFixed(0)
        out.push(section('file', ft))
        out.push(section('stats', `entropy: ${ent} bits/byte (8.0≈encrypted/compressed) | printable: ${pr}%`))

        let cat = 'misc'
        const low = ft.toLowerCase()
        if (/elf|pe32|mach-o|executable|shared object/.test(low)) {
          cat = /not stripped|debug|dynamically/.test(low) ? 'reverse/pwn' : 'reverse/pwn'
          out.push(section('Recommendation', `Category: **${cat}**. Next: \`ctf_reverse\` (and \`ctf_pwn_recon\` if it reads input). Load skill \`ctf-reverse\` / \`ctf-pwn\`.`))
        } else if (/image|png|jpeg|gif|bitmap|tiff/.test(low)) {
          cat = 'forensics/stego'
          out.push(section('Recommendation', `Category: **${cat}**. Next: \`ctf_stego\`. Load skill \`ctf-stego\`.`))
        } else if (/audio|wave|mpeg|flac|ogg/.test(low)) {
          cat = 'stego (audio)'
          out.push(section('Recommendation', `Category: **${cat}**. Inspect spectrogram, LSB. Next: \`ctf_stego\`, load skill \`ctf-stego\`.`))
        } else if (/pcap|tcpdump|capture/.test(low)) {
          cat = 'forensics (network)'
          out.push(section('Recommendation', `Category: **${cat}**. Next: \`ctf_pcap\`. Load skill \`ctf-forensics\`.`))
        } else if (/zip|rar|7-zip|tar|gzip|archive|compress/.test(low)) {
          cat = 'forensics (archive)'
          out.push(section('Recommendation', `Category: **${cat}**. Try extraction; if encrypted use \`ctf_crack_archive\`. Load skill \`ctf-forensics\`.`))
        } else if (/pdf/.test(low)) {
          cat = 'forensics (pdf)'
          out.push(section('Recommendation', `Category: **${cat}**. Next: \`ctf_analyze_file\`, pdf text/objects, \`ctf_crack_archive\` if locked.`))
        } else if (/data|ASCII|UTF-8|Unicode text/.test(ft)) {
          cat = 'crypto/misc (text)'
          const txt = buf.toString('utf-8')
          out.push(section('Recommendation', `Category: **${cat}**. Next: \`ctf_auto_decode\`, \`ctf_crypto_*\`. Load skill \`ctf-crypto\`.`))
          const dd = deepDecode(txt, 3)
          if (dd.flags.length) out.push(section('FLAGS (from quick decode)', dd.flags.join('\n')))
          else if (dd.hits.length) out.push(section('Encodings found', dd.hits.slice(0, 5).map((h) => `${h.path.join('->')}: ${cap(h.value, 160)}`).join('\n')))
        }
        out.push(section('strings (flag-like)', (() => {
          const s = safeExec(`strings -n 6 "${input}" | head -2000`, { tolerateFail: true })
          const fl = extractFlags(s)
          return fl.length ? fl.join('\n') : '(none in strings)'
        })()))
        return out.join('\n\n')
      }

      // text blob
      const fl = extractFlags(input)
      if (fl.length) out.push(section('FLAGS (literal)', fl.join('\n')))
      const dd = deepDecode(input, 4)
      if (dd.flags.length) out.push(section('FLAGS (after decoding)', dd.flags.join('\n')))
      if (dd.hits.length)
        out.push(section('Decode chains found', dd.hits.slice(0, 8).map((h) => `${h.path.join(' -> ')}: ${cap(h.value, 200)}`).join('\n')))
      out.push(
        section(
          'Recommendation',
          dd.hits.length
            ? 'Encodings detected — run `ctf_auto_decode` for the full tree, then `ctf_crypto_*` if a cipher is involved. Load skill `ctf-crypto`.'
            : 'No standard encoding matched. Likely a cipher or custom crypto — load skill `ctf-crypto`, try `ctf_crypto_xor`, `ctf_crypto_classical`, frequency analysis.',
        ),
      )
      return out.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_auto_decode — deep recursive multi-codec decoder.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_auto_decode',
    category: 'crypto',
    description:
      'Deep, RECURSIVE multi-codec decoder. Tries Base64/32/58/85, hex, binary, decimal, octal, URL, Morse, gzip/zlib, ROT-N and Atbash, chaining them automatically (e.g. base64->hex->gzip). Returns every readable result plus any flags found. Use on any encoded-looking string when unsure of the encoding.',
    parameters: {
      data: { type: 'string', required: true, description: 'The string to decode' },
      max_depth: { type: 'number', required: false, description: 'Max chained decode depth (default 4)' },
    },
    execute(args) {
      const depth = Math.min(Math.max(+args.max_depth || 4, 1), 6)
      const { hits, flags } = deepDecode(args.data, depth)
      const parts: string[] = []
      if (flags.length) parts.push(section('🚩 FLAGS', flags.join('\n')))
      if (hits.length) {
        const lines = hits
          .sort((a, b) => a.depth - b.depth)
          .map((h) => `[depth ${h.depth}] ${h.path.join(' -> ')}\n    ${cap(h.value, 400)}`)
        parts.push(section('Decode chains', lines.join('\n')))
      }
      const rb = rotBrute(args.data).filter((l) => l.includes('<--'))
      if (rb.length) parts.push(section('ROT/Atbash hits', rb.join('\n')))
      if (!parts.length) return 'No successful decoding found. Consider XOR, a classical cipher, or custom crypto (ctf_crypto_xor / ctf_crypto_classical).'
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_extract_flags — flag regex over text or a file.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_extract_flags',
    category: 'meta',
    description:
      'Search for flag patterns (flag{...}, CTF{...}, picoCTF{...}, and any PREFIX{...}) in a string or file. Pass a custom prefix for competition-specific formats (e.g. "KUBSTU", "CSSCTF"). Use after decoding or analysing data.',
    parameters: {
      input: { type: 'string', required: true, description: 'Text to search, or a file path' },
      is_file: { type: 'boolean', required: false, description: 'Treat input as a file path' },
      prefix: { type: 'string', required: false, description: 'Extra flag prefix to match, e.g. KUBSTU' },
    },
    execute(args) {
      let text = args.input
      if (args.is_file) {
        if (!fs.existsSync(text)) return 'File not found.'
        // read as latin1 so binary files still yield ascii flags
        text = fs.readFileSync(text).toString('latin1')
      }
      const extra = args.prefix ? [String(args.prefix)] : []
      const found = extractFlags(text, extra)
      return found.length ? found.join('\n') : 'No flag pattern found.'
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_run — arbitrary shell command for CTF tooling.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_run',
    category: 'meta',
    description:
      'Execute a shell command for CTF analysis (zsteg, steghide, sage, john, hashcat, nc, python, radare2, etc.). Use ONLY for CTF-related work on challenges/targets you are authorised to analyse. Output is length-capped. For long-running network interaction prefer a script.',
    parameters: {
      command: { type: 'string', required: true, description: 'The command to run' },
      cwd: { type: 'string', required: false, description: 'Working directory' },
      timeout_s: { type: 'number', required: false, description: 'Timeout in seconds (default 30, max 120)' },
    },
    execute(args) {
      const cwd = args.cwd || ctx?.bash?.cwd || process.cwd()
      const timeout = Math.min(Math.max(+args.timeout_s || 30, 1), 120) * 1000
      try {
        const out = execSync(args.command, {
          cwd,
          encoding: 'utf-8',
          timeout,
          maxBuffer: 1024 * 1024 * 8,
        })
        return cap(out, 9000) || '(no output)'
      } catch (e: any) {
        const body = `${e.stdout || ''}\n${e.stderr || ''}`.trim()
        return cap(`[exit ${e.status ?? '?'}] ${e.message}\n${body}`, 9000)
      }
    },
  }),
]
