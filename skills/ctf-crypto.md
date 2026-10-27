---
name: ctf-crypto
description: >
  CTF cryptography workflow — encodings, RSA, XOR, classical ciphers, hashes,
  and modern symmetric crypto (AES modes, padding/bit-flipping oracles). Use
  when a challenge involves encoded messages, keys, n/e/c, or math puzzles.
---

# CTF Crypto Workflow

## 1. Is it just an encoding?
Run `ctf_auto_decode` first — it recursively tries Base64/32/58/85, hex, binary,
decimal, octal, URL, Morse, gzip/zlib, ROT-N and Atbash and chains them.
Quick identification cheatsheet:
- Base64: `A–Z a–z 0–9 + /`, length %4, often `=`/`==` padding. URL-safe uses `-_`.
- Base32: `A–Z 2–7`, `=` padding. Base58: no `0 O I l`. Base85: `!–u`.
- Hex: `0–9 a–f`. Binary: only `0/1`. Decimal bytes: space/comma separated 0–255.

## 2. RSA — use `ctf_crypto_rsa`
Pass whatever you have (`n`, `e`, `c`, optional `p`/`q`, or multiple sets via
`extra`). It auto-tries, cheapest first:
- supplied p/q or p|n → direct decrypt
- **small e** (e=3) with `m^e < n` → e-th root (Håstad single / no padding)
- **factordb** lookup
- trivial / small factors
- **Fermat** (p and q close)
- **Wiener** (small d, i.e. very large e)
- **Pollard rho** (one small-ish factor)
- multi-set: **common modulus** (same n, different e), **Håstad broadcast**
  (same e across ≥e recipients), **shared-prime GCD** (two n share a factor)

For attacks it doesn't cover, drop to `ctf_run` with SageMath / `RsaCtfTool`:
- **Coppersmith / stereotyped message / partial key** → Sage `small_roots`.
- **LSB / parity oracle** → script the oracle, binary-search the plaintext.
- **Franklin–Reiter** (related messages, same n,e) → Sage resultants.

## 3. XOR — use `ctf_crypto_xor`
- `mode=single` — single-byte key brute, reports any key that yields a flag.
- `mode=repeating` — guesses key size (Hamming) and recovers it column-by-column.
  Needs enough ciphertext (several × key length).
- `mode=known --crib flag{` — recover the key from known plaintext.
- Input as `hex` (default) or `base64`.
Trick: if the flag format is known, XOR ciphertext ⊕ `flag{` gives the key start.

## 4. Classical ciphers — use `ctf_crypto_classical`
Caesar/ROT brute, Vigenère (auto key-length via IoC/Kasiski, or `--key`), Atbash,
rail-fence brute, and frequency analysis for substitution. IoC ≈ 0.067 ⇒
mono-alphabetic/transposition; IoC ≈ 0.038 ⇒ polyalphabetic (Vigenère).

## 5. Hashes
`ctf_hash_id` names the algorithm and mode; `ctf_crack_hash` identifies **and**
cracks it in one call (hashcat/john + wordlist — pass `wordlist=rockyou`). For
anything exotic, drop to `ctf_run` with the exact hashcat/john invocation.

## 6. Modern symmetric (AES etc.) — use `ctf_crypto_aes`
`ctf_crypto_aes` does ECB detection, raw enc/dec (ECB/CBC/CTR), and CBC bit-flip
edits. Patterns:
- **ECB** (identical 16-byte blocks repeat → `op=detect`) → cut-and-paste /
  byte-at-a-time decryption against an oracle.
- **CBC bit-flipping** (`op=flip`) → flip a byte in block i−1 to change the
  corresponding byte of plaintext block i.
- **CBC padding oracle** → use `padbuster` or a script via `ctf_run`; decrypt
  byte-by-byte.
- **Nonce reuse** (CTR/GCM/stream) → XOR the two ciphertexts, crib-drag
  (`ctf_crypto_xor`).

## 7. Always finish
Run `ctf_extract_flags` on every decrypted result. Decode the flag fully before
submitting (it may itself be rot13/base64).
