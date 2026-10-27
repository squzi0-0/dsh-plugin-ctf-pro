import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { textTool, ToolFactory } from '../util/tool'
import {
  safeExec,
  safeExecAsync,
  parallel,
  hasTool,
  section,
  extractFlags,
  cap,
  looksText,
  shannonEntropy,
  runPyHelper,
  cachedExec,
  fileSig,
} from '../util'
import { deepDecode, rotBrute } from '../util/decode'
import { submitFlag } from './submit'

/* ------------------------------------------------------------------ *
 *  Flag scanning with strong/weak separation to keep the autopilot
 *  both fast and low-false-positive.
 * ------------------------------------------------------------------ */
const KNOWN = /\b(?:flag|ctf|pico|HTB|CSSCTF|KUBSTU|DUCTF|corctf|uiuctf|HackTM|DrgnS|BALSN|zer0pts)\{[^}\n]{1,200}\}/gi

function scanFlags(text: string, prefix?: string): { strong: string[]; weak: string[] } {
  const strong = new Set<string>()
  const weak = new Set<string>()
  for (const m of text.matchAll(KNOWN)) strong.add(m[0])
  if (prefix) {
    const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}\\n]{1,200}\\}`, 'gi')
    for (const m of text.matchAll(re)) strong.add(m[0])
  }
  for (const f of extractFlags(text, prefix ? [prefix] : [])) {
    if (!strong.has(f)) weak.add(f)
  }
  return { strong: Array.from(strong), weak: Array.from(weak) }
}

interface Budget {
  start: number
  deadlineMs: number
  left(): number
  over(reserveMs?: number): boolean
}
function budget(deadlineS: number): Budget {
  const start = Date.now()
  const deadlineMs = deadlineS * 1000
  return {
    start,
    deadlineMs,
    left() {
      return Math.max(0, deadlineMs - (Date.now() - start))
    },
    over(reserve = 0) {
      return Date.now() - start + reserve >= deadlineMs
    },
  }
}

export const solveTools: ToolFactory = (ctx) => [
  textTool(ctx, {
    name: 'ctf_solve',
    category: 'meta',
    description:
      'AUTOPILOT. Give a file path, URL, or text blob and it runs the whole pipeline itself — triage, recursive decode, strings, metadata, carving, stego, pcap/archive, web source-leak probes — in parallel, and returns the flag in ONE call when the challenge is auto-solvable (encodings, strings, LSB, appended data, exposed /flag, simple RSA). Prefer this first on every challenge; fall back to the specific ctf_* tools + skill only when it reports it needs reasoning. Set prefix= to your competition flag format for best accuracy.',
    parameters: {
      input: { type: 'string', required: true, description: 'File path, URL, or raw text/encoded blob' },
      kind: { type: 'string', required: false, description: 'Override detection: file | url | text' },
      prefix: { type: 'string', required: false, description: 'Flag prefix, e.g. KUBSTU, CSSCTF (improves accuracy)' },
      deadline_s: { type: 'number', required: false, description: 'Soft time budget in seconds (default 45). Expensive stages are skipped once exceeded.' },
      deep: { type: 'boolean', required: false, description: 'Keep going after the first flag to surface everything (default false = stop at first strong flag).' },
      submit_url: { type: 'string', required: false, description: 'If set, auto-submit a found flag here (CTFd-style POST, or host:port for a nc checker).' },
    },
    async execute(args) {
      const input: string = args.input
      const prefix: string | undefined = args.prefix ? String(args.prefix) : undefined
      const deep: boolean = !!args.deep
      const b = budget(Math.min(Math.max(+args.deadline_s || 45, 5), 120))

      let kind: string = args.kind || ''
      if (!kind) {
        if (/^https?:\/\//i.test(input)) kind = 'url'
        else if (input.length < 4096 && fs.existsSync(input)) kind = 'file'
        else kind = 'text'
      }

      const trace: string[] = []
      const strongAll = new Set<string>()
      const weakAll = new Set<string>()
      const record = (where: string, text: string) => {
        const { strong, weak } = scanFlags(text, prefix)
        strong.forEach((f) => strongAll.add(f))
        weak.forEach((f) => weakAll.add(f))
        if (strong.length) trace.push(`✓ ${where}: ${strong.join(', ')}`)
      }
      const done = () => !deep && strongAll.size > 0

      if (kind === 'text') {
        await solveText(input, prefix, record, trace)
      } else if (kind === 'url') {
        await solveUrl(input, b, record, trace)
      } else if (kind === 'file') {
        if (!fs.existsSync(input)) return `File not found: ${input}`
        await solveFile(input, b, deep, record, trace, done)
      }

      let submitNote = ''
      if (args.submit_url && strongAll.size) {
        const flag = Array.from(strongAll)[0]
        try {
          submitNote = '\n\n' + section('auto-submit', submitFlag(String(args.submit_url), flag))
        } catch (e: any) {
          submitNote = '\n\n' + section('auto-submit', `failed: ${e?.message || e}`)
        }
      }
      return formatResult(kind, strongAll, weakAll, trace, b) + submitNote
    },
  }),
]

/* ------------------------------ text ------------------------------ */
async function solveText(
  input: string,
  prefix: string | undefined,
  record: (w: string, t: string) => void,
  trace: string[],
) {
  record('literal', input)
  const dd = deepDecode(input, 5)
  if (dd.flags.length) record('decode-chain', dd.flags.join('\n'))
  for (const h of dd.hits) record(`decode[${h.path.join('->')}]`, h.value)
  const rb = rotBrute(input).filter((l) => l.includes('<--'))
  if (rb.length) record('rot/atbash', rb.join('\n'))

  // auto-RSA: if the blob looks like it carries n / e / c, try the RSA engine
  const grab = (name: string, minDigits = 3) => {
    const m = input.match(new RegExp(`\\b${name}\\s*[=:]\\s*(0x[0-9a-fA-F]+|[0-9]{${minDigits},})`))
    return m ? m[1] : null
  }
  const n = grab('n') || grab('N')
  const c = grab('c') || grab('ct') || grab('cipher')
  if (n && c) {
    const e = grab('e', 1) || '65537' // exponent may be a single digit (e.g. 3)
    trace.push('… n/e/c detected — running RSA engine')
    const out = runPyHelper('rsa_attacks.py', ['--n', n, '--e', e, '--c', c], { timeoutMs: 45000 })
    record('rsa', out)
  } else if (!dd.hits.length) {
    trace.push('… no standard encoding matched — may be a cipher (ctf_crypto_xor / ctf_crypto_classical) or custom crypto')
  }
}

/* ------------------------------ url ------------------------------- */
async function solveUrl(
  url: string,
  b: Budget,
  record: (w: string, t: string) => void,
  trace: string[],
) {
  const base = url.replace(/\/$/, '')
  if (!hasTool('curl')) {
    trace.push('curl not installed — cannot probe URL')
    return
  }
  const paths = ['', '/flag', '/flag.txt', '/robots.txt', '/.git/HEAD', '/.env', '/sitemap.xml', '/index.php.bak', '/backup.zip']
  const jobs = paths.map((p) => ({
    label: p || '(root)',
    cmd: `curl -sSL "${base}${p}" --max-time 8`,
    opts: { timeoutMs: 9000, tolerateFail: true, maxBytes: 200000 },
  }))
  const results = await parallel(jobs)
  for (const r of results) record(`GET ${r.label}`, r.out)
  // headers too (cookies/flags in headers)
  const hdr = await safeExecAsync(`curl -sSIL "${base}" --max-time 8`, { tolerateFail: true })
  record('headers', hdr)

  // exposed .git → dump and grep history for flags
  const gitHead = results.find((r) => r.label === '/.git/HEAD')
  if (gitHead && /^ref:|[0-9a-f]{40}/m.test(gitHead.out) && hasTool('git-dumper') && !b.over(8000)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitdump_'))
    safeExec(`git-dumper "${base}/.git/" "${dir}" 2>&1 | tail -3`, { timeoutMs: Math.min(b.left(), 30000), tolerateFail: true })
    const hist = safeExec(`cd "${dir}" && git log -p 2>/dev/null | head -c 200000`, { tolerateFail: true })
    record('git-dump', hist)
    safeExec(`rm -rf "${dir}"`, { tolerateFail: true })
  } else if (gitHead && /ref:|[0-9a-f]{40}/.test(gitHead.out)) {
    trace.push('… /.git exposed — install git-dumper, or `wget -r http://host/.git/ && git checkout .`')
  }
  if (b.over()) trace.push('… time budget reached (url)')
  trace.push('… for injection/auth/JWT load skill ctf-web and use ctf_web_probe / ctf_web_fuzz / ctf_jwt')
}

/* ------------------------------ file ------------------------------ */
async function solveFile(
  p: string,
  b: Budget,
  deep: boolean,
  record: (w: string, t: string) => void,
  trace: string[],
  done: () => boolean,
) {
  const buf = fs.readFileSync(p)
  const head = buf.subarray(0, 1024 * 256)
  const sig = fileSig(p)
  const ft = cachedExec(`file -b "${p}"`, sig, { tolerateFail: true })
  const low = ft.toLowerCase()
  const ent = shannonEntropy(head)
  trace.push(`file: ${ft.trim()} | entropy ${ent.toFixed(2)}`)

  // 1) cheapest: flags directly in bytes / strings
  record('raw-bytes', buf.toString('latin1').slice(0, 300000))
  if (done()) return

  // 2) if the whole file is text, try decode chains on it
  if (looksText(head, 0.85)) {
    const dd = deepDecode(head.toString('utf-8'), 5)
    if (dd.flags.length) record('decode-chain', dd.flags.join('\n'))
    for (const h of dd.hits) record(`decode[${h.path.join('->')}]`, h.value)
    if (done()) return
  }

  // 3) parallel metadata/strings battery
  const battery: Array<{ label: string; cmd: string; opts?: any }> = [
    { label: 'strings-ascii', cmd: `strings -n 5 "${p}"`, opts: { tolerateFail: true, maxBytes: 300000 } },
    { label: 'strings-utf16', cmd: `strings -e l -n 5 "${p}"`, opts: { tolerateFail: true, maxBytes: 150000 } },
    { label: 'tail', cmd: `tail -c 2048 "${p}" | strings -n 4`, opts: { tolerateFail: true } },
  ]
  if (hasTool('exiftool')) battery.push({ label: 'exiftool', cmd: `exiftool "${p}"`, opts: { tolerateFail: true } })
  if (hasTool('binwalk')) battery.push({ label: 'binwalk', cmd: `binwalk "${p}"`, opts: { tolerateFail: true } })
  const bat = await parallel(battery)
  for (const r of bat) record(r.label, r.out)
  if (done()) return

  // 4) category-specific fast paths (parallel where possible)
  const cat: Array<{ label: string; cmd: string; opts?: any }> = []
  if (/png|bitmap|bmp/.test(low) && hasTool('zsteg')) cat.push({ label: 'zsteg', cmd: `zsteg -a "${p}" 2>&1 | head -200`, opts: { timeoutMs: Math.min(b.left(), 40000), tolerateFail: true } })
  if (/image|png|jpeg|jpg|bitmap|bmp|gif/.test(low) && hasTool('zbarimg')) cat.push({ label: 'qr/barcode', cmd: `zbarimg -q --raw "${p}" 2>/dev/null`, opts: { tolerateFail: true } })
  if (/jpeg|jpg|wav|bmp/.test(low) && hasTool('stegseek')) cat.push({ label: 'stegseek', cmd: `stegseek --crack "${p}" /usr/share/wordlists/rockyou.txt /tmp/_ss_$$ 2>&1 | tail -4; [ -f /tmp/_ss_$$ ] && cat /tmp/_ss_$$ | head -c 500; rm -f /tmp/_ss_$$`, opts: { timeoutMs: Math.min(b.left(), 40000), tolerateFail: true } })
  else if (/jpeg|jpg|wav/.test(low) && hasTool('steghide')) cat.push({ label: 'steghide-blank', cmd: `steghide extract -sf "${p}" -p '' -xf /tmp/_sh_$$ 2>&1; [ -f /tmp/_sh_$$ ] && cat /tmp/_sh_$$ | head -c 500; rm -f /tmp/_sh_$$`, opts: { tolerateFail: true } })
  if (/pdf/.test(low)) cat.push({ label: 'pdftotext', cmd: `pdftotext "${p}" - 2>/dev/null | head -200 || strings "${p}" | head -200`, opts: { tolerateFail: true } })
  if (/zip archive|zip file/.test(low)) cat.push({ label: 'zip-list', cmd: `unzip -l "${p}" 2>&1 | head -40`, opts: { tolerateFail: true } })
  if (/pcap|capture|tcpdump/.test(low) && hasTool('tshark')) cat.push({ label: 'pcap-sweep', cmd: `tshark -r "${p}" -T fields -e data.text -e text 2>/dev/null | strings | grep -iE 'flag\\{|ctf\\{|pass|token' | head -40`, opts: { timeoutMs: Math.min(b.left(), 40000), tolerateFail: true } })
  if (cat.length && !b.over(2000)) {
    const cr = await parallel(cat)
    for (const r of cr) record(r.label, r.out)
    if (done()) return
  }
  // python LSB fallback for images when zsteg absent
  if (/png|bitmap|bmp/.test(low) && !hasTool('zsteg')) {
    record('lsb-python', runPyHelper('stego_lsb.py', [p]))
    if (done()) return
  }
  // USB HID keystroke decode for captures (python, needs tshark)
  if (/pcap|capture|tcpdump/.test(low) && hasTool('tshark') && !b.over(3000)) {
    record('usb-hid', runPyHelper('usb_hid.py', [p], { timeoutMs: Math.min(b.left(), 40000) }))
    if (done()) return
  }

  // 5) carving — extract embedded files and recurse one level (strings+decode)
  if (hasTool('binwalk') && !b.over(5000)) {
    const outdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctfsolve_'))
    safeExec(`binwalk --run-as=root -e -C "${outdir}" "${p}" 2>&1 | tail -5`, { timeoutMs: Math.min(b.left(), 30000), tolerateFail: true })
    const carved: string[] = []
    const walk = (d: string, depth: number) => {
      if (depth > 3) return
      for (const name of fs.readdirSync(d)) {
        const fp = path.join(d, name)
        try {
          const st = fs.statSync(fp)
          if (st.isDirectory()) walk(fp, depth + 1)
          else if (st.size > 0 && st.size < 5 * 1024 * 1024) carved.push(fp)
        } catch {}
      }
    }
    try { walk(outdir, 0) } catch {}
    for (const fp of carved.slice(0, 40)) {
      if (b.over()) break
      const cbuf = fs.readFileSync(fp)
      record(`carved:${path.basename(fp)}`, cbuf.toString('latin1').slice(0, 100000))
      if (looksText(cbuf.subarray(0, 4096))) {
        const dd = deepDecode(cbuf.toString('utf-8').slice(0, 20000), 4)
        if (dd.flags.length) record(`carved-decode:${path.basename(fp)}`, dd.flags.join('\n'))
      }
      if (done()) break
    }
    safeExec(`rm -rf "${outdir}"`, { tolerateFail: true })
  }
}

/* ---------------------------- formatting --------------------------- */
function formatResult(
  kind: string,
  strong: Set<string>,
  weak: Set<string>,
  trace: string[],
  b: Budget,
): string {
  const out: string[] = []
  if (strong.size) {
    out.push('🚩 FLAG(S) FOUND:\n' + Array.from(strong).map((f) => '  ' + f).join('\n'))
  } else if (weak.size) {
    out.push('⚠ Candidate flag-like strings (verify format):\n' + Array.from(weak).slice(0, 15).map((f) => '  ' + f).join('\n'))
  } else {
    out.push('No flag auto-solved.')
  }
  out.push(section('trace (' + ((Date.now() - b.start) / 1000).toFixed(1) + 's)', trace.slice(0, 40).join('\n') || '(nothing)'))
  if (!strong.size) {
    const hint =
      kind === 'url'
        ? 'Needs reasoning: load skill ctf-web; try ctf_web_probe, ctf_web_fuzz, ctf_jwt, or injection from the skill.'
        : kind === 'text'
        ? 'Needs reasoning: likely a cipher/custom crypto. Load ctf-crypto; try ctf_crypto_xor, ctf_crypto_classical, ctf_crypto_rsa.'
        : 'Needs reasoning: run ctf_triage for category, load the matching skill, and use the specific ctf_* tool (e.g. ctf_reverse / ctf_pwn_recon / ctf_stego / ctf_pcap).'
    out.push(section('next', hint))
  }
  return cap(out.join('\n\n'), 9000)
}
