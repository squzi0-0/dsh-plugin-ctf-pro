#!/usr/bin/env python3
"""
LSB stego extractor. Pulls the low bit-planes of an image and scans for ASCII
flags/text in several bit orderings and channel selections.

Needs Pillow. If absent, prints an install hint (zsteg covers PNG/BMP anyway).
Run with python -I.
"""
import re, sys

FLAG_RE = re.compile(rb"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}")


def bits_to_bytes(bits):
    out = bytearray()
    for i in range(0, len(bits) - 7, 8):
        byte = 0
        for b in bits[i:i + 8]:
            byte = (byte << 1) | b
        out.append(byte)
    return bytes(out)


def scan(data, label, results):
    m = FLAG_RE.search(data)
    if m:
        results.append("[FLAG] (%s) %s" % (label, m.group(0).decode("latin1")))
        return
    # readable run
    printable = bytes(c for c in data if 32 <= c <= 126)
    runs = re.findall(rb"[\x20-\x7e]{8,}", data)
    if runs:
        longest = max(runs, key=len)[:120]
        if len(longest) >= 10:
            results.append("[text] (%s) %r" % (label, longest))


def main():
    path = sys.argv[1]
    try:
        from PIL import Image  # type: ignore
    except Exception:
        print("Pillow not installed (pip install pillow). Use zsteg for PNG/BMP instead.")
        return
    try:
        img = Image.open(path).convert("RGBA")
    except Exception as e:
        print("could not open image: %s" % e)
        return
    px = list(img.getdata())
    w, h = img.size
    results = []

    channels = {"R": 0, "G": 1, "B": 2, "A": 3}
    # per-channel LSB, MSB-first and LSB-first
    for cname, ci in channels.items():
        if cname == "A" and all(p[3] == 255 for p in px[:1000]):
            continue
        bits_msb = [(p[ci] & 1) for p in px]
        scan(bits_to_bytes(bits_msb), "LSB %s row-major" % cname, results)
        # reversed bit order
        scan(bits_to_bytes(bits_msb[::-1]), "LSB %s reversed" % cname, results)

    # combined RGB LSB in pixel order (common for zsteg b1,rgb,lsb,xy)
    bits_rgb = []
    for p in px:
        bits_rgb.extend([p[0] & 1, p[1] & 1, p[2] & 1])
    scan(bits_to_bytes(bits_rgb), "LSB RGB combined", results)

    # column-major (xy transposed)
    bits_col = []
    for x in range(w):
        for y in range(h):
            p = px[y * w + x]
            bits_col.append(p[0] & 1)
    scan(bits_to_bytes(bits_col), "LSB R column-major", results)

    if results:
        print("\n".join(dict.fromkeys(results)))
    else:
        print("No ASCII flag/text in LSB planes (tried R/G/B/A, MSB/LSB bit order, row/column). "
              "Try zsteg -a, higher bit planes, or stegsolve plane browser.")


if __name__ == "__main__":
    main()
