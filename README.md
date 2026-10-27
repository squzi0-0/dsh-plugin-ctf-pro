# dsh-plugin-ctf-pro

A professional-grade **CTF toolkit** plugin for DSH. It turns the model from a
general chatbot into a CTF specialist by giving it two things:

- **Tools** — 29 `ctf_*` functions that do the mechanical work (decode, analyse,
  crack, probe, exploit scaffolding, submit) and return results straight into context.
- **Skills** — 9 expert `SKILL.md` workflows (one per category) the model loads
  on demand so it follows proven recipes instead of guessing.

This is a ground-up expansion of the original 5-tool prototype: a one-call
**autopilot** (`ctf_solve`), recursive decoding, a real RSA attack engine,
XOR/classical cryptanalysis, forensics & stego batteries, pcap analysis,
archive/JWT cracking, reverse/pwn recon with a pwntools generator, web
recon/fuzzing, remote-service interaction, and category skills covering web,
crypto, reverse, pwn, forensics, stego, blockchain and misc.

### Built for speed
The slow part of an LLM+tools loop is the **number of model↔tool round-trips**.
This plugin minimises them: `ctf_solve` runs the whole pipeline internally with
**parallel** sub-steps and returns the flag in a single call for the large class
of auto-solvable challenges; every tool scans its own output for flags; and
output is capped so the model reads less. Pair it with model routing (fast model
for triage/decoding, strong reasoning model only for the hard step).

> **Authorised use only.** Everything here is for CTF challenges and systems you
> own or are explicitly allowed to test. Several tools run external commands and
> touch the network — point them only at challenge infrastructure.

---

## Tools

| Tool | Category | What it does |
|---|---|---|
| `ctf_solve` | meta | **Autopilot — try first.** Runs the whole pipeline (triage → decode → strings/metadata → stego/carve/stegseek → USB → web probe/git-dump → auto-RSA) in parallel, returns the flag in one call, and can auto-submit it (`submit_url=`). |
| `ctf_triage` | meta | Classifies a file/URL/blob, finds quick flags, routes to the right tool + skill. |
| `ctf_auto_decode` | crypto | Recursive multi-codec decoder (base64/32/58/85, hex, binary, decimal, octal, URL, Morse, gzip/zlib, ROT, Atbash), auto-chains and extracts flags. |
| `ctf_extract_flags` | meta | Flag regex over text/file, custom prefixes (`KUBSTU`, `CSSCTF`, …). |
| `ctf_run` | meta | Run any CTF shell command (zsteg, sage, john, nc, …), length-capped. |
| `ctf_hash_id` | crypto | Identify a hash + the matching `hashcat -m` / `john --format`. |
| `ctf_crack_hash` | crypto | Identify **and** crack a hash with hashcat/john + wordlist. |
| `ctf_crypto_rsa` | crypto | RSA suite: factordb, small-e root, Fermat, Wiener, Pollard, common-modulus, Håstad broadcast, shared-prime GCD. |
| `ctf_crypto_xor` | crypto | XOR: single-byte brute, repeating-key recovery, known-plaintext/crib. |
| `ctf_crypto_classical` | crypto | Caesar/ROT, Vigenère (auto key-length), Atbash, rail-fence, frequency analysis. |
| `ctf_crypto_aes` | crypto | AES: ECB detection, enc/dec (ECB/CBC/CTR), CBC bit-flip editing. |
| `ctf_web_probe` | web | URL recon: headers, tech, cookies, security headers, source-leak paths. |
| `ctf_web_fuzz` | web | Content discovery with ffuf/gobuster + bundled wordlist (dir & vhost). |
| `ctf_jwt` | web | Decode/audit JWT, crack HS256 secret, forge (alg=none / given secret). |
| `ctf_analyze_file` | forensics | One-shot fingerprint: type, entropy, strings, hexdump, exiftool, binwalk. |
| `ctf_stego` | forensics | Image/audio stego battery: zsteg, steghide, pngcheck, LSB planes, spectrogram hint. |
| `ctf_pcap` | forensics | tshark analysis: protocol hierarchy, conversations, HTTP/DNS, flag/cred sweep. |
| `ctf_pcap_usb` | forensics | Decode USB-HID keyboard keystrokes from a capture into typed text. |
| `ctf_crack_archive` | forensics | Crack zip/rar/7z/pdf passwords via `*2john` + John. |
| `ctf_memory` | forensics | Volatility 3 memory-image forensics (pslist, cmdline, filescan, hashdump, …). |
| `ctf_stego_planes` | forensics | Export image bit-planes (StegSolve-style) + QR scan of planes. |
| `ctf_qr` | misc | Decode QR codes / barcodes from an image (zbarimg) and scan for flags. |
| `ctf_pyjail` | misc | Generate Python-jail escape payloads that avoid a given blacklist. |
| `ctf_reverse` | reverse | Binary triage: checksec, symbols, imports, packer, r2 disasm, pyc/.NET hints. |
| `ctf_disasm` | reverse | Disassemble one function/address (radare2 or objdump). |
| `ctf_pwn_recon` | pwn | checksec, GOT/PLT, ROP gadgets, one_gadget, libc id. |
| `ctf_pwn_template` | pwn | Generate a ready-to-edit pwntools `exploit.py`. |
| `ctf_nc` | misc | Talk to a remote service: connect, send lines, capture transcript, auto-scan for flags. |
| `ctf_submit` | meta | Submit a flag to a checker (CTFd-style HTTP or nc) and report acceptance. |

## Skills

`ctf-triage` (master router), `ctf-web`, `ctf-crypto`, `ctf-reverse`, `ctf-pwn`,
`ctf-forensics`, `ctf-stego`, `ctf-blockchain`, `ctf-misc`.

Each is a concise, battle-tested workflow: what to run, in what order, the common
vulns/pitfalls, and exactly which `ctf_*` tool to call at each step.

---

## Install

```bash
# 1. Build the TypeScript entry (produces lib/index.js)
npm install
npm run build

# 2. Add the plugin to a DSH profile
dsh plugin --profile web add /path/to/dsh-plugin-ctf-pro
#   or from GitHub:
# dsh plugin --profile web add github:YourName/dsh-plugin-ctf-pro

# 3. Skill files ship under skills/ (package.json -> dsh.skills). If your DSH
#    loads skills from ~/.dsh/skills, copy them there:
cp -r skills/* ~/.dsh/skills/   # optional, depending on your DSH setup

# 4. Restart DSH so the tool plugin loads.
```

Pre-built `lib/index.js` is included, so step 1 is optional if you don't modify
the source.

### Usage

Start a chat with something like:

> This is a CTF challenge. Triage `/path/to/challenge` and help me find the flag.

The model calls `ctf_triage`, loads the matching skill, and works the problem
with the `ctf_*` tools.

---

## External tool dependencies (optional, auto-detected)

Tools degrade gracefully — each reports what's missing. For full power install:

- **Core**: `file`, `binutils` (strings/nm/objdump), `xxd`, `curl`, `python3`
- **Forensics/stego**: `binwalk`, `foremost`, `exiftool`, `zsteg` (gem),
  `steghide`, `stegseek`, `pngcheck`, `tshark`, `sox`, `zbar-tools`,
  `volatility3` (`pipx install volatility3`), `pillow` (bit planes/LSB)
- **Crypto**: `john` (jumbo), `hashcat`, `hashid`; python `gmpy2`, `pycryptodome`,
  `sympy`; `sagemath` for lattice/Coppersmith
- **Reverse/pwn**: `radare2`, `gdb` (+ pwndbg/gef), `checksec`, `ROPgadget`
  (`pip install ropgadget`), `one_gadget` (gem), python `pwntools`
- **Web**: `ffuf` or `gobuster`, `sqlmap`, `git-dumper` (`pip install git-dumper`)
- **Blockchain**: Foundry (`cast`), `web3`/`ethers`
- **Python imaging**: `pillow` (for the LSB fallback)

```bash
pip install pwntools pycryptodome gmpy2 sympy ropgadget pillow
```

## Layout

```
dsh-plugin-ctf-pro/
├── package.json          # dsh.bundle.patch + dsh.skills
├── tsconfig.json
├── tsup.config.ts        # bundles src/ -> lib/index.js
├── patches/bundle.yaml
├── lib/index.js          # compiled entry (shipped)
├── src/
│   ├── index.ts          # registers every tool
│   ├── util/             # exec (sync+async/parallel), decode engine, flags, helpers
│   └── tools/            # solve (autopilot), universal, crypto, web, forensics, binary, net, submit, extra
├── skills/               # ctf-*.md expert workflows
├── tools/                # Python engines (RSA/XOR/AES/classical/hash/stego/planes/jwt/usb/netcat/submit/pyjail/decode/file)
└── wordlists/            # small bundled lists (passwords, dirs, jwt secrets)
```

## License

MIT. Provided for lawful security education and authorised CTF competition only.
