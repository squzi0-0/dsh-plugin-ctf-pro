#!/usr/bin/env python3
"""
JWT decode / audit / crack / forge for CTF.

  --token <jwt>                 decode + audit
  --wordlist <path>             crack HS256 secret
  --secret <s> --forge <json>   forge a token signed with <s> (HS256)
  --token <jwt> --forge <json>  with alg=none, emit an unsigned forged token

stdlib-only (hmac/hashlib/base64). Run with python -I.
"""
import argparse, base64, hashlib, hmac, json, os, sys


def b64url_decode(s):
    s += "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def b64url_encode(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def decode(token):
    parts = token.split(".")
    if len(parts) < 2:
        return None
    header = json.loads(b64url_decode(parts[0]))
    try:
        payload = json.loads(b64url_decode(parts[1]))
    except Exception:
        payload = {"<raw>": b64url_decode(parts[1]).decode("latin1")}
    sig = parts[2] if len(parts) > 2 else ""
    return header, payload, sig, parts


def audit(header, payload):
    notes = []
    alg = str(header.get("alg", "")).lower()
    if alg in ("none", ""):
        notes.append("⚠ alg=none — server may accept an unsigned token. Forge freely.")
    if alg.startswith("hs"):
        notes.append("alg=HS* (symmetric). If the secret is weak, crack it. If the server also serves an RS public key, try HS/RS confusion: sign HS256 with the RSA public key as the secret.")
    if alg.startswith("rs") or alg.startswith("es"):
        notes.append("alg=RS/ES (asymmetric). Try alg=none, or key-confusion if you can obtain the public key (jwks, /.well-known/jwks.json).")
    if "kid" in header:
        notes.append("'kid' header present — test path traversal / SQLi in kid (e.g. kid pointing to a known file like /dev/null -> empty key).")
    for claim in ("admin", "role", "user", "isAdmin"):
        if claim in payload:
            notes.append("payload has '%s'=%r — likely the privilege field to tamper." % (claim, payload[claim]))
    return notes


def crack_hs256(parts, wordlist):
    signing_input = (parts[0] + "." + parts[1]).encode()
    want = parts[2]
    alg = json.loads(b64url_decode(parts[0])).get("alg", "HS256").upper()
    hfn = {"HS256": hashlib.sha256, "HS384": hashlib.sha384, "HS512": hashlib.sha512}.get(alg, hashlib.sha256)
    if not os.path.exists(wordlist):
        return None, "wordlist not found: %s" % wordlist
    tried = 0
    with open(wordlist, "rb") as f:
        for line in f:
            secret = line.strip()
            if not secret:
                continue
            tried += 1
            sig = b64url_encode(hmac.new(secret, signing_input, hfn).digest())
            if hmac.compare_digest(sig, want):
                return secret.decode("latin1"), "cracked after %d words" % tried
    return None, "not found (%d words tried)" % tried


def sign_hs256(header, payload, secret):
    h = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = (h + "." + p).encode()
    sig = b64url_encode(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return "%s.%s.%s" % (h, p, sig)


def forge_none(payload):
    header = {"alg": "none", "typ": "JWT"}
    h = b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    p = b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    return "%s.%s." % (h, p)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token")
    ap.add_argument("--wordlist")
    ap.add_argument("--secret")
    ap.add_argument("--forge")
    a = ap.parse_args()

    base_payload = {}
    if a.token:
        dec = decode(a.token)
        if not dec:
            print("[!] not a JWT"); return
        header, payload, sig, parts = dec
        base_payload = dict(payload) if isinstance(payload, dict) else {}
        print("=== header ===");  print(json.dumps(header, indent=2))
        print("=== payload ==="); print(json.dumps(payload, indent=2))
        print("=== audit ===")
        for n in audit(header, payload):
            print(" - " + n)
        if a.wordlist and str(header.get("alg", "")).upper().startswith("HS"):
            print("=== crack ===")
            secret, msg = crack_hs256(parts, a.wordlist)
            print(" %s (%s)" % (("SECRET = %s" % secret) if secret else "not cracked", msg))
            if secret and a.forge:
                p = json.loads(a.forge)
                merged = {**base_payload, **p}
                print("\n[forged, signed with cracked secret]\n" + sign_hs256({"alg": "HS256", "typ": "JWT"}, merged, secret))

    if a.forge and a.secret:
        p = json.loads(a.forge)
        merged = {**base_payload, **p}
        print("\n[forged HS256 with given secret]\n" + sign_hs256({"alg": "HS256", "typ": "JWT"}, merged, a.secret))
    elif a.forge and not a.secret and a.token:
        p = json.loads(a.forge)
        merged = {**base_payload, **p}
        print("\n[forged alg=none]\n" + forge_none(merged))


if __name__ == "__main__":
    main()
