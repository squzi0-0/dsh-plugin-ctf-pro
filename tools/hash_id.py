#!/usr/bin/env python3
"""Heuristic hash identifier + hashcat/john mode hints. stdlib-only."""
import re, sys

HEX = re.compile(r"^[0-9a-fA-F]+$")

# length(hex) -> list of (name, hashcat_mode, john_format)
BY_LEN = {
    32: [("MD5", "0", "raw-md5"), ("NTLM", "1000", "nt"), ("MD4", "900", "raw-md4"),
         ("LM", "3000", "lm"), ("MD2", "", "")],
    40: [("SHA1", "100", "raw-sha1"), ("MySQL4.1+ (*HEX)", "300", "mysql-sha1"),
         ("RIPEMD-160", "6000", "ripemd-160")],
    56: [("SHA224", "1300", "raw-sha224"), ("SHA3-224", "17300", "")],
    64: [("SHA256", "1400", "raw-sha256"), ("SHA3-256", "17400", ""),
         ("BLAKE2s", "", ""), ("Keccak-256", "17800", "")],
    96: [("SHA384", "10800", "raw-sha384"), ("SHA3-384", "17500", "")],
    128: [("SHA512", "1700", "raw-sha512"), ("SHA3-512", "17600", ""),
          ("Whirlpool", "6100", "whirlpool"), ("BLAKE2b", "", "")],
}


def identify(h):
    h = h.strip()
    out = []
    # prefixed schemes
    prefixes = [
        (r"^\$2[aby]\$", "bcrypt", "3200", "bcrypt"),
        (r"^\$1\$", "md5crypt", "500", "md5crypt"),
        (r"^\$5\$", "sha256crypt", "7400", "sha256crypt"),
        (r"^\$6\$", "sha512crypt", "1800", "sha512crypt"),
        (r"^\$y\$", "yescrypt", "", ""),
        (r"^\$argon2", "Argon2", "", "argon2"),
        (r"^\$pbkdf2", "PBKDF2", "", ""),
        (r"^\$P\$|\$H\$", "phpass", "400", "phpass"),
        (r"^\$krb5", "Kerberos", "", ""),
        (r"^{SSHA}", "SSHA (LDAP)", "111", "ssha"),
        (r"^[0-9a-f]{32}:[0-9a-zA-Z]+$", "md5($pass.$salt) / salted MD5", "10", ""),
        (r"^gr" + r"ub\.pbkdf2", "GRUB2 PBKDF2", "", ""),
        (r"^sha1\$", "Django SHA1", "124", ""),
        (r"^pbkdf2_sha256\$", "Django PBKDF2-SHA256", "10000", "django"),
        (r"^\$sha1\$", "atlassian/sha1", "", ""),
        (r"^0x0100", "MSSQL(2005)", "132", "mssql05"),
    ]
    for pat, name, hc, jn in prefixes:
        if re.search(pat, h):
            out.append((name, hc, jn))

    if HEX.match(h):
        for name, hc, jn in BY_LEN.get(len(h), []):
            out.append((name, hc, jn))

    # JWT-looking
    if h.count(".") == 2 and re.match(r"^eyJ", h):
        out.append(("JWT (use ctf_jwt)", "", ""))

    return out


def main():
    h = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read().strip()
    res = identify(h)
    if not res:
        print("No confident match. Length=%d, charset=%s." % (
            len(h), "hex" if HEX.match(h) else "mixed"))
        print("Try `hashid`, `hashcat --identify`, or https://hashes.com/en/tools/hash_identifier")
        return
    print("Candidates (most likely first):")
    for name, hc, jn in res:
        bits = []
        if hc:
            bits.append("hashcat -m %s" % hc)
        if jn:
            bits.append("john --format=%s" % jn)
        print("  - %-28s %s" % (name, "  ".join(bits)))


if __name__ == "__main__":
    main()
