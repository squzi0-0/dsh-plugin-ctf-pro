#!/usr/bin/env python3
"""
RSA attack suite for CTF.

Usage:
  rsa_attacks.py --n N --e E --c C [--p P] [--q Q]
  rsa_attacks.py --extra '{"sets":[{"n":..,"e":..,"c":..}, ...]}'

Tries, in order of cost: use of supplied p/q/d, factordb, trivial/small factors,
Fermat (close primes), small-e e-th root (Hastad single), Wiener (small d),
common-modulus (two sets, same n different e), Hastad broadcast (e sets, same e),
shared-prime GCD (two moduli sharing a factor). Prints the recovered plaintext
and any flag found.

stdlib-only; uses gmpy2 if available for speed. Run with python -I.
"""
import argparse, json, math, sys, re
from math import gcd, isqrt

try:
    import gmpy2  # type: ignore
    HAVE_GMPY = True
except Exception:
    HAVE_GMPY = False


def to_int(x):
    if x is None:
        return None
    if isinstance(x, int):
        return x
    s = str(x).strip().replace("_", "").replace(" ", "")
    if s.lower().startswith("0x"):
        return int(s, 16)
    # allow pure hex if it has hex letters
    if re.fullmatch(r"[0-9a-fA-F]+", s) and re.search(r"[a-fA-F]", s) and not s.isdigit():
        try:
            return int(s, 16)
        except ValueError:
            pass
    return int(s)


def iroot(x, n):
    """Return (root, exact) for the integer n-th root of x."""
    if x < 0:
        return 0, False
    if HAVE_GMPY:
        r, exact = gmpy2.iroot(gmpy2.mpz(x), n)
        return int(r), bool(exact)
    if n == 2:
        r = isqrt(x)
        return r, r * r == x
    lo, hi = 0, 1 << ((x.bit_length() // n) + 2)
    while lo < hi:
        mid = (lo + hi) // 2
        if mid ** n < x:
            lo = mid + 1
        else:
            hi = mid
    # adjust
    for r in (lo - 1, lo, lo + 1):
        if r >= 0 and r ** n == x:
            return r, True
    return lo, False


def long_to_bytes(n):
    if n <= 0:
        return b""
    length = (n.bit_length() + 7) // 8
    return n.to_bytes(length, "big")


def inverse(a, m):
    return pow(a, -1, m)


def find_flag(b):
    try:
        s = b.decode("latin1")
    except Exception:
        return None
    m = re.search(r"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}", s)
    return m.group(0) if m else None


# ----------------------------- factoring ----------------------------- #

def fermat(n, rounds=200000):
    a = isqrt(n)
    if a * a < n:
        a += 1
    for _ in range(rounds):
        b2 = a * a - n
        b = isqrt(b2)
        if b * b == b2:
            return a - b, a + b
        a += 1
    return None


def trial_small(n, limit=1 << 20):
    if n % 2 == 0:
        return 2, n // 2
    i = 3
    while i < limit:
        if n % i == 0:
            return i, n // i
        i += 2
    return None


def pollard_rho(n, rounds=1 << 20):
    if n % 2 == 0:
        return 2
    import random
    x = random.randrange(2, n)
    y = x
    c = random.randrange(1, n)
    d = 1
    i = 0
    while d == 1 and i < rounds:
        x = (x * x + c) % n
        y = (y * y + c) % n
        y = (y * y + c) % n
        d = gcd(abs(x - y), n)
        i += 1
    return d if 1 < d < n else None


def factordb(n):
    try:
        import urllib.request
        url = "http://factordb.com/api?query=%d" % n
        with urllib.request.urlopen(url, timeout=12) as r:
            data = json.loads(r.read().decode())
        if data.get("status") in ("FF", "CF", "P", "Prime", "C") or data.get("factors"):
            facs = []
            for f, mult in data.get("factors", []):
                facs.extend([int(f)] * int(mult))
            facs = [f for f in facs if f != 1]
            if len(facs) >= 2:
                return facs
    except Exception as e:
        return None
    return None


# ----------------------------- attacks ----------------------------- #

def decrypt_with_factors(n, e, c, p, q):
    phi = (p - 1) * (q - 1)
    d = inverse(e, phi)
    m = pow(c, d, n)
    return m


def wiener(n, e):
    """Wiener's attack via continued fractions of e/n. Returns d or None."""
    def contfrac(a, b):
        while b:
            yield a // b
            a, b = b, a % b

    def convergents(cf):
        n0, n1 = 0, 1
        d0, d1 = 1, 0
        for a in cf:
            n0, n1 = n1, a * n1 + n0
            d0, d1 = d1, a * d1 + d0
            yield n0, d0

    for k, d in convergents(contfrac(e, n)):
        if k == 0:
            continue
        if (e * d - 1) % k != 0:
            continue
        phi = (e * d - 1) // k
        # solve x^2 - (n-phi+1)x + n = 0
        b = n - phi + 1
        disc = b * b - 4 * n
        if disc < 0:
            continue
        s = isqrt(disc)
        if s * s == disc and (b + s) % 2 == 0:
            return d
    return None


def common_modulus(n, e1, c1, e2, c2):
    g, a, b = ext_gcd(e1, e2)
    if g != 1:
        return None
    m1 = pow(c1, a, n) if a >= 0 else pow(inverse(c1, n), -a, n)
    m2 = pow(c2, b, n) if b >= 0 else pow(inverse(c2, n), -b, n)
    return (m1 * m2) % n


def ext_gcd(a, b):
    if b == 0:
        return a, 1, 0
    g, x, y = ext_gcd(b, a % b)
    return g, y, x - (a // b) * y


def crt(rems, mods):
    M = 1
    for m in mods:
        M *= m
    x = 0
    for r, m in zip(rems, mods):
        Mi = M // m
        x += r * Mi * inverse(Mi, m)
    return x % M, M


def hastad_broadcast(sets):
    """Same e across sets, e <= len(sets), no padding."""
    e = sets[0]["e"]
    if len(sets) < e:
        return None
    sel = sets[:e]
    rems = [s["c"] for s in sel]
    mods = [s["n"] for s in sel]
    x, M = crt(rems, mods)
    m, exact = iroot(x, e)
    return m if exact else None


# ----------------------------- driver ----------------------------- #

def solve_single(n, e, c, p=None, q=None, log=None):
    log = log if log is not None else []
    if p and q:
        log.append("[*] using supplied p, q")
        return decrypt_with_factors(n, e, c, p, q), log
    if p and not q and n % p == 0:
        q = n // p
        log.append("[*] derived q from p")
        return decrypt_with_factors(n, e, c, p, q), log

    # small e e-th root (unpadded)
    if e <= 10:
        m, exact = iroot(c, e)
        if exact:
            log.append("[+] small-e %d-th root succeeded (Hastad single / no padding)" % e)
            return m, log
        log.append("[-] small-e root not exact")

    # factordb
    log.append("[*] querying factordb...")
    f = factordb(n)
    if f and len(f) == 2:
        log.append("[+] factordb: n = p*q")
        return decrypt_with_factors(n, e, c, f[0], f[1]), log
    if f and len(f) > 2:
        log.append("[+] factordb multi-prime: %d factors" % len(f))
        phi = 1
        for pr in f:
            phi *= (pr - 1)
        d = inverse(e, phi)
        return pow(c, d, n), log

    # trivial / small factor
    t = trial_small(n)
    if t:
        log.append("[+] small factor found")
        return decrypt_with_factors(n, e, c, t[0], t[1]), log

    # fermat (close primes)
    log.append("[*] Fermat factorisation (close primes)...")
    fm = fermat(n)
    if fm:
        log.append("[+] Fermat succeeded (p, q close)")
        return decrypt_with_factors(n, e, c, fm[0], fm[1]), log

    # Wiener (small d / large e)
    if e > 1:
        log.append("[*] Wiener's attack (small d)...")
        d = wiener(n, e)
        if d:
            log.append("[+] Wiener succeeded")
            return pow(c, d, n), log

    # pollard rho last resort
    log.append("[*] Pollard rho...")
    pr = pollard_rho(n)
    if pr and 1 < pr < n:
        log.append("[+] Pollard rho found a factor")
        return decrypt_with_factors(n, e, c, pr, n // pr), log

    log.append("[-] single-key attacks exhausted. Consider: LSB oracle, partial key, lattice (Coppersmith), or multi-prime.")
    return None, log


def report(m, log):
    for line in log:
        print(line)
    if m is None:
        print("\n[!] No plaintext recovered.")
        return
    b = long_to_bytes(m)
    print("\n[decimal] %d" % m)
    print("[hex]     %s" % hex(m))
    try:
        print("[ascii]   %r" % b.decode("latin1"))
    except Exception:
        print("[bytes]   %r" % b)
    fl = find_flag(b)
    if fl:
        print("\n[FLAG] %s" % fl)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n"); ap.add_argument("--e"); ap.add_argument("--c")
    ap.add_argument("--p"); ap.add_argument("--q"); ap.add_argument("--extra")
    a = ap.parse_args()

    if a.extra:
        try:
            extra = json.loads(a.extra)
        except Exception as ex:
            print("[!] bad --extra JSON: %s" % ex); sys.exit(1)
        sets = extra.get("sets", [])
        sets = [{"n": to_int(s.get("n")), "e": to_int(s.get("e")) or 65537, "c": to_int(s.get("c"))} for s in sets]
        if len(sets) >= 2:
            ns = [s["n"] for s in sets]
            # shared prime
            for i in range(len(ns)):
                for j in range(i + 1, len(ns)):
                    g = gcd(ns[i], ns[j])
                    if 1 < g < ns[i]:
                        print("[+] shared prime between set %d and %d" % (i, j))
                        s = sets[i]
                        m = decrypt_with_factors(s["n"], s["e"], s["c"], g, s["n"] // g)
                        report(m, []); return
            # common modulus
            if sets[0]["n"] == sets[1]["n"] and sets[0]["e"] != sets[1]["e"]:
                print("[*] common-modulus attack")
                m = common_modulus(sets[0]["n"], sets[0]["e"], sets[0]["c"], sets[1]["e"], sets[1]["c"])
                report(m, []); return
            # hastad broadcast
            if len(set(s["e"] for s in sets)) == 1:
                print("[*] Hastad broadcast attack (e=%d, %d ciphertexts)" % (sets[0]["e"], len(sets)))
                m = hastad_broadcast(sets)
                if m is not None:
                    report(m, []); return
            print("[-] multi-set attacks did not apply; falling back to per-set single attacks")
            for idx, s in enumerate(sets):
                print("\n=== set %d ===" % idx)
                m, log = solve_single(s["n"], s["e"], s["c"])
                report(m, log)
            return

    n = to_int(a.n); e = to_int(a.e) or 65537; c = to_int(a.c)
    p = to_int(a.p); q = to_int(a.q)
    if n is None or c is None:
        print("[!] need at least --n and --c (and usually --e)"); sys.exit(1)
    m, log = solve_single(n, e, c, p, q)
    report(m, log)


if __name__ == "__main__":
    main()
