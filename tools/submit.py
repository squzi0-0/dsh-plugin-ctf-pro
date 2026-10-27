#!/usr/bin/env python3
"""
Submit a flag to a CTF checker.

HTTP (CTFd-style or generic form/JSON):
  submit.py --url https://ctf/api/v1/challenges/attempt --flag 'X{..}' \
            --field submission --json '{"challenge_id":5}' \
            --header 'Cookie: session=...' --header 'CSRF-Token: ...'

Netcat checker:
  submit.py --nc host:port --flag 'X{..}'

Prints the server response and a verdict guess (accepted / rejected / unknown).
stdlib-only. Run with python -I.
"""
import argparse, json, re, socket, sys, time, select
import urllib.request, urllib.parse, urllib.error

ACCEPT = re.compile(r"\b(correct|accepted|solved|congrat|right|success|valid|well done)\b", re.I)
REJECT = re.compile(r"\b(incorrect|wrong|invalid|nope|already solved|try again|denied|fail)\b", re.I)


def verdict(text):
    if ACCEPT.search(text) and not REJECT.search(text):
        return "ACCEPTED ✅"
    if REJECT.search(text):
        return "rejected ❌"
    return "unknown (read response)"


def http_submit(url, flag, field, extra_json, headers, form):
    data_obj = {}
    if extra_json:
        data_obj.update(json.loads(extra_json))
    data_obj[field] = flag
    hdrs = {}
    for h in headers or []:
        if ":" in h:
            k, v = h.split(":", 1)
            hdrs[k.strip()] = v.strip()
    if form:
        body = urllib.parse.urlencode(data_obj).encode()
        hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded")
    else:
        body = json.dumps(data_obj).encode()
        hdrs.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            resp = r.read().decode("latin1", "replace")
            code = r.status
    except urllib.error.HTTPError as e:
        resp = e.read().decode("latin1", "replace")
        code = e.code
    except Exception as e:
        return "[http error] %s" % e, "unknown"
    return "HTTP %s\n%s" % (code, resp[:1500]), verdict(resp)


def nc_submit(hostport, flag):
    host, port = hostport.rsplit(":", 1)
    try:
        s = socket.create_connection((host, int(port)), timeout=8)
    except Exception as e:
        return "[connect error] %s" % e, "unknown"
    s.settimeout(8)
    transcript = ""

    def drain(wait=0.5):
        nonlocal transcript
        end = time.time() + wait
        while time.time() < end:
            r, _, _ = select.select([s], [], [], max(0, end - time.time()))
            if not r:
                break
            try:
                d = s.recv(4096)
            except Exception:
                break
            if not d:
                break
            transcript += d.decode("latin1", "replace")
            end = time.time() + wait
    drain()
    try:
        s.sendall(flag.encode() + b"\n")
    except Exception as e:
        return transcript + "\n[send error] %s" % e, "unknown"
    drain(1.0)
    try:
        s.close()
    except Exception:
        pass
    return transcript[-1500:], verdict(transcript)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url")
    ap.add_argument("--nc")
    ap.add_argument("--flag", required=True)
    ap.add_argument("--field", default="submission")
    ap.add_argument("--json", default="")
    ap.add_argument("--header", action="append", default=[])
    ap.add_argument("--form", action="store_true")
    a = ap.parse_args()

    if a.nc:
        resp, v = nc_submit(a.nc, a.flag)
    elif a.url:
        resp, v = http_submit(a.url, a.flag, a.field, a.json, a.header, a.form)
    else:
        print("[!] provide --url or --nc"); sys.exit(1)
    print(resp)
    print("\n[verdict] %s" % v)


if __name__ == "__main__":
    main()
