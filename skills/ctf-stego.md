---
name: ctf-stego
description: >
  CTF steganography workflow — hidden data in images and audio: LSB, appended
  data, metadata, palette tricks, spectrograms, and stego tools (zsteg, steghide,
  stegsolve). Use when the challenge is an image or sound file hiding a flag.
---

# CTF Stego Workflow

## 1. Battery — `ctf_stego`
Runs exiftool, strings, pngcheck/zsteg (PNG/BMP), steghide extract (JPG/WAV,
tries empty + given password), an LSB plane scan, and audio hints — in one call.
Pass `password=` if you have a guess.

## 2. Order of attack (images)
1. **Metadata & appended data**: `exiftool`, `strings`, tail hexdump; `binwalk`
   for embedded files (flags are often just appended or in a comment field).
2. **LSB**: `zsteg -a file.png` (PNG/BMP) covers most bit planes/orders. The
   plugin's python LSB fallback scans R/G/B/A, MSB/LSB order, row/column.
3. **steghide** (JPG/WAV/BMP): needs a password — try empty, then crack with
   `stegseek file.jpg rockyou.txt` (very fast) or `steghide extract -p <pw>`.
4. **Visual planes**: `ctf_stego_planes` exports every channel bit-plane as PNGs
   (StegSolve-style) and scans them for QR — open bit0 of each channel first.
5. **Dimensions**: a PNG with a too-small IHDR height can hide pixels — edit the
   height bytes to reveal the bottom of the image. `pngcheck -v` flags CRC issues.
6. **Palette / transparency**: hidden text in a near-identical palette index or
   fully transparent pixels.

## 3. Audio
- Open the **spectrogram** (Audacity / Sonic Visualiser) — text is frequently
  drawn there. `sox file.wav -n spectrogram -o out.png`.
- **LSB in samples**: extract raw samples and read low bits.
- **DTMF / Morse** tones → decode with a DTMF/Morse decoder.
- Reverse / slow down / isolate channels (`sox`), check for SSTV images.

## 4. Other containers
- **GIF**: inspect each frame (`convert file.gif out%d.png`), frame timing can
  encode bits.
- **PDF/SVG/Office**: hidden layers, white-on-white text, embedded objects.
- **QR / barcodes** inside images → `ctf_qr` (zbarimg).

## 5. Tooling via `ctf_run`
`zsteg -a`, `stegseek`, `steghide`, `stegsolve`, `sox`, `zbarimg`, `pngcheck`,
`exiftool`, `binwalk`. Then `ctf_extract_flags` on anything recovered, and
re-`ctf_triage` any carved file (the hidden payload may itself be encoded).
