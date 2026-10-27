import { textTool, ToolFactory } from '../util/tool'
import { runPyHelper, hasTool, safeExec, section } from '../util'

export const cryptoTools: ToolFactory = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_hash_id — identify a hash.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_hash_id',
    category: 'crypto',
    description:
      'Identify the likely algorithm of a hash string (by length/charset and, if installed, hashid/hash-identifier), and suggest the matching hashcat/john mode. Use before cracking a hash.',
    parameters: {
      hash: { type: 'string', required: true, description: 'The hash string' },
    },
    execute(args) {
      const h = String(args.hash).trim()
      const parts: string[] = []
      if (hasTool('hashid')) parts.push(section('hashid', safeExec(`hashid -m "${h.replace(/"/g, '')}"`, { tolerateFail: true })))
      parts.push(section('heuristic', runPyHelper('hash_id.py', [h])))
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_crypto_rsa — RSA attack suite.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_crypto_rsa',
    category: 'crypto',
    description:
      'RSA attack suite. Give whatever you have (n, e, c, and optionally p, q, phi, d, or multiple (n,e,c) sets). Automatically tries: factordb lookup, trivial/small factors, Fermat (close primes), small-e e-th root (Håstad single), Wiener (small d), common-modulus, shared-prime GCD, and direct decrypt when the key is recoverable. Returns the plaintext/flag if found.',
    parameters: {
      n: { type: 'string', required: false, description: 'Modulus n (decimal or 0x hex)' },
      e: { type: 'string', required: false, description: 'Public exponent e (default 65537)' },
      c: { type: 'string', required: false, description: 'Ciphertext c' },
      p: { type: 'string', required: false, description: 'Known prime p' },
      q: { type: 'string', required: false, description: 'Known prime q' },
      extra: {
        type: 'string',
        required: false,
        description: 'JSON for advanced modes, e.g. {"sets":[{"n":..,"e":..,"c":..},{..}]} for common-modulus/Håstad/shared-prime',
      },
    },
    execute(args) {
      const a: string[] = []
      if (args.n) a.push('--n', String(args.n))
      if (args.e) a.push('--e', String(args.e))
      if (args.c) a.push('--c', String(args.c))
      if (args.p) a.push('--p', String(args.p))
      if (args.q) a.push('--q', String(args.q))
      if (args.extra) a.push('--extra', String(args.extra))
      return runPyHelper('rsa_attacks.py', a, { timeoutMs: 60000 })
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_crypto_xor — XOR analysis.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_crypto_xor',
    category: 'crypto',
    description:
      'XOR cryptanalysis. Modes: single-byte brute force (scored by English/flag likeness), repeating-key recovery (Hamming-distance keysize + per-column frequency), and known-plaintext key recovery (give a crib like "flag{"). Input ciphertext as hex or base64.',
    parameters: {
      data: { type: 'string', required: true, description: 'Ciphertext (hex or base64)' },
      encoding: { type: 'string', required: false, description: 'Input encoding: hex (default) or base64' },
      mode: { type: 'string', required: false, description: 'single | repeating | known (default: auto-try all)' },
      crib: { type: 'string', required: false, description: 'Known plaintext substring for "known" mode, e.g. flag{' },
    },
    execute(args) {
      const a = ['--data', String(args.data), '--encoding', String(args.encoding || 'hex'), '--mode', String(args.mode || 'auto')]
      if (args.crib) a.push('--crib', String(args.crib))
      return runPyHelper('xor_tools.py', a, { timeoutMs: 30000 })
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_crypto_classical — classical ciphers + frequency analysis.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_crypto_classical',
    category: 'crypto',
    description:
      'Classical cipher toolkit: Caesar/ROT brute force, Vigenère (auto key-length via Kasiski/IoC + decrypt with given or guessed key), Atbash, rail-fence brute, and letter-frequency analysis for substitution ciphers. Use for "classical crypto" challenges.',
    parameters: {
      text: { type: 'string', required: true, description: 'The cipher text' },
      cipher: { type: 'string', required: false, description: 'caesar | vigenere | atbash | railfence | freq | auto (default auto)' },
      key: { type: 'string', required: false, description: 'Key for Vigenère (if known)' },
    },
    execute(args) {
      const a = ['--text', String(args.text), '--cipher', String(args.cipher || 'auto')]
      if (args.key) a.push('--key', String(args.key))
      return runPyHelper('crypto_classical.py', a, { timeoutMs: 30000 })
    },
  }),
]
