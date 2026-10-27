#!/usr/bin/env python3
"""
Standalone recursive multi-codec decoder (CLI mirror of ctf_auto_decode).
Usage: decode_all.py "<string>"   or   echo "<string>" | decode_all.py
Run with python -I.
"""
import base64, binascii, codecs, re, sys, zlib, gzip, io

FLAG_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}")


def printable(b, thr=0.85):
    if not b:
        return False
    ok = sum(1 for c in b if 32 <= c <= 126 or c in (9, 10, 13))
    return ok / len(b) >= thr


def try_b64(s):
    s2 = re.sub(r"\s", "", s)
    try:
        if re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", s2) and len(s2) % 4 == 0:
            b = base64.b64decode(s2)
            if printable(b):
                return b.decode("latin1")
        if re.fullmatch(r"[A-Za-z0-9_-]+={0,2}", s2):
            b = base64.urlsafe_b64decode(s2 + "=" * (-len(s2) % 4))
            if printable(b):
                return b.decode("latin1")
    except Exception:
        pass
    return None


def try_hex(s):
    c = re.sub(r"(0x|[\s:,])", "", s)
    try:
        if re.fullmatch(r"[0-9a-fA-F]+", c) and len(c) % 2 == 0:
            b = bytes.fromhex(c)
            if printable(b):
                return b.decode("latin1")
    except Exception:
        pass
    return None


def try_b32(s):
    try:
        b = base64.b32decode(re.sub(r"\s", "", s).upper())
        if printable(b):
            return b.decode("latin1")
    except Exception:
        pass
    return None


def try_b85(s):
    for fn in (base64.a85decode, base64.b85decode):
        try:
            b = fn(s.strip())
            if printable(b):
                return b.decode("latin1")
        except Exception:
            pass
    return None


def try_bin(s):
    bits = re.sub(r"[^01]", "", s)
    if len(bits) >= 8 and len(bits) % 8 == 0:
        b = bytes(int(bits[i:i+8], 2) for i in range(0, len(bits), 8))
        if printable(b):
            return b.decode("latin1")
    return None


def try_url(s):
    from urllib.parse import unquote
    if "%" in s:
        u = unquote(s)
        if u != s:
            return u
    return None


def try_rot13(s):
    r = codecs.encode(s, "rot_13")
    return r if r != s else None


def try_gzip(s):
    try:
        raw = base64.b64decode(re.sub(r"\s", "", s) + "==")
        for fn in (gzip.decompress, zlib.decompress, lambda d: zlib.decompress(d, -15)):
            try:
                out = fn(raw)
                if printable(out, 0.7):
                    return out.decode("latin1")
            except Exception:
                pass
    except Exception:
        pass
    return None


CODECS = [("base64", try_b64), ("hex", try_hex), ("base32", try_b32),
          ("base85", try_b85), ("binary", try_bin), ("url", try_url),
          ("rot13", try_rot13), ("gzip", try_gzip)]


def walk(s, depth, chain, seen, flags, out):
    if depth > 5 or len(s) > 100000:
        return
    for m in FLAG_RE.findall(s):
        flags.add(m)
    for name, fn in CODECS:
        try:
            r = fn(s)
        except Exception:
            r = None
        if not r or r == s:
            continue
        key = name + r[:120]
        if key in seen:
            continue
        seen.add(key)
        path = chain + [name]
        out.append((depth, " -> ".join(path), r[:300]))
        walk(r, depth + 1, path, seen, flags, out)


def main():
    data = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read().strip()
    flags, out = set(), []
    walk(data, 1, [], set(), flags, out)
    if flags:
        print("FLAGS:")
        for f in flags:
            print("  " + f)
    for depth, path, val in out:
        print("[%d] %-30s %s" % (depth, path, val))
    if not out and not flags:
        print("no standard encoding matched.")


if __name__ == "__main__":
    main()
