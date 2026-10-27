#!/usr/bin/env python3
"""
Minimal interactive netcat for CTF services (no pwntools dependency).

Connects to host:port, optionally sends a sequence of lines (reading any banner /
prompt between sends), captures everything, and scans for flags.

Usage:
  netcat.py --host H --port P [--send "line1\\nline2"] [--wait 0.4] [--timeout 8]

stdlib-only. Run with python -I.
"""
import argparse, re, select, socket, sys, time

FLAG_RE = re.compile(rb"[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{2,200}\}")


def recv_available(sock, wait):
    """Drain whatever is readable within `wait` seconds."""
    chunks = []
    end = time.time() + wait
    while time.time() < end:
        r, _, _ = select.select([sock], [], [], max(0, end - time.time()))
        if not r:
            break
        try:
            data = sock.recv(4096)
        except Exception:
            break
        if not data:
            break
        chunks.append(data)
        end = time.time() + wait  # keep draining while data flows
    return b"".join(chunks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", required=True, type=int)
    ap.add_argument("--send", default="")
    ap.add_argument("--wait", type=float, default=0.4)
    ap.add_argument("--timeout", type=float, default=8.0)
    a = ap.parse_args()

    transcript = bytearray()
    try:
        s = socket.create_connection((a.host, a.port), timeout=a.timeout)
    except Exception as e:
        print("[connect error] %s" % e)
        return
    s.settimeout(a.timeout)

    banner = recv_available(s, a.wait)
    if banner:
        transcript += banner
        sys.stdout.write(banner.decode("latin1"))

    lines = a.send.split("\\n") if a.send else []
    for line in lines:
        try:
            s.sendall(line.encode() + b"\n")
        except Exception as e:
            print("\n[send error] %s" % e)
            break
        resp = recv_available(s, a.wait)
        if resp:
            transcript += resp
            sys.stdout.write(resp.decode("latin1"))

    # final drain
    tail = recv_available(s, a.wait)
    if tail:
        transcript += tail
        sys.stdout.write(tail.decode("latin1"))
    try:
        s.close()
    except Exception:
        pass

    flags = sorted(set(m.group(0).decode("latin1") for m in FLAG_RE.finditer(bytes(transcript))))
    if flags:
        print("\n\n[FLAGS]")
        for f in flags:
            print("  " + f)


if __name__ == "__main__":
    main()
