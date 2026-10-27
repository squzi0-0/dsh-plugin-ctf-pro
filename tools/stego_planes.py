#!/usr/bin/env python3
"""
Bit-plane extractor (StegSolve-style). Saves each colour channel's bit planes as
black/white PNGs for visual inspection, and reports where images were written.

  stego_planes.py <image> [outdir] [--planes 0,1,2]

Needs Pillow. Run with python -I.
"""
import os, sys


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = [a for a in sys.argv[1:] if a.startswith("--")]
    if not args:
        print("usage: stego_planes.py <image> [outdir] [--planes 0,1,2]"); return
    path = args[0]
    outdir = args[1] if len(args) > 1 else (os.path.splitext(path)[0] + "_planes")
    planes = [0, 1, 2, 7]
    for o in opts:
        if o.startswith("--planes"):
            planes = [int(x) for x in o.split("=", 1)[1].split(",")]

    try:
        from PIL import Image
    except Exception:
        print("Pillow not installed (pip install pillow). Use StegSolve GUI instead."); return

    try:
        img = Image.open(path).convert("RGB")
    except Exception as e:
        print("cannot open image: %s" % e); return

    os.makedirs(outdir, exist_ok=True)
    w, h = img.size
    px = img.load()
    written = []
    channels = {"R": 0, "G": 1, "B": 2}
    for cname, ci in channels.items():
        for bit in planes:
            out = Image.new("1", (w, h))
            op = out.load()
            for y in range(h):
                for x in range(w):
                    op[x, y] = 255 if (px[x, y][ci] >> bit) & 1 else 0
            fn = os.path.join(outdir, "plane_%s_bit%d.png" % (cname, bit))
            out.save(fn)
            written.append(fn)

    print("Wrote %d plane images to %s" % (len(written), outdir))
    for f in written:
        print("  " + f)
    print("\nOpen these (especially bit0 of each channel) and look for text/QR hidden in the pixels.")


if __name__ == "__main__":
    main()
