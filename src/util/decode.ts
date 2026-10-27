import * as zlib from 'zlib'
import { looksText, extractFlags } from './index'

/* ------------------------------------------------------------------ *
 *  A battery of reversible/decoding transforms used in CTF "decode me"
 *  chains. Each returns the decoded string, or null if it clearly does
 *  not apply. The engine then recurses on successful results.
 * ------------------------------------------------------------------ */

export interface DecodeHit {
  codec: string
  value: string
  depth: number
  path: string[] // chain of codecs that produced this
}

type Transform = (s: string) => string | null

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function fromBase58(s: string): string | null {
  const str = s.trim()
  if (!str || /[^1-9A-HJ-NP-Za-km-z]/.test(str)) return null
  let num = 0n
  for (const ch of str) {
    const i = B58_ALPHABET.indexOf(ch)
    if (i < 0) return null
    num = num * 58n + BigInt(i)
  }
  const bytes: number[] = []
  while (num > 0n) {
    bytes.unshift(Number(num % 256n))
    num /= 256n
  }
  for (const ch of str) {
    if (ch === '1') bytes.unshift(0)
    else break
  }
  const buf = Buffer.from(bytes)
  return looksText(buf, 0.8) ? buf.toString('latin1') : null
}

function fromBase32(s: string): string | null {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  if (!clean || /[^A-Z2-7]/.test(clean)) return null
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of clean) bits += alpha.indexOf(ch).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const buf = Buffer.from(bytes)
  return looksText(buf, 0.8) ? buf.toString('utf-8') : null
}

function fromBase85(s: string): string | null {
  // ASCII85 / Adobe (<~ ~>) — best-effort.
  let str = s.trim().replace(/^<~/, '').replace(/~>$/, '')
  if (!str || /[^\x21-\x75z\s]/.test(str)) return null
  str = str.replace(/\s/g, '')
  const out: number[] = []
  let i = 0
  while (i < str.length) {
    if (str[i] === 'z') {
      out.push(0, 0, 0, 0)
      i++
      continue
    }
    const chunk = str.slice(i, i + 5)
    i += 5
    let n = 0
    const len = chunk.length
    for (let j = 0; j < 5; j++) {
      const c = j < len ? chunk.charCodeAt(j) - 33 : 84
      if (c < 0 || c > 84) return null
      n = n * 85 + c
    }
    const b = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
    for (let k = 0; k < len - 1; k++) out.push(b[k])
  }
  const buf = Buffer.from(out)
  return looksText(buf, 0.8) ? buf.toString('utf-8') : null
}

function fromBase64(s: string): string | null {
  const clean = s.trim().replace(/\s/g, '')
  if (clean.length < 4 || clean.length % 4 !== 0) {
    // try base64url without padding
    if (/^[A-Za-z0-9_-]+$/.test(clean) && clean.length >= 4) {
      const norm = clean.replace(/-/g, '+').replace(/_/g, '/')
      const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4)
      const buf = Buffer.from(pad, 'base64')
      return looksText(buf, 0.85) && buf.length > 0 ? buf.toString('utf-8') : null
    }
    return null
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) return null
  const buf = Buffer.from(clean, 'base64')
  if (buf.length === 0) return null
  return looksText(buf, 0.85) ? buf.toString('utf-8') : null
}

function fromHex(s: string): string | null {
  const clean = s.replace(/0x/gi, '').replace(/[\s:,]/g, '')
  if (clean.length < 4 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null
  const buf = Buffer.from(clean, 'hex')
  return looksText(buf, 0.85) ? buf.toString('utf-8') : null
}

function fromBinary(s: string): string | null {
  const bits = s.replace(/[^01]/g, '')
  if (bits.length < 8 || bits.length % 8 !== 0) return null
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const buf = Buffer.from(bytes)
  return looksText(buf, 0.85) ? buf.toString('utf-8') : null
}

function fromDecimalBytes(s: string): string | null {
  const nums = s.trim().split(/[\s,]+/).filter(Boolean)
  if (nums.length < 2 || !nums.every((n) => /^\d{1,3}$/.test(n) && +n <= 255)) return null
  const buf = Buffer.from(nums.map(Number))
  return looksText(buf, 0.85) ? buf.toString('utf-8') : null
}

function fromOctalBytes(s: string): string | null {
  const nums = s.trim().split(/[\s,]+/).filter(Boolean)
  if (nums.length < 2 || !nums.every((n) => /^[0-7]{1,3}$/.test(n))) return null
  const vals = nums.map((n) => parseInt(n, 8))
  if (!vals.every((v) => v <= 255)) return null
  const buf = Buffer.from(vals)
  return looksText(buf, 0.85) ? buf.toString('utf-8') : null
}

function fromUrl(s: string): string | null {
  if (!/%[0-9a-fA-F]{2}/.test(s)) return null
  try {
    const d = decodeURIComponent(s)
    return d !== s ? d : null
  } catch {
    return null
  }
}

function rotN(s: string, n: number): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26) + base)
  })
}

function atbash(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base))
  })
}

const MORSE: Record<string, string> = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F',
  '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L',
  '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R',
  '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
  '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2',
  '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7',
  '---..': '8', '----.': '9', '.-.-.-': '.', '--..--': ',', '-.-.-.': ';',
  '..--..': '?', '-....-': '-', '-..-.': '/', '-.--.': '(', '-.--.-': ')',
}

function fromMorse(s: string): string | null {
  if (!/^[.\-\s/|]+$/.test(s.trim()) || !s.includes('.') || !s.includes('-')) return null
  const words = s.trim().split(/\s*[/|]\s*|\s{3,}/)
  const decoded = words
    .map((w) => w.trim().split(/\s+/).map((c) => MORSE[c] ?? '').join(''))
    .join(' ')
    .trim()
  return decoded.length >= 2 ? decoded : null
}

function fromGzipB64(s: string): string | null {
  // Handles base64 of gzip/zlib blobs — very common in web/misc.
  const clean = s.trim().replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/_=-]+$/.test(clean) || clean.length < 8) return null
  const norm = clean.replace(/-/g, '+').replace(/_/g, '/')
  const pad = norm + '='.repeat((4 - (norm.length % 4)) % 4)
  let raw: Buffer
  try {
    raw = Buffer.from(pad, 'base64')
  } catch {
    return null
  }
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.inflateRawSync, zlib.brotliDecompressSync]) {
    try {
      const out = (fn as any)(raw) as Buffer
      if (out && out.length && looksText(out, 0.7)) return out.toString('utf-8')
    } catch {
      /* try next */
    }
  }
  return null
}

/* ---------- recursive engine ---------- */

const CODECS: Array<[string, Transform]> = [
  ['base64', fromBase64],
  ['base32', fromBase32],
  ['base58', fromBase58],
  ['base85', fromBase85],
  ['hex', fromHex],
  ['binary', fromBinary],
  ['decimal', fromDecimalBytes],
  ['octal', fromOctalBytes],
  ['url', fromUrl],
  ['morse', fromMorse],
  ['gzip/zlib', fromGzipB64],
]

export interface DecodeResult {
  hits: DecodeHit[]
  flags: string[]
}

/**
 * Recursively apply every codec. On each successful, text-looking result that
 * differs from its parent, recurse (up to maxDepth). ROT-N and Atbash are tried
 * once per node (not recursed, to avoid explosion) but their outputs are scanned
 * for flags.
 */
export function deepDecode(input: string, maxDepth = 4): DecodeResult {
  const hits: DecodeHit[] = []
  const flags = new Set<string>()
  const seen = new Set<string>()

  function visit(s: string, depth: number, chain: string[]) {
    if (depth > maxDepth || s.length > 100000) return
    for (const [name, fn] of CODECS) {
      let out: string | null
      try {
        out = fn(s)
      } catch {
        out = null
      }
      if (!out || out === s) continue
      const key = name + '::' + out.slice(0, 200)
      if (seen.has(key)) continue
      seen.add(key)
      const path = [...chain, name]
      hits.push({ codec: name, value: out, depth, path })
      for (const f of extractFlags(out)) flags.add(f)
      visit(out, depth + 1, path)
    }
    // ciphers (non-recursive scan)
    for (let n = 1; n <= 25; n++) {
      const r = rotN(s, n)
      if (r !== s) for (const f of extractFlags(r)) flags.add(f)
    }
    const ab = atbash(s)
    if (ab !== s) {
      for (const f of extractFlags(ab)) flags.add(f)
    }
  }

  // also scan the raw input for flags and obvious ROT on the whole thing
  for (const f of extractFlags(input)) flags.add(f)
  visit(input, 1, [])
  return { hits, flags: Array.from(flags) }
}

/** Try every ROT shift and report the ones that yield flags or readable text. */
export function rotBrute(s: string): string[] {
  const out: string[] = []
  for (let n = 1; n <= 25; n++) {
    const r = rotN(s, n)
    const fl = extractFlags(r)
    if (fl.length) out.push(`ROT${n}: ${r}   <-- ${fl.join(', ')}`)
  }
  out.push(`Atbash: ${atbash(s)}`)
  return out
}

export { rotN, atbash }
