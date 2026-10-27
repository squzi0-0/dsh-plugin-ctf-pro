#!/usr/bin/env python3
"""
XOR cryptanalysis for CTF.

Modes:
  single    - single-byte key brute force, scored by text/flag likeness
  repeating - repeating-key XOR: guess key size (Hamming) + per-column brute
  known     - known-plaintext: recover key from a crib (e.g. flag{)
  auto      - try single, then known (if crib), then repeating

Usage:
  xor_tools.py --data HEXORB64 --encoding hex|base64 --mode auto [--crib flag{]

stdlib-only. Run with python -I.
"""
import argparse, base64, re
from itertools import cycle

FREQ = " etaoinshrdlucmfwypvbgkqjxz"  # rough English order (space first)
FLAG_RE = re.compile(rb"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}")
# Stricter: a KNOWN prefix only. XOR garbage frequently contains random {...}
# so a generic PREFIX{...} form produces too many false positives here.
KNOWN_PREFIX = rb"(?:flag|ctf|pico|HTB|CSSCTF|KUBSTU|DUCTF|corctf|uiuctf)"
STRICT_FLAG_RE = re.compile(rb"(?i)" + KNOWN_PREFIX + rb"\{[ -~]{2,120}\}")


def load(data, enc):
    data = data.strip()
    if enc == "base64":
        return base64.b64decode(data + "=" * (-len(data) % 4))
    return bytes.fromhex(re.sub(r"[^0-9a-fA-F]", "", data))


def score(b):
    """Higher is more English-like."""
    s = 0.0
    for ch in b:
        c = chr(ch).lower()
        if c in FREQ:
            s += (len(FREQ) - FREQ.index(c))
        elif 32 <= ch <= 126:
            s += 1
        else:
            s -= 15  # non-printable penalty
    return s / max(len(b), 1)


def xor_bytes(b, key):
    return bytes(x ^ y for x, y in zip(b, cycle(key)))


def single_byte(ct):
    results = []
    for k in range(256):
        pt = bytes(x ^ k for x in ct)
        results.append((score(pt), k, pt))
    results.sort(reverse=True)
    return results


def hamming(a, b):
    return sum(bin(x ^ y).count("1") for x, y in zip(a, b))


def guess_keysizes(ct, lo=2, hi=40, top=4):
    scored = []
    hi = min(hi, len(ct) // 4) or lo
    for ks in range(lo, hi + 1):
        blocks = [ct[i * ks:(i + 1) * ks] for i in range(4)]
        if len(blocks[3]) < ks:
            break
        dists = []
        for i in range(3):
            dists.append(hamming(blocks[i], blocks[i + 1]) / ks)
        scored.append((sum(dists) / len(dists), ks))
    scored.sort()
    return [ks for _, ks in scored[:top]]


def break_repeating(ct, ks):
    key = bytearray()
    for i in range(ks):
        col = ct[i::ks]
        best = max(range(256), key=lambda k: score(bytes(x ^ k for x in col)))
        key.append(best)
    return bytes(key), xor_bytes(ct, bytes(key))


def known_plaintext(ct, crib):
    """Slide the crib; recover repeating key if the keystream repeats."""
    cb = crib.encode() if isinstance(crib, str) else crib
    out = []
    for off in range(0, max(1, len(ct) - len(cb) + 1)):
        key = bytes(ct[off + i] ^ cb[i] for i in range(len(cb)))
        # if key looks like a repeating ascii key, apply it
        if all(32 <= k <= 126 for k in key):
            pt = xor_bytes(ct, key)
            out.append((off, key, pt))
    out.sort(key=lambda t: score(t[2]), reverse=True)
    return out[:5]


def show_flag(pt):
    m = STRICT_FLAG_RE.search(pt) or FLAG_RE.search(pt)
    return m.group(0).decode("latin1") if m else None


def strict_flag(pt):
    m = STRICT_FLAG_RE.search(pt)
    return m.group(0).decode("latin1") if m else None


def all_single_byte_flags(ct):
    """Scan every single-byte key for a strict flag, independent of score rank."""
    hits = []
    for k in range(256):
        pt = bytes(x ^ k for x in ct)
        fl = strict_flag(pt)
        if fl:
            hits.append((k, fl, pt))
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--encoding", default="hex")
    ap.add_argument("--mode", default="auto")
    ap.add_argument("--crib", default="")
    a = ap.parse_args()

    ct = load(a.data, a.encoding)
    if not ct:
        print("[!] empty/invalid input"); return
    mode = a.mode

    def do_single():
        print("=== single-byte XOR ===")
        flags = all_single_byte_flags(ct)
        if flags:
            print("FLAG HITS (any key):")
            for k, fl, pt in flags:
                print("  key=0x%02x -> %s" % (k, fl))
            print("")
        print("top 5 by English score:")
        for sc, k, pt in single_byte(ct)[:5]:
            fl = show_flag(pt)
            tag = ("  <-- FLAG %s" % fl) if fl else ""
            print("key=0x%02x (%r) score=%.1f : %r%s" % (k, chr(k), sc, pt[:80], tag))

    def do_known():
        if not a.crib:
            return
        print("\n=== known-plaintext (crib=%r) ===" % a.crib)
        for off, key, pt in known_plaintext(ct, a.crib):
            fl = show_flag(pt)
            tag = ("  <-- FLAG %s" % fl) if fl else ""
            print("offset=%d key=%r : %r%s" % (off, key, pt[:80], tag))

    def do_repeating():
        print("\n=== repeating-key XOR ===")
        # candidates: Hamming guesses + all small sizes (short keys are common and
        # Hamming is noisy for them), de-duplicated, capped.
        cands = list(dict.fromkeys(guess_keysizes(ct) + list(range(2, 13))))
        flag_lines, other_lines = [], []
        for ks in cands:
            if ks < 1 or ks > len(ct) // 2:
                continue
            key, pt = break_repeating(ct, ks)
            fl = strict_flag(pt)
            line = "keysize=%d key=%r : %r" % (ks, key, pt[:90])
            if fl:
                flag_lines.append(line + "  <-- FLAG %s" % fl)
            else:
                other_lines.append((score(pt), line))
        if flag_lines:
            print("FLAG HITS:")
            for l in dict.fromkeys(flag_lines):
                print("  " + l)
        other_lines.sort(reverse=True)
        print("best scoring candidates:")
        for _, l in other_lines[:4]:
            print("  " + l)

    if mode == "single":
        do_single()
    elif mode == "known":
        do_known()
    elif mode == "repeating":
        do_repeating()
    else:
        do_single(); do_known(); do_repeating()


if __name__ == "__main__":
    main()
