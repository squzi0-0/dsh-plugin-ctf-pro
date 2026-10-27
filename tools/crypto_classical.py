#!/usr/bin/env python3
"""
Classical cipher toolkit for CTF.

  caesar    - brute all 26 shifts, score
  vigenere  - decrypt with --key, or auto key-length (IoC/Kasiski) + guess
  atbash    - atbash
  railfence - brute rail counts 2..10
  freq      - letter frequency analysis (for substitution)
  auto      - caesar + atbash + (vigenere if key) + freq

stdlib-only. Run with python -I.
"""
import argparse, re, string
from collections import Counter

EN_FREQ = {
    'a': 8.2, 'b': 1.5, 'c': 2.8, 'd': 4.3, 'e': 12.7, 'f': 2.2, 'g': 2.0,
    'h': 6.1, 'i': 7.0, 'j': 0.15, 'k': 0.77, 'l': 4.0, 'm': 2.4, 'n': 6.7,
    'o': 7.5, 'p': 1.9, 'q': 0.095, 'r': 6.0, 's': 6.3, 't': 9.1, 'u': 2.8,
    'v': 0.98, 'w': 2.4, 'x': 0.15, 'y': 2.0, 'z': 0.074,
}
FLAG_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}")
COMMON = re.compile(r"\b(the|and|flag|this|that|with|for|you|key|secret)\b", re.I)


def shift(text, n):
    out = []
    for ch in text:
        if ch.isalpha():
            base = 65 if ch.isupper() else 97
            out.append(chr((ord(ch) - base + n) % 26 + base))
        else:
            out.append(ch)
    return "".join(out)


def score_en(text):
    letters = [c.lower() for c in text if c.isalpha()]
    if not letters:
        return -1e9
    cnt = Counter(letters)
    n = len(letters)
    chi = 0.0
    for c, f in EN_FREQ.items():
        exp = f / 100 * n
        obs = cnt.get(c, 0)
        if exp > 0:
            chi += (obs - exp) ** 2 / exp
    bonus = len(COMMON.findall(text)) * 30
    return bonus - chi


def flag_tag(text):
    m = FLAG_RE.search(text)
    return ("  <-- %s" % m.group(0)) if m else ""


def caesar(text):
    res = [(score_en(shift(text, -n)), n, shift(text, -n)) for n in range(26)]
    res.sort(reverse=True)
    return res


def atbash(text):
    out = []
    for ch in text:
        if ch.isalpha():
            base = 65 if ch.isupper() else 97
            out.append(chr(base + 25 - (ord(ch) - base)))
        else:
            out.append(ch)
    return "".join(out)


def ioc(text):
    letters = [c.lower() for c in text if c.isalpha()]
    n = len(letters)
    if n < 2:
        return 0
    cnt = Counter(letters)
    return sum(v * (v - 1) for v in cnt.values()) / (n * (n - 1))


def vigenere_decrypt(text, key):
    key = [k for k in key.lower() if k.isalpha()]
    if not key:
        return text
    out = []
    ki = 0
    for ch in text:
        if ch.isalpha():
            base = 65 if ch.isupper() else 97
            k = ord(key[ki % len(key)]) - 97
            out.append(chr((ord(ch) - base - k) % 26 + base))
            ki += 1
        else:
            out.append(ch)
    return "".join(out)


def guess_vigenere_keylen(text, maxlen=16):
    letters = [c.lower() for c in text if c.isalpha()]
    best = []
    for kl in range(1, min(maxlen, len(letters) // 2) + 1):
        avg = sum(ioc(letters[i::kl]) for i in range(kl)) / kl
        best.append((abs(avg - 0.0667), kl))
    best.sort()
    return [kl for _, kl in best[:3]]


def guess_vigenere_key(text, kl):
    letters = [c for c in text if c.isalpha()]
    key = ""
    for i in range(kl):
        col = "".join(letters[i::kl])
        best = max(range(26), key=lambda s: score_en(shift(col, -s)))
        key += chr(best + 97)
    return key


def railfence(text, rails):
    if rails < 2:
        return text
    fence = [[] for _ in range(rails)]
    pattern = list(range(rails)) + list(range(rails - 2, 0, -1))
    idx = [pattern[i % len(pattern)] for i in range(len(text))]
    counts = Counter(idx)
    pos = 0
    rows = []
    for r in range(rails):
        rows.append(list(text[pos:pos + counts[r]]))
        pos += counts[r]
    out = []
    ptr = [0] * rails
    for r in idx:
        out.append(rows[r][ptr[r]])
        ptr[r] += 1
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--cipher", default="auto")
    ap.add_argument("--key", default="")
    a = ap.parse_args()
    t, cipher = a.text, a.cipher

    def do_caesar():
        print("=== Caesar / ROT (top 3) ===")
        for sc, n, dec in caesar(t)[:3]:
            print("ROT-%2d (shift %2d): %s%s" % (n, (26 - n) % 26, dec[:100], flag_tag(dec)))

    def do_atbash():
        d = atbash(t)
        print("\n=== Atbash ===\n%s%s" % (d[:120], flag_tag(d)))

    def do_vigenere():
        print("\n=== Vigenère ===")
        if a.key:
            d = vigenere_decrypt(t, a.key)
            print("key=%s: %s%s" % (a.key, d[:120], flag_tag(d)))
            return
        for kl in guess_vigenere_keylen(t):
            key = guess_vigenere_key(t, kl)
            d = vigenere_decrypt(t, key)
            print("keylen=%d guessed-key=%s: %s%s" % (kl, key, d[:100], flag_tag(d)))

    def do_rail():
        print("\n=== Rail-fence (2..10) ===")
        for r in range(2, 11):
            d = railfence(t, r)
            tag = flag_tag(d)
            if tag or COMMON.search(d):
                print("rails=%d: %s%s" % (r, d[:100], tag))

    def do_freq():
        letters = [c.lower() for c in t if c.isalpha()]
        cnt = Counter(letters)
        total = len(letters) or 1
        print("\n=== Frequency (for substitution) ===  IoC=%.4f (EN≈0.0667)" % ioc(t))
        for c, n in cnt.most_common(10):
            print("  %s : %5.2f%%" % (c, 100 * n / total))

    if cipher == "caesar":
        do_caesar()
    elif cipher == "atbash":
        do_atbash()
    elif cipher == "vigenere":
        do_vigenere()
    elif cipher == "railfence":
        do_rail()
    elif cipher == "freq":
        do_freq()
    else:
        do_caesar(); do_atbash()
        if a.key:
            do_vigenere()
        do_rail(); do_freq()


if __name__ == "__main__":
    main()
