---
name: ctf-misc
description: >
  CTF misc / catch-all workflow — jails & sandbox escapes, esoteric encodings,
  QR/barcodes, programming (PPC) tasks, OSINT, and "guessy" puzzles that don't
  fit a standard category. Use when nothing else matches.
---

# CTF Misc Workflow

## 1. Re-triage relentlessly
Run `ctf_triage` / `ctf_auto_decode` on every artefact. Misc flags are usually
behind an unusual encoding or a chain of them.

## 2. Esoteric encodings / languages
- **Brainfuck** (`+-<>[].,`), **Ook!**, **Malbolge**, **Whitespace** (only
  spaces/tabs/newlines), **Piet** (image). Run interpreters via `ctf_run`.
- **Base-anything**, **ROT47**, **Bacon**, **Tap code**, **A1Z26**,
  **Vigenère/Caesar** (→ `ctf_crypto_classical`).
- **Emoji / unicode** stego, zero-width characters (U+200B/C/D) — strip and reveal.
- Use CyberChef's "Magic" / this plugin's `ctf_auto_decode` for layered ones.

## 3. Jails & sandbox escapes
- **Python jail**: use `ctf_pyjail` — give it the blacklist and it emits escape
  payloads that avoid it, plus `chr()` builders for banned words. Techniques:
  `__builtins__`, `().__class__.__base__.__subclasses__()`, `getattr`, f-strings,
  `breakpoint()`. If `eval/exec` filtered, build strings with `chr()`/unicode.
- **Bash/shell restricted (rbash)**: `$()`, `${IFS}` for spaces, `/???/??t`
  globbing, `$'\x..'`, env/`$PATH` tricks, `cat<flag`.
- **SQL / template / regex** jails: same idea — reach a primitive the filter
  forgot.
Identify the allowed character set, then compose the payload from it.

## 4. Programming / PPC
Automate the interaction with `ctf_run` + a Python script: connect (`pwntools
remote`), parse the prompt, compute, send — often hundreds of rounds under a time
limit. Common: arithmetic storms, maze solving, encoding round-trips, simple ML.

## 5. QR / barcodes / signals
`ctf_qr` decodes QR/EAN from an image. Partial/damaged QR → reconstruct finder patterns.
Audio signals → SSTV (`qsstv`), DTMF, Morse, radio (`gnuradio`/`inspectrum`).

## 6. OSINT
Reverse image search, EXIF GPS, usernames across platforms, Wayback Machine,
certificate transparency, DNS history. Stay within the challenge's intended scope.

## 7. "Guess" tasks
Check filenames, challenge title, author, and description for puns/hints. Try the
obvious flag format. If truly stuck, it's often an encoding you haven't tried —
loop back to `ctf_auto_decode` with a higher `max_depth`.

Always `ctf_extract_flags` on results, with `prefix=` set to the competition format.
