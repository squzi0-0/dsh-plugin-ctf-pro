#!/usr/bin/env python3
"""
Standalone file fingerprint (CLI mirror of ctf_analyze_file).
Usage: file_analyze.py <path>
Run with python -I.
"""
import os, shutil, subprocess, sys, math
from collections import Counter


def run(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30).stdout
    except Exception as e:
        return "[err] %s" % e


def entropy(path):
    with open(path, "rb") as f:
        data = f.read(1 << 18)
    if not data:
        return 0.0
    cnt = Counter(data)
    n = len(data)
    return -sum((c / n) * math.log2(c / n) for c in cnt.values())


def main():
    if len(sys.argv) < 2 or not os.path.exists(sys.argv[1]):
        print("usage: file_analyze.py <path>"); return
    p = sys.argv[1]
    print("### file\n" + run('file "%s"' % p))
    print("### size / entropy\n%d bytes | %.2f bits/byte" % (os.path.getsize(p), entropy(p)))
    print("### strings (first 50)\n" + run('strings -n 6 "%s" | head -50' % p))
    print("### hexdump (256B)\n" + run('xxd -l 256 "%s"' % p))
    if shutil.which("exiftool"):
        print("### exiftool\n" + run('exiftool "%s"' % p))
    if shutil.which("binwalk"):
        print("### binwalk\n" + run('binwalk "%s"' % p))
    missing = [t for t in ("exiftool", "binwalk", "foremost") if not shutil.which(t)]
    if missing:
        print("### missing\n" + ", ".join(missing))


if __name__ == "__main__":
    main()
