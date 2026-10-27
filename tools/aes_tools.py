#!/usr/bin/env python3
"""
AES / block-cipher helper for CTF.

  detect  --data HEX                      -> spot ECB (repeated 16-byte blocks)
  enc     --key K --mode ecb|cbc|ctr [--iv IV] --data HEX   (needs pycryptodome)
  dec     --key K --mode ecb|cbc|ctr [--iv IV] --data HEX
  flip    --data HEX --block i --pos j --old HH --new HH   -> CBC bit-flip edit

Key/IV accept hex (0x..) or raw ascii. Data is hex (or base64 with --b64).
Run with python -I.
"""
import argparse, base64, sys


def parse_bytes(s, allow_ascii=True):
    s = s.strip()
    if s.lower().startswith("0x"):
        return bytes.fromhex(s[2:])
    try:
        return bytes.fromhex(s)
    except ValueError:
        if allow_ascii:
            return s.encode()
        raise


def load_data(s, b64):
    return base64.b64decode(s) if b64 else bytes.fromhex(s.replace(" ", ""))


def detect_ecb(data, bs=16):
    blocks = [data[i:i + bs] for i in range(0, len(data), bs)]
    seen, dups = set(), []
    for idx, b in enumerate(blocks):
        if b in seen:
            dups.append(idx)
        seen.add(b)
    print("blocks: %d, unique: %d, size: %d" % (len(blocks), len(set(blocks)), bs))
    if dups:
        print("ECB LIKELY: repeated block(s) at index %s" % dups)
    else:
        print("no repeated 16-byte blocks (not obviously ECB; could be CBC/CTR/stream)")


def cbc_flip(data, block, pos, old, new):
    data = bytearray(data)
    bs = 16
    # to change plaintext of block `block` at `pos`, edit ciphertext of block-1
    tgt = (block - 1) * bs + pos
    if block == 0:
        print("[note] flipping block 0 requires editing the IV, not the ciphertext.")
    if tgt < 0 or tgt >= len(data):
        print("[!] target offset out of range"); return
    o = old[0] if old else 0
    n = new[0] if new else 0
    data[tgt] ^= (o ^ n)
    print("modified ciphertext (hex):")
    print(bytes(data).hex())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("op", choices=["detect", "enc", "dec", "flip"])
    ap.add_argument("--data", required=True)
    ap.add_argument("--b64", action="store_true")
    ap.add_argument("--key"); ap.add_argument("--iv")
    ap.add_argument("--mode", default="cbc")
    ap.add_argument("--block", type=int); ap.add_argument("--pos", type=int)
    ap.add_argument("--old"); ap.add_argument("--new")
    a = ap.parse_args()

    data = load_data(a.data, a.b64)

    if a.op == "detect":
        detect_ecb(data); return
    if a.op == "flip":
        old = parse_bytes(a.old, False) if a.old else b"\x00"
        new = parse_bytes(a.new, False) if a.new else b"\x00"
        cbc_flip(data, a.block, a.pos, old, new); return

    # enc/dec need pycryptodome
    try:
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import pad, unpad
    except Exception:
        print("pycryptodome not installed (pip install pycryptodome)"); return
    key = parse_bytes(a.key)
    iv = parse_bytes(a.iv) if a.iv else b"\x00" * 16
    mode = a.mode.lower()
    if mode == "ecb":
        cipher = AES.new(key, AES.MODE_ECB)
    elif mode == "cbc":
        cipher = AES.new(key, AES.MODE_CBC, iv)
    elif mode == "ctr":
        from Crypto.Util import Counter
        cipher = AES.new(key, AES.MODE_CTR, counter=Counter.new(128, initial_value=int.from_bytes(iv, "big")))
    else:
        print("unknown mode"); return

    if a.op == "enc":
        pt = data if mode == "ctr" else pad(data, 16)
        out = cipher.encrypt(pt)
        print("ciphertext hex: " + out.hex())
    else:
        out = cipher.decrypt(data)
        if mode != "ctr":
            try:
                out = unpad(out, 16)
            except Exception:
                pass
        print("plaintext: %r" % out)
        import re
        m = re.search(rb"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}", out)
        if m:
            print("[FLAG] " + m.group(0).decode("latin1"))


if __name__ == "__main__":
    main()
