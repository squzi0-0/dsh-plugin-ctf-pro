---
name: ctf-triage
description: >
  Master CTF workflow and category router. Load this FIRST on any CTF task to
  decide the category, pick the right tools, and avoid wasted rounds. Use when
  a challenge arrives and the category is not yet obvious.
---

# CTF Master Workflow

> Scope: only analyse files, binaries, and targets you are authorised to — your
> own challenges or the ones a competition explicitly provides. Never point
> network tools at third-party infrastructure.

## 0. Fast path — try `ctf_solve` FIRST
Call `ctf_solve` on the file path / URL / text blob before anything else. It is
the autopilot: it triages, recursively decodes, runs strings/metadata/stego/
carving/web-probes **in parallel**, and returns the flag in a **single call**
whenever the challenge is auto-solvable (encodings, strings-in-file, LSB,
appended data, exposed `/flag`, simple RSA). Pass `prefix=` (e.g. `KUBSTU`) for
accuracy. This collapses many model↔tool round-trips into one — the key to speed.

If `ctf_solve` returns "needs reasoning", it tells you the category and which
skill/tool to use next. Then:

## 0b. Confirm category with `ctf_triage`
`ctf_triage` reports detected category, file type, present encodings, quick flag
hits, and which category skill to load. Use it when the autopilot didn't solve
outright and you want the routing detail.

## 1. Identify the category
| Signal | Category | Load skill | First tool |
|---|---|---|---|
| URL / web app | web | `ctf-web` | `ctf_web_probe` |
| ELF/PE/Mach-O, "executable" | reverse / pwn | `ctf-reverse`, `ctf-pwn` | `ctf_reverse` |
| image / audio | stego | `ctf-stego` | `ctf_stego` |
| pcap / network capture | forensics | `ctf-forensics` | `ctf_pcap` |
| zip/rar/7z/pdf (maybe locked) | forensics | `ctf-forensics` | `ctf_analyze_file` / `ctf_crack_archive` |
| encoded text, n/e/c, cipher | crypto | `ctf-crypto` | `ctf_auto_decode` / `ctf_crypto_*` |
| smart contract / web3 / chain | blockchain | `ctf-blockchain` | `ctf_run` |
| none of the above | misc | `ctf-misc` | `ctf_auto_decode` |

## 2. Universal reflexes (any category)
- Any suspicious string → `ctf_auto_decode` (it recurses: base64→hex→gzip etc.).
- After **every** decode/extract/decrypt → `ctf_extract_flags` (pass `prefix=`
  for comp-specific formats, e.g. `KUBSTU`, `CSSCTF`).
- Unknown file → `ctf_analyze_file` before committing to a category.
- Need a tool the plugin doesn't wrap → `ctf_run` (zsteg, sage, nc, etc.).

## 3. Flag format & submission
Confirm the expected flag format early (e.g. `KUBSTU{...}`, `CSSCTF{...}`).
Submit exactly as specified — watch for trailing whitespace, case, and
rot13'd/encoded flags that must be decoded before submitting. Submit with
`ctf_submit` (CTFd HTTP or nc checker), or let `ctf_solve submit_url=...` do it
automatically when it finds the flag.

## 4. When stuck
- Re-run `ctf_triage` on any intermediate artefact you extracted.
- Entropy ≈ 8.0 → encrypted/compressed, not plaintext — look for the key.
- Combine tools: `ctf_analyze_file` → carve embedded file → `ctf_triage` on it.
- Check the challenge description/attachments for hints (ports, hints in names).

## 5. Speed / efficiency (how to solve FAST)
- **Round-trips are the bottleneck.** Every tool call is a full model turn. One
  tool that does the whole chain beats ten small calls — that's why `ctf_solve`
  exists. Reach for it first on every task.
- Prefer one broad tool call over many narrow `ctf_run` calls.
- Use a **cheap/fast model** for triage, decoding and orchestration; escalate to
  a strong reasoning model only for the hard step (crypto math, pwn chain).
- Remote service? Use `ctf_nc` (send lines, capture, auto-scan) instead of raw
  `ctf_run` loops; for scripted multi-round interaction use `ctf_pwn_template`.
- Output is length-capped; if truncated, narrow with a filter or grep via `ctf_run`.
- Don't guess crypto by hand — the `ctf_crypto_*` tools already brute the common cases.
