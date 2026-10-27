---
name: ctf-forensics
description: >
  CTF forensics workflow — file carving, metadata, network captures (pcap),
  disk/memory images, archive & document cracking, and log analysis. Use for
  "recover the data" challenges with files, captures, or images (non-stego).
---

# CTF Forensics Workflow

## 1. Fingerprint — `ctf_analyze_file`
file type, entropy, strings (ascii + utf-16), hexdump head/tail, exiftool,
binwalk, and carving hints — in one call. Pass `extract=true` to auto-run
`binwalk -e`. Mismatched extension vs magic? Trust the magic bytes.

## 2. Carving embedded files
- `binwalk -e file` (or `--dd=".*"`), then `ctf_triage` each extracted file.
- `foremost -i file -o out` for header-based carving.
- Appended data after a valid file (e.g. ZIP after PNG) is extremely common —
  check the tail hexdump; `unzip file.png` sometimes just works.
- Fix broken magic/headers by hand (PNG `89 50 4E 47`, JPG `FF D8 FF`, ZIP `50 4B`).

## 3. Network captures — `ctf_pcap`
protocol hierarchy, conversations, HTTP requests, DNS, and a flag/credential
sweep. Follow up:
- Export objects: Wireshark *File ▸ Export Objects ▸ HTTP/SMB/TFTP*, or
  `tshark -r f --export-objects http,outdir`.
- Follow a stream: `tshark -r f -q -z follow,tcp,ascii,<n>`.
- USB HID (keystrokes) → `ctf_pcap_usb` decodes `usb.capdata` to typed text.
- Extract files from FTP/TFTP/SMB; decode exfil over DNS/ICMP payloads.
- TLS with a provided key → set `(Pre)-Master-Secret log` to decrypt.

## 4. Archives & documents — `ctf_crack_archive`
Encrypted zip/rar/7z/pdf → `*2john` + John with a wordlist (bundled, or pass a
bigger one). Alternatives: `fcrackzip -u -D -p rockyou.txt f.zip`. Also:
- ZIP known-plaintext (if one file's plaintext is known) → `bkcrack`.
- Office docs → `office2john`; look inside (`unzip docx`) for XML, media, macros
  (`olevba` for VBA macros / embedded payloads).
- PDF → `pdfdetach`, `pdf-parser`, `qpdf --decrypt`; hidden layers/objects.

## 5. Disk & memory images
- Disk: `mmls`, `fls`, `icat` (Sleuth Kit); `testdisk`/`photorec` to recover
  deleted files; mount read-only and grep.
- Memory: **`ctf_memory`** (Volatility 3) — `windows.pslist`, `windows.cmdline`,
  `windows.filescan` + `dumpfiles`, `windows.hashdump`, `windows.netscan`;
  `linux.*` for Linux dumps.

## 6. Logs & misc
`grep`/`awk` for anomalies, timestamps, base64 blobs in logs. Git history
(`git log -p`, `git stash list`), EXIF GPS, and timestamps all hide flags.

Run anything via `ctf_run`; finish every artefact with `ctf_extract_flags`.
If the file is an image/audio and nothing carves out, switch to **ctf-stego**.
