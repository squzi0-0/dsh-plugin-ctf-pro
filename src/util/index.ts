import { execSync, spawnSync, exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execP = promisify(exec)

/* ------------------------------------------------------------------ *
 *  Shell execution helpers
 * ------------------------------------------------------------------ */

export interface ExecOpts {
  timeoutMs?: number
  cwd?: string
  maxBytes?: number
  input?: string
  /** Do not treat a non-zero exit code as a hard error (many CTF tools exit !=0 but still print useful output). */
  tolerateFail?: boolean
}

/** Run a command string through the shell, never throwing. Returns combined, length-capped output. */
export function safeExec(cmd: string, opts: ExecOpts = {}): string {
  const { timeoutMs = 15000, cwd, maxBytes = 1024 * 1024 * 4, input } = opts
  try {
    const out = execSync(cmd, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd,
      input,
      maxBuffer: maxBytes,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return cap(out, maxBytes)
  } catch (e: any) {
    const stdout = e.stdout ? String(e.stdout) : ''
    const stderr = e.stderr ? String(e.stderr) : ''
    const body = (stdout + (stderr ? `\n${stderr}` : '')).trim()
    if (opts.tolerateFail && body) return cap(body, maxBytes)
    if (e.signal === 'SIGTERM' || /ETIMEDOUT|timed? out/i.test(e.message || ''))
      return `[timeout after ${timeoutMs}ms]\n${cap(body, maxBytes)}`
    return `[exec error] ${e.message}\n${cap(body, maxBytes)}`.trim()
  }
}

/** Run argv without a shell (no injection / quoting pitfalls). Prefer this when args come from the model. */
export function safeSpawn(bin: string, args: string[], opts: ExecOpts = {}): string {
  const { timeoutMs = 15000, cwd, maxBytes = 1024 * 1024 * 4, input } = opts
  const r = spawnSync(bin, args, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    cwd,
    input,
    maxBuffer: maxBytes,
  })
  if (r.error) {
    if ((r.error as any).code === 'ENOENT') return `[not found] ${bin} is not installed or not in PATH`
    return `[spawn error] ${r.error.message}`
  }
  const body = ((r.stdout || '') + (r.stderr ? `\n${r.stderr}` : '')).trim()
  if (r.signal) return `[killed: ${r.signal}] ${cap(body, maxBytes)}`
  return cap(body, maxBytes) || '(no output)'
}

/** Async shell exec, never throwing. Use for fan-out with Promise.all. */
export async function safeExecAsync(cmd: string, opts: ExecOpts = {}): Promise<string> {
  const { timeoutMs = 15000, cwd, maxBytes = 1024 * 1024 * 4 } = opts
  try {
    const { stdout, stderr } = await execP(cmd, { timeout: timeoutMs, cwd, maxBuffer: maxBytes, encoding: 'utf-8' })
    const body = (stdout || '') + (stderr ? `\n${stderr}` : '')
    return cap(body, maxBytes)
  } catch (e: any) {
    const body = `${e.stdout || ''}\n${e.stderr || ''}`.trim()
    if (opts.tolerateFail && body) return cap(body, maxBytes)
    if (e.killed || /ETIMEDOUT/i.test(e.message || '')) return `[timeout ${timeoutMs}ms] ${cap(body, maxBytes)}`
    return `[exec error] ${e.message}\n${cap(body, maxBytes)}`.trim()
  }
}

/* ------------------------------------------------------------------ *
 *  Session cache — memoise expensive results within one process so
 *  repeated tool calls on the same file/command are instant.
 * ------------------------------------------------------------------ */
const _memo = new Map<string, string>()

export function memo(key: string, produce: () => string): string {
  if (_memo.has(key)) return _memo.get(key)!
  const v = produce()
  _memo.set(key, v)
  return v
}

/** A cache key component that changes when a file changes (size+mtime). */
export function fileSig(p: string): string {
  try {
    const st = fs.statSync(p)
    return `${p}:${st.size}:${Math.round(st.mtimeMs)}`
  } catch {
    return `${p}:missing`
  }
}

/** safeExec with per-(command+file) memoisation. */
export function cachedExec(cmd: string, cacheKey: string, opts: ExecOpts = {}): string {
  return memo(`exec::${cacheKey}::${cmd}`, () => safeExec(cmd, opts))
}

/** Run several shell commands concurrently; returns results in input order. */
export async function parallel(cmds: Array<{ label: string; cmd: string; opts?: ExecOpts }>): Promise<Array<{ label: string; out: string }>> {
  const settled = await Promise.all(cmds.map((c) => safeExecAsync(c.cmd, c.opts).then((out) => ({ label: c.label, out }))))
  return settled
}

export function cap(s: string, maxBytes = 8000): string {
  if (!s) return ''
  if (s.length <= maxBytes) return s
  return s.slice(0, maxBytes) + `\n... [truncated ${s.length - maxBytes} chars]`
}

/* ------------------------------------------------------------------ *
 *  Tool availability
 * ------------------------------------------------------------------ */

const _toolCache = new Map<string, boolean>()

/** True if a binary is on PATH. Cached per-process. */
export function hasTool(bin: string): boolean {
  if (_toolCache.has(bin)) return _toolCache.get(bin)!
  const r = spawnSync('command', ['-v', bin], { shell: '/bin/bash', encoding: 'utf-8' })
  const ok = r.status === 0 && !!(r.stdout || '').trim()
  _toolCache.set(bin, ok)
  return ok
}

/** Return the subset of `bins` that are missing, for user-facing hints. */
export function missingTools(bins: string[]): string[] {
  return bins.filter((b) => !hasTool(b))
}

/** Wrap a section of output with a header, and auto-skip if the required tool is absent. */
export function section(title: string, body: string): string {
  return `### ${title}\n${body.trim() || '(empty)'}`
}

/* ------------------------------------------------------------------ *
 *  Plugin-relative file resolution (python helpers, wordlists)
 * ------------------------------------------------------------------ */

/**
 * Resolve a file shipped with the plugin (e.g. tools/rsa_attacks.py).
 * Works both from bundled lib/index.js and from an un-bundled src/ layout.
 */
export function pluginFile(...rel: string[]): string | null {
  const candidates = [
    path.resolve(__dirname, '..', ...rel), // lib/ -> package root
    path.resolve(__dirname, '..', '..', ...rel), // src/util -> package root
    path.resolve(process.cwd(), ...rel),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}

export function pythonBin(): string {
  for (const p of ['python3', 'python']) if (hasTool(p)) return p
  return 'python3'
}

/** Run a bundled python helper with `-I` (isolated) and JSON-friendly args. */
export function runPyHelper(relScript: string, args: string[], opts: ExecOpts = {}): string {
  const script = pluginFile('tools', relScript)
  if (!script) return `[missing helper] tools/${relScript} not found in plugin package`
  return safeSpawn(pythonBin(), ['-I', script, ...args], { timeoutMs: 30000, ...opts })
}

/* ------------------------------------------------------------------ *
 *  Flag extraction
 * ------------------------------------------------------------------ */

const DEFAULT_FLAG_PREFIXES = [
  'flag',
  'ctf',
  'CTF',
  'FLAG',
  'CSSCTF',
  'KUBSTU',
  'picoCTF',
  'HTB',
  'HackTM',
  'DUCTF',
  'uiuctf',
  'corctf',
]

export function extractFlags(text: string, extraPrefixes: string[] = []): string[] {
  const found = new Set<string>()
  const prefixes = [...DEFAULT_FLAG_PREFIXES, ...extraPrefixes]
  // Specific known prefixes first (case-insensitive, allow nested-free body).
  for (const pre of prefixes) {
    const re = new RegExp(`${escapeRe(pre)}\\{[^}\\n]{1,200}\\}`, 'gi')
    for (const m of text.matchAll(re)) found.add(m[0])
  }
  // Generic PREFIX{...} fallback (prefix of letters/digits/_ then a reasonably long body).
  for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{4,200}\}/g)) found.add(m[0])
  return Array.from(found)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ------------------------------------------------------------------ *
 *  Printable / entropy heuristics
 * ------------------------------------------------------------------ */

export function printableRatio(buf: Buffer): number {
  if (buf.length === 0) return 0
  let printable = 0
  for (const b of buf) {
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) printable++
  }
  return printable / buf.length
}

export function looksText(buf: Buffer, min = 0.85): boolean {
  return printableRatio(buf) >= min
}

export function shannonEntropy(buf: Buffer): number {
  if (buf.length === 0) return 0
  const freq = new Array(256).fill(0)
  for (const b of buf) freq[b]++
  let h = 0
  for (const f of freq) {
    if (f === 0) continue
    const p = f / buf.length
    h -= p * Math.log2(p)
  }
  return h // 0..8 bits/byte
}
