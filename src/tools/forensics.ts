import * as fs from 'fs'
import { textTool, ToolFactory } from '../util/tool'
import { safeExec, hasTool, section, missingTools, runPyHelper, shannonEntropy, pluginFile } from '../util'

export const forensicsTools: ToolFactory = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_analyze_file — one-shot file fingerprint.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_analyze_file',
    category: 'forensics',
    description:
      'Fingerprint any unknown CTF attachment in one call: file type, entropy, strings (ascii+utf16), hexdump head/tail, exiftool metadata, binwalk signatures, and embedded-file carving hints. Use on every unknown file before deciding a category.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path to the file' },
      extract: { type: 'boolean', required: false, description: 'Run binwalk -e to auto-extract embedded files' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const buf = fs.readFileSync(p).subarray(0, 1024 * 512)
      const parts: string[] = []
      parts.push(section('file', safeExec(`file "${p}"`, { tolerateFail: true })))
      parts.push(section('size / entropy', `${fs.statSync(p).size} bytes | entropy ${shannonEntropy(buf).toFixed(2)} bits/byte`))
      parts.push(section('strings (ascii, n>=6, first 60)', safeExec(`strings -n 6 "${p}" | head -60`, { tolerateFail: true })))
      parts.push(section('strings (utf-16le, first 30)', safeExec(`strings -e l -n 6 "${p}" | head -30`, { tolerateFail: true })))
      parts.push(section('hexdump head (256B)', safeExec(`xxd -l 256 "${p}"`, { tolerateFail: true })))
      parts.push(section('hexdump tail (128B)', safeExec(`tail -c 128 "${p}" | xxd`, { tolerateFail: true })))
      if (hasTool('exiftool')) parts.push(section('exiftool', safeExec(`exiftool "${p}"`, { tolerateFail: true })))
      if (hasTool('binwalk')) {
        parts.push(section('binwalk', safeExec(`binwalk "${p}"`, { tolerateFail: true })))
        if (args.extract) parts.push(section('binwalk -e', safeExec(`binwalk -e --run-as=root "${p}" 2>&1 | tail -30`, { timeoutMs: 40000, tolerateFail: true })))
      }
      const miss = missingTools(['exiftool', 'binwalk', 'foremost'])
      if (miss.length) parts.push(section('missing tools', `Not installed: ${miss.join(', ')} (apt install ${miss.join(' ')})`))
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_stego — image/audio steganography battery.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_stego',
    category: 'forensics',
    description:
      'Run a steganography battery on an image or audio file: exiftool, strings, pngcheck/zsteg (PNG/BMP), steghide extract (JPG/WAV, tries blank + given password), LSB plane extraction, and a spectrogram hint for audio. Use for forensics/stego image & sound challenges.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the image/audio file' },
      password: { type: 'string', required: false, description: 'Password to try with steghide (also tries empty)' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      const ft = safeExec(`file -b "${p}"`, { tolerateFail: true }).toLowerCase()
      const parts: string[] = [section('file', ft)]

      parts.push(section('strings (flag-like + readable, first 40)', safeExec(`strings -n 6 "${p}" | head -40`, { tolerateFail: true })))
      if (hasTool('exiftool')) parts.push(section('exiftool', safeExec(`exiftool "${p}"`, { tolerateFail: true })))

      if (/png|bitmap|bmp/.test(ft)) {
        if (hasTool('pngcheck')) parts.push(section('pngcheck', safeExec(`pngcheck -vtp7 "${p}" 2>&1 | head -40`, { tolerateFail: true })))
        if (hasTool('zsteg')) parts.push(section('zsteg -a', safeExec(`zsteg -a "${p}" 2>&1 | head -60`, { timeoutMs: 40000, tolerateFail: true })))
        else parts.push(section('zsteg', 'not installed (gem install zsteg) — using python LSB fallback below'))
        parts.push(section('LSB planes (python fallback)', runPyHelper('stego_lsb.py', [p])))
      }

      if (/jpeg|jpg|wav|au\b/.test(ft)) {
        if (hasTool('steghide')) {
          const pw = args.password ? String(args.password) : ''
          const tryPw = (pass: string, label: string) =>
            section(`steghide (${label})`, safeExec(`steghide extract -sf "${p}" -p '${pass.replace(/'/g, "'\\''")}' -xf /tmp/steghide_out 2>&1; echo '---'; [ -f /tmp/steghide_out ] && (cat /tmp/steghide_out | head -c 400; rm -f /tmp/steghide_out)`, { tolerateFail: true }))
          parts.push(tryPw('', 'empty password'))
          if (pw) parts.push(tryPw(pw, 'given password'))
        } else {
          parts.push(section('steghide', 'not installed (apt install steghide)'))
        }
      }

      if (/audio|wave|mpeg|flac|ogg/.test(ft)) {
        parts.push(section('audio hint', 'Open the spectrogram in Audacity/Sonic Visualiser — flags are often drawn there. For LSB-in-samples, extract with: `sox in.wav -t raw -e unsigned -b 8 out.raw` then inspect. DTMF tones -> use a DTMF decoder.'))
      }

      const miss = missingTools(['zsteg', 'steghide', 'pngcheck', 'exiftool'])
      if (miss.length) parts.push(section('missing tools', miss.join(', ')))
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_pcap — network capture analysis via tshark.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_pcap',
    category: 'forensics',
    description:
      'Analyse a .pcap/.pcapng capture with tshark: protocol hierarchy, conversations, HTTP requests & objects, DNS queries, and a scan for flags/credentials across all ASCII payloads. Use for network-forensics challenges.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the .pcap/.pcapng file' },
      filter: { type: 'string', required: false, description: 'Optional display filter, e.g. "http" or "tcp.port==1337"' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      if (!hasTool('tshark')) return 'tshark not installed (apt install tshark / wireshark-cli). As a fallback, open the capture in Wireshark and use File > Export Objects.'
      const parts: string[] = []
      parts.push(section('protocol hierarchy', safeExec(`tshark -r "${p}" -q -z io,phs 2>/dev/null | head -40`, { tolerateFail: true })))
      parts.push(section('TCP conversations', safeExec(`tshark -r "${p}" -q -z conv,tcp 2>/dev/null | head -25`, { tolerateFail: true })))
      parts.push(section('HTTP requests', safeExec(`tshark -r "${p}" -Y http.request -T fields -e ip.dst -e http.host -e http.request.method -e http.request.uri 2>/dev/null | head -40`, { tolerateFail: true })))
      parts.push(section('DNS queries', safeExec(`tshark -r "${p}" -Y dns.flags.response==0 -T fields -e dns.qry.name 2>/dev/null | sort -u | head -40`, { tolerateFail: true })))
      if (args.filter) parts.push(section(`custom filter: ${args.filter}`, safeExec(`tshark -r "${p}" -Y '${String(args.filter).replace(/'/g, '')}' 2>/dev/null | head -40`, { tolerateFail: true })))
      // flag/credential sweep over ascii strings in payloads
      const sweep = safeExec(`tshark -r "${p}" -T fields -e data.text -e text 2>/dev/null | strings | grep -iE 'flag\\{|ctf\\{|pass|user|login|token|authorization' | head -40`, { timeoutMs: 40000, tolerateFail: true })
      parts.push(section('flag/credential sweep', sweep || '(nothing obvious — try `tshark -r file -q -z follow,tcp,ascii,<stream>` on interesting streams, and export HTTP/SMB objects)'))
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_crack_archive — password-cracking for zip/rar/7z/pdf via john.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_crack_archive',
    category: 'forensics',
    description:
      'Crack the password of an encrypted zip/rar/7z/pdf using John the Ripper (*2john + wordlist or incremental). Ships with a small rockyou-style wordlist; pass a bigger one for real cracking. For your own/authorised challenge files only.',
    parameters: {
      path: { type: 'string', required: true, description: 'Path to the encrypted archive/pdf' },
      wordlist: { type: 'string', required: false, description: 'Path to a wordlist (defaults to bundled common.txt)' },
    },
    execute(args) {
      const p = args.path
      if (!fs.existsSync(p)) return `File not found: ${p}`
      if (!hasTool('john')) return 'john (John the Ripper) not installed (apt install john). Alternatively: fcrackzip -u -D -p wordlist file.zip'
      const ext = p.split('.').pop()?.toLowerCase()
      const twojohn: Record<string, string> = { zip: 'zip2john', rar: 'rar2john', '7z': '7z2john', pdf: 'pdf2john' }
      const converter = twojohn[ext || ''] || `${ext}2john`
      if (!hasTool(converter) && !hasTool(`${converter}.pl`)) return `${converter} not found. Install the john jumbo suite.`
      const hashFile = `/tmp/ctf_${Date.now()}.hash`
      const conv = safeExec(`${converter} "${p}" > "${hashFile}" 2>/dev/null; head -1 "${hashFile}"`, { tolerateFail: true })
      if (!fs.existsSync(hashFile) || fs.statSync(hashFile).size === 0) return `Could not extract hash with ${converter}.\n${conv}`
      const wl = args.wordlist || pluginFile('wordlists', 'common.txt') || ''
      const wlArg = wl && fs.existsSync(wl) ? `--wordlist="${wl}"` : ''
      const run = safeExec(`john ${wlArg} "${hashFile}" 2>&1 | tail -15; echo '--- cracked ---'; john --show "${hashFile}" 2>/dev/null`, { timeoutMs: 90000, tolerateFail: true })
      safeExec(`rm -f "${hashFile}"`)
      return section('john', run)
    },
  }),
]
