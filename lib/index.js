"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/tools/solve.ts
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
var os = __toESM(require("os"));

// src/util/tool.ts
var import_dsh_tools = require("@deepseek-ai/dsh-tools");
function textTool(ctx, def) {
  return (0, import_dsh_tools.defineTool)({
    name: def.name,
    description: def.description,
    parameters: def.parameters ?? {},
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }]
    },
    async execute(args) {
      try {
        const r = await def.execute(args, ctx);
        return typeof r === "string" ? r : JSON.stringify(r, null, 2);
      } catch (e) {
        return `[${def.name} failed] ${e?.message || e}`;
      }
    }
  });
}

// src/util/index.ts
var import_child_process = require("child_process");
var import_util = require("util");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var execP = (0, import_util.promisify)(import_child_process.exec);
function safeExec(cmd, opts = {}) {
  const { timeoutMs = 15e3, cwd, maxBytes = 1024 * 1024 * 4, input } = opts;
  try {
    const out = (0, import_child_process.execSync)(cmd, {
      encoding: "utf-8",
      timeout: timeoutMs,
      cwd,
      input,
      maxBuffer: maxBytes,
      stdio: ["pipe", "pipe", "pipe"]
    });
    return cap(out, maxBytes);
  } catch (e) {
    const stdout = e.stdout ? String(e.stdout) : "";
    const stderr = e.stderr ? String(e.stderr) : "";
    const body = (stdout + (stderr ? `
${stderr}` : "")).trim();
    if (opts.tolerateFail && body) return cap(body, maxBytes);
    if (e.signal === "SIGTERM" || /ETIMEDOUT|timed? out/i.test(e.message || ""))
      return `[timeout after ${timeoutMs}ms]
${cap(body, maxBytes)}`;
    return `[exec error] ${e.message}
${cap(body, maxBytes)}`.trim();
  }
}
function safeSpawn(bin, args, opts = {}) {
  const { timeoutMs = 15e3, cwd, maxBytes = 1024 * 1024 * 4, input } = opts;
  const r = (0, import_child_process.spawnSync)(bin, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
    cwd,
    input,
    maxBuffer: maxBytes
  });
  if (r.error) {
    if (r.error.code === "ENOENT") return `[not found] ${bin} is not installed or not in PATH`;
    return `[spawn error] ${r.error.message}`;
  }
  const body = ((r.stdout || "") + (r.stderr ? `
${r.stderr}` : "")).trim();
  if (r.signal) return `[killed: ${r.signal}] ${cap(body, maxBytes)}`;
  return cap(body, maxBytes) || "(no output)";
}
async function safeExecAsync(cmd, opts = {}) {
  const { timeoutMs = 15e3, cwd, maxBytes = 1024 * 1024 * 4 } = opts;
  try {
    const { stdout, stderr } = await execP(cmd, { timeout: timeoutMs, cwd, maxBuffer: maxBytes, encoding: "utf-8" });
    const body = (stdout || "") + (stderr ? `
${stderr}` : "");
    return cap(body, maxBytes);
  } catch (e) {
    const body = `${e.stdout || ""}
${e.stderr || ""}`.trim();
    if (opts.tolerateFail && body) return cap(body, maxBytes);
    if (e.killed || /ETIMEDOUT/i.test(e.message || "")) return `[timeout ${timeoutMs}ms] ${cap(body, maxBytes)}`;
    return `[exec error] ${e.message}
${cap(body, maxBytes)}`.trim();
  }
}
var _memo = /* @__PURE__ */ new Map();
function memo(key, produce) {
  if (_memo.has(key)) return _memo.get(key);
  const v = produce();
  _memo.set(key, v);
  return v;
}
function fileSig(p) {
  try {
    const st = fs.statSync(p);
    return `${p}:${st.size}:${Math.round(st.mtimeMs)}`;
  } catch {
    return `${p}:missing`;
  }
}
function cachedExec(cmd, cacheKey, opts = {}) {
  return memo(`exec::${cacheKey}::${cmd}`, () => safeExec(cmd, opts));
}
async function parallel(cmds) {
  const settled = await Promise.all(cmds.map((c) => safeExecAsync(c.cmd, c.opts).then((out) => ({ label: c.label, out }))));
  return settled;
}
function cap(s, maxBytes = 8e3) {
  if (!s) return "";
  if (s.length <= maxBytes) return s;
  return s.slice(0, maxBytes) + `
... [truncated ${s.length - maxBytes} chars]`;
}
var _toolCache = /* @__PURE__ */ new Map();
function hasTool(bin) {
  if (_toolCache.has(bin)) return _toolCache.get(bin);
  const r = (0, import_child_process.spawnSync)("command", ["-v", bin], { shell: "/bin/bash", encoding: "utf-8" });
  const ok = r.status === 0 && !!(r.stdout || "").trim();
  _toolCache.set(bin, ok);
  return ok;
}
function missingTools(bins) {
  return bins.filter((b) => !hasTool(b));
}
function section(title, body) {
  return `### ${title}
${body.trim() || "(empty)"}`;
}
function pluginFile(...rel) {
  const candidates = [
    path.resolve(__dirname, "..", ...rel),
    // lib/ -> package root
    path.resolve(__dirname, "..", "..", ...rel),
    // src/util -> package root
    path.resolve(process.cwd(), ...rel)
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
function pythonBin() {
  for (const p of ["python3", "python"]) if (hasTool(p)) return p;
  return "python3";
}
function runPyHelper(relScript, args, opts = {}) {
  const script = pluginFile("tools", relScript);
  if (!script) return `[missing helper] tools/${relScript} not found in plugin package`;
  return safeSpawn(pythonBin(), ["-I", script, ...args], { timeoutMs: 3e4, ...opts });
}
var DEFAULT_FLAG_PREFIXES = [
  "flag",
  "ctf",
  "CTF",
  "FLAG",
  "CSSCTF",
  "KUBSTU",
  "picoCTF",
  "HTB",
  "HackTM",
  "DUCTF",
  "uiuctf",
  "corctf"
];
function extractFlags(text, extraPrefixes = []) {
  const found = /* @__PURE__ */ new Set();
  const prefixes = [...DEFAULT_FLAG_PREFIXES, ...extraPrefixes];
  for (const pre of prefixes) {
    const re = new RegExp(`${escapeRe(pre)}\\{[^}\\n]{1,200}\\}`, "gi");
    for (const m of text.matchAll(re)) found.add(m[0]);
  }
  for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9_]{1,24}\{[^}\n]{4,200}\}/g)) found.add(m[0]);
  return Array.from(found);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function printableRatio(buf) {
  if (buf.length === 0) return 0;
  let printable = 0;
  for (const b of buf) {
    if (b >= 32 && b <= 126 || b === 9 || b === 10 || b === 13) printable++;
  }
  return printable / buf.length;
}
function looksText(buf, min = 0.85) {
  return printableRatio(buf) >= min;
}
function shannonEntropy(buf) {
  if (buf.length === 0) return 0;
  const freq = new Array(256).fill(0);
  for (const b of buf) freq[b]++;
  let h = 0;
  for (const f of freq) {
    if (f === 0) continue;
    const p = f / buf.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// src/util/decode.ts
var zlib = __toESM(require("zlib"));
var B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function fromBase58(s) {
  const str = s.trim();
  if (!str || /[^1-9A-HJ-NP-Za-km-z]/.test(str)) return null;
  let num = 0n;
  for (const ch of str) {
    const i = B58_ALPHABET.indexOf(ch);
    if (i < 0) return null;
    num = num * 58n + BigInt(i);
  }
  const bytes = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  for (const ch of str) {
    if (ch === "1") bytes.unshift(0);
    else break;
  }
  const buf = Buffer.from(bytes);
  return looksText(buf, 0.8) ? buf.toString("latin1") : null;
}
function fromBase32(s) {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of clean) bits += alpha.indexOf(ch).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.from(bytes);
  return looksText(buf, 0.8) ? buf.toString("utf-8") : null;
}
function fromBase85(s) {
  let str = s.trim().replace(/^<~/, "").replace(/~>$/, "");
  if (!str || /[^\x21-\x75z\s]/.test(str)) return null;
  str = str.replace(/\s/g, "");
  const out = [];
  let i = 0;
  while (i < str.length) {
    if (str[i] === "z") {
      out.push(0, 0, 0, 0);
      i++;
      continue;
    }
    const chunk = str.slice(i, i + 5);
    i += 5;
    let n = 0;
    const len = chunk.length;
    for (let j = 0; j < 5; j++) {
      const c = j < len ? chunk.charCodeAt(j) - 33 : 84;
      if (c < 0 || c > 84) return null;
      n = n * 85 + c;
    }
    const b = [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
    for (let k = 0; k < len - 1; k++) out.push(b[k]);
  }
  const buf = Buffer.from(out);
  return looksText(buf, 0.8) ? buf.toString("utf-8") : null;
}
function fromBase64(s) {
  const clean = s.trim().replace(/\s/g, "");
  if (clean.length < 4 || clean.length % 4 !== 0) {
    if (/^[A-Za-z0-9_-]+$/.test(clean) && clean.length >= 4) {
      const norm = clean.replace(/-/g, "+").replace(/_/g, "/");
      const pad = norm + "=".repeat((4 - norm.length % 4) % 4);
      const buf2 = Buffer.from(pad, "base64");
      return looksText(buf2, 0.85) && buf2.length > 0 ? buf2.toString("utf-8") : null;
    }
    return null;
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(clean)) return null;
  const buf = Buffer.from(clean, "base64");
  if (buf.length === 0) return null;
  return looksText(buf, 0.85) ? buf.toString("utf-8") : null;
}
function fromHex(s) {
  const clean = s.replace(/0x/gi, "").replace(/[\s:,]/g, "");
  if (clean.length < 4 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const buf = Buffer.from(clean, "hex");
  return looksText(buf, 0.85) ? buf.toString("utf-8") : null;
}
function fromBinary(s) {
  const bits = s.replace(/[^01]/g, "");
  if (bits.length < 8 || bits.length % 8 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.from(bytes);
  return looksText(buf, 0.85) ? buf.toString("utf-8") : null;
}
function fromDecimalBytes(s) {
  const nums = s.trim().split(/[\s,]+/).filter(Boolean);
  if (nums.length < 2 || !nums.every((n) => /^\d{1,3}$/.test(n) && +n <= 255)) return null;
  const buf = Buffer.from(nums.map(Number));
  return looksText(buf, 0.85) ? buf.toString("utf-8") : null;
}
function fromOctalBytes(s) {
  const nums = s.trim().split(/[\s,]+/).filter(Boolean);
  if (nums.length < 2 || !nums.every((n) => /^[0-7]{1,3}$/.test(n))) return null;
  const vals = nums.map((n) => parseInt(n, 8));
  if (!vals.every((v) => v <= 255)) return null;
  const buf = Buffer.from(vals);
  return looksText(buf, 0.85) ? buf.toString("utf-8") : null;
}
function fromUrl(s) {
  if (!/%[0-9a-fA-F]{2}/.test(s)) return null;
  try {
    const d = decodeURIComponent(s);
    return d !== s ? d : null;
  } catch {
    return null;
  }
}
function rotN(s, n) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + n) % 26 + base);
  });
}
function atbash(s) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });
}
var MORSE = {
  ".-": "A",
  "-...": "B",
  "-.-.": "C",
  "-..": "D",
  ".": "E",
  "..-.": "F",
  "--.": "G",
  "....": "H",
  "..": "I",
  ".---": "J",
  "-.-": "K",
  ".-..": "L",
  "--": "M",
  "-.": "N",
  "---": "O",
  ".--.": "P",
  "--.-": "Q",
  ".-.": "R",
  "...": "S",
  "-": "T",
  "..-": "U",
  "...-": "V",
  ".--": "W",
  "-..-": "X",
  "-.--": "Y",
  "--..": "Z",
  "-----": "0",
  ".----": "1",
  "..---": "2",
  "...--": "3",
  "....-": "4",
  ".....": "5",
  "-....": "6",
  "--...": "7",
  "---..": "8",
  "----.": "9",
  ".-.-.-": ".",
  "--..--": ",",
  "-.-.-.": ";",
  "..--..": "?",
  "-....-": "-",
  "-..-.": "/",
  "-.--.": "(",
  "-.--.-": ")"
};
function fromMorse(s) {
  if (!/^[.\-\s/|]+$/.test(s.trim()) || !s.includes(".") || !s.includes("-")) return null;
  const words = s.trim().split(/\s*[/|]\s*|\s{3,}/);
  const decoded = words.map((w) => w.trim().split(/\s+/).map((c) => MORSE[c] ?? "").join("")).join(" ").trim();
  return decoded.length >= 2 ? decoded : null;
}
function fromGzipB64(s) {
  const clean = s.trim().replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/_=-]+$/.test(clean) || clean.length < 8) return null;
  const norm = clean.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm + "=".repeat((4 - norm.length % 4) % 4);
  let raw;
  try {
    raw = Buffer.from(pad, "base64");
  } catch {
    return null;
  }
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.inflateRawSync, zlib.brotliDecompressSync]) {
    try {
      const out = fn(raw);
      if (out && out.length && looksText(out, 0.7)) return out.toString("utf-8");
    } catch {
    }
  }
  return null;
}
var CODECS = [
  ["base64", fromBase64],
  ["base32", fromBase32],
  ["base58", fromBase58],
  ["base85", fromBase85],
  ["hex", fromHex],
  ["binary", fromBinary],
  ["decimal", fromDecimalBytes],
  ["octal", fromOctalBytes],
  ["url", fromUrl],
  ["morse", fromMorse],
  ["gzip/zlib", fromGzipB64]
];
function deepDecode(input, maxDepth = 4) {
  const hits = [];
  const flags = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  function visit(s, depth, chain) {
    if (depth > maxDepth || s.length > 1e5) return;
    for (const [name2, fn] of CODECS) {
      let out;
      try {
        out = fn(s);
      } catch {
        out = null;
      }
      if (!out || out === s) continue;
      const key = name2 + "::" + out.slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      const path4 = [...chain, name2];
      hits.push({ codec: name2, value: out, depth, path: path4 });
      for (const f of extractFlags(out)) flags.add(f);
      visit(out, depth + 1, path4);
    }
    for (let n = 1; n <= 25; n++) {
      const r = rotN(s, n);
      if (r !== s) for (const f of extractFlags(r)) flags.add(f);
    }
    const ab = atbash(s);
    if (ab !== s) {
      for (const f of extractFlags(ab)) flags.add(f);
    }
  }
  for (const f of extractFlags(input)) flags.add(f);
  visit(input, 1, []);
  return { hits, flags: Array.from(flags) };
}
function rotBrute(s) {
  const out = [];
  for (let n = 1; n <= 25; n++) {
    const r = rotN(s, n);
    const fl = extractFlags(r);
    if (fl.length) out.push(`ROT${n}: ${r}   <-- ${fl.join(", ")}`);
  }
  out.push(`Atbash: ${atbash(s)}`);
  return out;
}

// src/tools/submit.ts
function submitFlag(target, flag) {
  const a = ["--flag", flag];
  if (/^https?:\/\//i.test(target)) a.push("--url", target);
  else a.push("--nc", target);
  return runPyHelper("submit.py", a, { timeoutMs: 25e3 });
}
var submitTools = (ctx) => [
  textTool(ctx, {
    name: "ctf_submit",
    category: "meta",
    description: "Submit a flag to a checker and report whether it was accepted. Supports CTFd-style HTTP (JSON or form POST, with cookies/CSRF headers and extra fields like challenge_id) and raw nc checkers (host:port). Authorised competition endpoints only.",
    parameters: {
      flag: { type: "string", required: true, description: "The flag to submit" },
      url: { type: "string", required: false, description: "HTTP submit endpoint (e.g. CTFd /api/v1/challenges/attempt)" },
      nc: { type: "string", required: false, description: "host:port of a netcat checker (alternative to url)" },
      field: { type: "string", required: false, description: 'POST field name for the flag (default "submission"; CTFd uses "submission")' },
      json: { type: "string", required: false, description: 'Extra JSON fields, e.g. {"challenge_id":5}' },
      headers: { type: "string", required: false, description: 'Headers separated by ;; e.g. "Cookie: session=..;;CSRF-Token: .."' },
      form: { type: "boolean", required: false, description: "Send as urlencoded form instead of JSON" }
    },
    execute(args) {
      if (!args.url && !args.nc) return "Provide either url= (HTTP) or nc= (host:port).";
      const a = ["--flag", String(args.flag), "--field", String(args.field || "submission")];
      if (args.url) a.push("--url", String(args.url));
      if (args.nc) a.push("--nc", String(args.nc));
      if (args.json) a.push("--json", String(args.json));
      if (args.form) a.push("--form");
      if (args.headers) {
        for (const h of String(args.headers).split(";;")) if (h.trim()) a.push("--header", h.trim());
      }
      return runPyHelper("submit.py", a, { timeoutMs: 25e3 });
    }
  })
];

// src/tools/solve.ts
var KNOWN = /\b(?:flag|ctf|pico|HTB|CSSCTF|KUBSTU|DUCTF|corctf|uiuctf|HackTM|DrgnS|BALSN|zer0pts)\{[^}\n]{1,200}\}/gi;
function scanFlags(text, prefix) {
  const strong = /* @__PURE__ */ new Set();
  const weak = /* @__PURE__ */ new Set();
  for (const m of text.matchAll(KNOWN)) strong.add(m[0]);
  if (prefix) {
    const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}\\n]{1,200}\\}`, "gi");
    for (const m of text.matchAll(re)) strong.add(m[0]);
  }
  for (const f of extractFlags(text, prefix ? [prefix] : [])) {
    if (!strong.has(f)) weak.add(f);
  }
  return { strong: Array.from(strong), weak: Array.from(weak) };
}
function budget(deadlineS) {
  const start = Date.now();
  const deadlineMs = deadlineS * 1e3;
  return {
    start,
    deadlineMs,
    left() {
      return Math.max(0, deadlineMs - (Date.now() - start));
    },
    over(reserve = 0) {
      return Date.now() - start + reserve >= deadlineMs;
    }
  };
}
var solveTools = (ctx) => [
  textTool(ctx, {
    name: "ctf_solve",
    category: "meta",
    description: "AUTOPILOT. Give a file path, URL, or text blob and it runs the whole pipeline itself \u2014 triage, recursive decode, strings, metadata, carving, stego, pcap/archive, web source-leak probes \u2014 in parallel, and returns the flag in ONE call when the challenge is auto-solvable (encodings, strings, LSB, appended data, exposed /flag, simple RSA). Prefer this first on every challenge; fall back to the specific ctf_* tools + skill only when it reports it needs reasoning. Set prefix= to your competition flag format for best accuracy.",
    parameters: {
      input: { type: "string", required: true, description: "File path, URL, or raw text/encoded blob" },
      kind: { type: "string", required: false, description: "Override detection: file | url | text" },
      prefix: { type: "string", required: false, description: "Flag prefix, e.g. KUBSTU, CSSCTF (improves accuracy)" },
      deadline_s: { type: "number", required: false, description: "Soft time budget in seconds (default 45). Expensive stages are skipped once exceeded." },
      deep: { type: "boolean", required: false, description: "Keep going after the first flag to surface everything (default false = stop at first strong flag)." },
      submit_url: { type: "string", required: false, description: "If set, auto-submit a found flag here (CTFd-style POST, or host:port for a nc checker)." }
    },
    async execute(args) {
      const input = args.input;
      const prefix = args.prefix ? String(args.prefix) : void 0;
      const deep = !!args.deep;
      const b = budget(Math.min(Math.max(+args.deadline_s || 45, 5), 120));
      let kind = args.kind || "";
      if (!kind) {
        if (/^https?:\/\//i.test(input)) kind = "url";
        else if (input.length < 4096 && fs2.existsSync(input)) kind = "file";
        else kind = "text";
      }
      const trace = [];
      const strongAll = /* @__PURE__ */ new Set();
      const weakAll = /* @__PURE__ */ new Set();
      const record = (where, text) => {
        const { strong, weak } = scanFlags(text, prefix);
        strong.forEach((f) => strongAll.add(f));
        weak.forEach((f) => weakAll.add(f));
        if (strong.length) trace.push(`\u2713 ${where}: ${strong.join(", ")}`);
      };
      const done = () => !deep && strongAll.size > 0;
      if (kind === "text") {
        await solveText(input, prefix, record, trace);
      } else if (kind === "url") {
        await solveUrl(input, b, record, trace);
      } else if (kind === "file") {
        if (!fs2.existsSync(input)) return `File not found: ${input}`;
        await solveFile(input, b, deep, record, trace, done);
      }
      let submitNote = "";
      if (args.submit_url && strongAll.size) {
        const flag = Array.from(strongAll)[0];
        try {
          submitNote = "\n\n" + section("auto-submit", submitFlag(String(args.submit_url), flag));
        } catch (e) {
          submitNote = "\n\n" + section("auto-submit", `failed: ${e?.message || e}`);
        }
      }
      return formatResult(kind, strongAll, weakAll, trace, b) + submitNote;
    }
  })
];
async function solveText(input, prefix, record, trace) {
  record("literal", input);
  const dd = deepDecode(input, 5);
  if (dd.flags.length) record("decode-chain", dd.flags.join("\n"));
  for (const h of dd.hits) record(`decode[${h.path.join("->")}]`, h.value);
  const rb = rotBrute(input).filter((l) => l.includes("<--"));
  if (rb.length) record("rot/atbash", rb.join("\n"));
  const grab = (name2, minDigits = 3) => {
    const m = input.match(new RegExp(`\\b${name2}\\s*[=:]\\s*(0x[0-9a-fA-F]+|[0-9]{${minDigits},})`));
    return m ? m[1] : null;
  };
  const n = grab("n") || grab("N");
  const c = grab("c") || grab("ct") || grab("cipher");
  if (n && c) {
    const e = grab("e", 1) || "65537";
    trace.push("\u2026 n/e/c detected \u2014 running RSA engine");
    const out = runPyHelper("rsa_attacks.py", ["--n", n, "--e", e, "--c", c], { timeoutMs: 45e3 });
    record("rsa", out);
  } else if (!dd.hits.length) {
    trace.push("\u2026 no standard encoding matched \u2014 may be a cipher (ctf_crypto_xor / ctf_crypto_classical) or custom crypto");
  }
}
async function solveUrl(url, b, record, trace) {
  const base = url.replace(/\/$/, "");
  if (!hasTool("curl")) {
    trace.push("curl not installed \u2014 cannot probe URL");
    return;
  }
  const paths = ["", "/flag", "/flag.txt", "/robots.txt", "/.git/HEAD", "/.env", "/sitemap.xml", "/index.php.bak", "/backup.zip"];
  const jobs = paths.map((p) => ({
    label: p || "(root)",
    cmd: `curl -sSL "${base}${p}" --max-time 8`,
    opts: { timeoutMs: 9e3, tolerateFail: true, maxBytes: 2e5 }
  }));
  const results = await parallel(jobs);
  for (const r of results) record(`GET ${r.label}`, r.out);
  const hdr = await safeExecAsync(`curl -sSIL "${base}" --max-time 8`, { tolerateFail: true });
  record("headers", hdr);
  const gitHead = results.find((r) => r.label === "/.git/HEAD");
  if (gitHead && /^ref:|[0-9a-f]{40}/m.test(gitHead.out) && hasTool("git-dumper") && !b.over(8e3)) {
    const dir = fs2.mkdtempSync(path2.join(os.tmpdir(), "gitdump_"));
    safeExec(`git-dumper "${base}/.git/" "${dir}" 2>&1 | tail -3`, { timeoutMs: Math.min(b.left(), 3e4), tolerateFail: true });
    const hist = safeExec(`cd "${dir}" && git log -p 2>/dev/null | head -c 200000`, { tolerateFail: true });
    record("git-dump", hist);
    safeExec(`rm -rf "${dir}"`, { tolerateFail: true });
  } else if (gitHead && /ref:|[0-9a-f]{40}/.test(gitHead.out)) {
    trace.push("\u2026 /.git exposed \u2014 install git-dumper, or `wget -r http://host/.git/ && git checkout .`");
  }
  if (b.over()) trace.push("\u2026 time budget reached (url)");
  trace.push("\u2026 for injection/auth/JWT load skill ctf-web and use ctf_web_probe / ctf_web_fuzz / ctf_jwt");
}
async function solveFile(p, b, deep, record, trace, done) {
  const buf = fs2.readFileSync(p);
  const head = buf.subarray(0, 1024 * 256);
  const sig = fileSig(p);
  const ft = cachedExec(`file -b "${p}"`, sig, { tolerateFail: true });
  const low = ft.toLowerCase();
  const ent = shannonEntropy(head);
  trace.push(`file: ${ft.trim()} | entropy ${ent.toFixed(2)}`);
  record("raw-bytes", buf.toString("latin1").slice(0, 3e5));
  if (done()) return;
  if (looksText(head, 0.85)) {
    const dd = deepDecode(head.toString("utf-8"), 5);
    if (dd.flags.length) record("decode-chain", dd.flags.join("\n"));
    for (const h of dd.hits) record(`decode[${h.path.join("->")}]`, h.value);
    if (done()) return;
  }
  const battery = [
    { label: "strings-ascii", cmd: `strings -n 5 "${p}"`, opts: { tolerateFail: true, maxBytes: 3e5 } },
    { label: "strings-utf16", cmd: `strings -e l -n 5 "${p}"`, opts: { tolerateFail: true, maxBytes: 15e4 } },
    { label: "tail", cmd: `tail -c 2048 "${p}" | strings -n 4`, opts: { tolerateFail: true } }
  ];
  if (hasTool("exiftool")) battery.push({ label: "exiftool", cmd: `exiftool "${p}"`, opts: { tolerateFail: true } });
  if (hasTool("binwalk")) battery.push({ label: "binwalk", cmd: `binwalk "${p}"`, opts: { tolerateFail: true } });
  const bat = await parallel(battery);
  for (const r of bat) record(r.label, r.out);
  if (done()) return;
  const cat = [];
  if (/png|bitmap|bmp/.test(low) && hasTool("zsteg")) cat.push({ label: "zsteg", cmd: `zsteg -a "${p}" 2>&1 | head -200`, opts: { timeoutMs: Math.min(b.left(), 4e4), tolerateFail: true } });
  if (/image|png|jpeg|jpg|bitmap|bmp|gif/.test(low) && hasTool("zbarimg")) cat.push({ label: "qr/barcode", cmd: `zbarimg -q --raw "${p}" 2>/dev/null`, opts: { tolerateFail: true } });
  if (/jpeg|jpg|wav|bmp/.test(low) && hasTool("stegseek")) cat.push({ label: "stegseek", cmd: `stegseek --crack "${p}" /usr/share/wordlists/rockyou.txt /tmp/_ss_$$ 2>&1 | tail -4; [ -f /tmp/_ss_$$ ] && cat /tmp/_ss_$$ | head -c 500; rm -f /tmp/_ss_$$`, opts: { timeoutMs: Math.min(b.left(), 4e4), tolerateFail: true } });
  else if (/jpeg|jpg|wav/.test(low) && hasTool("steghide")) cat.push({ label: "steghide-blank", cmd: `steghide extract -sf "${p}" -p '' -xf /tmp/_sh_$$ 2>&1; [ -f /tmp/_sh_$$ ] && cat /tmp/_sh_$$ | head -c 500; rm -f /tmp/_sh_$$`, opts: { tolerateFail: true } });
  if (/pdf/.test(low)) cat.push({ label: "pdftotext", cmd: `pdftotext "${p}" - 2>/dev/null | head -200 || strings "${p}" | head -200`, opts: { tolerateFail: true } });
  if (/zip archive|zip file/.test(low)) cat.push({ label: "zip-list", cmd: `unzip -l "${p}" 2>&1 | head -40`, opts: { tolerateFail: true } });
  if (/pcap|capture|tcpdump/.test(low) && hasTool("tshark")) cat.push({ label: "pcap-sweep", cmd: `tshark -r "${p}" -T fields -e data.text -e text 2>/dev/null | strings | grep -iE 'flag\\{|ctf\\{|pass|token' | head -40`, opts: { timeoutMs: Math.min(b.left(), 4e4), tolerateFail: true } });
  if (cat.length && !b.over(2e3)) {
    const cr = await parallel(cat);
    for (const r of cr) record(r.label, r.out);
    if (done()) return;
  }
  if (/png|bitmap|bmp/.test(low) && !hasTool("zsteg")) {
    record("lsb-python", runPyHelper("stego_lsb.py", [p]));
    if (done()) return;
  }
  if (/pcap|capture|tcpdump/.test(low) && hasTool("tshark") && !b.over(3e3)) {
    record("usb-hid", runPyHelper("usb_hid.py", [p], { timeoutMs: Math.min(b.left(), 4e4) }));
    if (done()) return;
  }
  if (hasTool("binwalk") && !b.over(5e3)) {
    const outdir = fs2.mkdtempSync(path2.join(os.tmpdir(), "ctfsolve_"));
    safeExec(`binwalk --run-as=root -e -C "${outdir}" "${p}" 2>&1 | tail -5`, { timeoutMs: Math.min(b.left(), 3e4), tolerateFail: true });
    const carved = [];
    const walk = (d, depth) => {
      if (depth > 3) return;
      for (const name2 of fs2.readdirSync(d)) {
        const fp = path2.join(d, name2);
        try {
          const st = fs2.statSync(fp);
          if (st.isDirectory()) walk(fp, depth + 1);
          else if (st.size > 0 && st.size < 5 * 1024 * 1024) carved.push(fp);
        } catch {
        }
      }
    };
    try {
      walk(outdir, 0);
    } catch {
    }
    for (const fp of carved.slice(0, 40)) {
      if (b.over()) break;
      const cbuf = fs2.readFileSync(fp);
      record(`carved:${path2.basename(fp)}`, cbuf.toString("latin1").slice(0, 1e5));
      if (looksText(cbuf.subarray(0, 4096))) {
        const dd = deepDecode(cbuf.toString("utf-8").slice(0, 2e4), 4);
        if (dd.flags.length) record(`carved-decode:${path2.basename(fp)}`, dd.flags.join("\n"));
      }
      if (done()) break;
    }
    safeExec(`rm -rf "${outdir}"`, { tolerateFail: true });
  }
}
function formatResult(kind, strong, weak, trace, b) {
  const out = [];
  if (strong.size) {
    out.push("\u{1F6A9} FLAG(S) FOUND:\n" + Array.from(strong).map((f) => "  " + f).join("\n"));
  } else if (weak.size) {
    out.push("\u26A0 Candidate flag-like strings (verify format):\n" + Array.from(weak).slice(0, 15).map((f) => "  " + f).join("\n"));
  } else {
    out.push("No flag auto-solved.");
  }
  out.push(section("trace (" + ((Date.now() - b.start) / 1e3).toFixed(1) + "s)", trace.slice(0, 40).join("\n") || "(nothing)"));
  if (!strong.size) {
    const hint = kind === "url" ? "Needs reasoning: load skill ctf-web; try ctf_web_probe, ctf_web_fuzz, ctf_jwt, or injection from the skill." : kind === "text" ? "Needs reasoning: likely a cipher/custom crypto. Load ctf-crypto; try ctf_crypto_xor, ctf_crypto_classical, ctf_crypto_rsa." : "Needs reasoning: run ctf_triage for category, load the matching skill, and use the specific ctf_* tool (e.g. ctf_reverse / ctf_pwn_recon / ctf_stego / ctf_pcap).";
    out.push(section("next", hint));
  }
  return cap(out.join("\n\n"), 9e3);
}

// src/tools/universal.ts
var import_child_process2 = require("child_process");
var fs3 = __toESM(require("fs"));
var universalTools = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_triage — the first call for any challenge. Classifies the
   * input (file / blob / url), suggests a category + which skill to
   * load, and surfaces quick wins (flags already present, encodings).
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_triage",
    category: "meta",
    description: "START HERE for any new challenge. Classify a file path, raw text blob, or URL: detect likely CTF category, file type, present encodings, and immediate flag hits, then recommend which ctf_* tool and which skill to load next. Call this before anything else.",
    parameters: {
      input: { type: "string", required: true, description: "A file path, a URL, or a raw text/encoded blob" },
      kind: {
        type: "string",
        required: false,
        description: 'Override auto-detection: one of "file", "url", "text"'
      }
    },
    execute(args) {
      const input = args.input;
      let kind = args.kind || "";
      if (!kind) {
        if (/^https?:\/\//i.test(input)) kind = "url";
        else if (input.length < 4096 && fs3.existsSync(input)) kind = "file";
        else kind = "text";
      }
      const out = [`# CTF Triage
Detected input kind: **${kind}**`];
      if (kind === "url") {
        out.push(
          section(
            "Recommendation",
            "Category: **web**. Next: `ctf_web_probe` then load skill `ctf-web`. If a login/param is present, consider `ctf_jwt`, SQLi/SSTI/LFI checks from the web skill."
          )
        );
        return out.join("\n\n");
      }
      if (kind === "file") {
        if (!fs3.existsSync(input)) return `File not found: ${input}`;
        const buf = fs3.readFileSync(input).subarray(0, 1024 * 256);
        const ft = safeExec(`file -b "${input}"`, { tolerateFail: true });
        const ent = shannonEntropy(buf).toFixed(2);
        const pr = (printableRatio(buf) * 100).toFixed(0);
        out.push(section("file", ft));
        out.push(section("stats", `entropy: ${ent} bits/byte (8.0\u2248encrypted/compressed) | printable: ${pr}%`));
        let cat = "misc";
        const low = ft.toLowerCase();
        if (/elf|pe32|mach-o|executable|shared object/.test(low)) {
          cat = /not stripped|debug|dynamically/.test(low) ? "reverse/pwn" : "reverse/pwn";
          out.push(section("Recommendation", `Category: **${cat}**. Next: \`ctf_reverse\` (and \`ctf_pwn_recon\` if it reads input). Load skill \`ctf-reverse\` / \`ctf-pwn\`.`));
        } else if (/image|png|jpeg|gif|bitmap|tiff/.test(low)) {
          cat = "forensics/stego";
          out.push(section("Recommendation", `Category: **${cat}**. Next: \`ctf_stego\`. Load skill \`ctf-stego\`.`));
        } else if (/audio|wave|mpeg|flac|ogg/.test(low)) {
          cat = "stego (audio)";
          out.push(section("Recommendation", `Category: **${cat}**. Inspect spectrogram, LSB. Next: \`ctf_stego\`, load skill \`ctf-stego\`.`));
        } else if (/pcap|tcpdump|capture/.test(low)) {
          cat = "forensics (network)";
          out.push(section("Recommendation", `Category: **${cat}**. Next: \`ctf_pcap\`. Load skill \`ctf-forensics\`.`));
        } else if (/zip|rar|7-zip|tar|gzip|archive|compress/.test(low)) {
          cat = "forensics (archive)";
          out.push(section("Recommendation", `Category: **${cat}**. Try extraction; if encrypted use \`ctf_crack_archive\`. Load skill \`ctf-forensics\`.`));
        } else if (/pdf/.test(low)) {
          cat = "forensics (pdf)";
          out.push(section("Recommendation", `Category: **${cat}**. Next: \`ctf_analyze_file\`, pdf text/objects, \`ctf_crack_archive\` if locked.`));
        } else if (/data|ASCII|UTF-8|Unicode text/.test(ft)) {
          cat = "crypto/misc (text)";
          const txt = buf.toString("utf-8");
          out.push(section("Recommendation", `Category: **${cat}**. Next: \`ctf_auto_decode\`, \`ctf_crypto_*\`. Load skill \`ctf-crypto\`.`));
          const dd2 = deepDecode(txt, 3);
          if (dd2.flags.length) out.push(section("FLAGS (from quick decode)", dd2.flags.join("\n")));
          else if (dd2.hits.length) out.push(section("Encodings found", dd2.hits.slice(0, 5).map((h) => `${h.path.join("->")}: ${cap(h.value, 160)}`).join("\n")));
        }
        out.push(section("strings (flag-like)", (() => {
          const s = safeExec(`strings -n 6 "${input}" | head -2000`, { tolerateFail: true });
          const fl2 = extractFlags(s);
          return fl2.length ? fl2.join("\n") : "(none in strings)";
        })()));
        return out.join("\n\n");
      }
      const fl = extractFlags(input);
      if (fl.length) out.push(section("FLAGS (literal)", fl.join("\n")));
      const dd = deepDecode(input, 4);
      if (dd.flags.length) out.push(section("FLAGS (after decoding)", dd.flags.join("\n")));
      if (dd.hits.length)
        out.push(section("Decode chains found", dd.hits.slice(0, 8).map((h) => `${h.path.join(" -> ")}: ${cap(h.value, 200)}`).join("\n")));
      out.push(
        section(
          "Recommendation",
          dd.hits.length ? "Encodings detected \u2014 run `ctf_auto_decode` for the full tree, then `ctf_crypto_*` if a cipher is involved. Load skill `ctf-crypto`." : "No standard encoding matched. Likely a cipher or custom crypto \u2014 load skill `ctf-crypto`, try `ctf_crypto_xor`, `ctf_crypto_classical`, frequency analysis."
        )
      );
      return out.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_auto_decode — deep recursive multi-codec decoder.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_auto_decode",
    category: "crypto",
    description: "Deep, RECURSIVE multi-codec decoder. Tries Base64/32/58/85, hex, binary, decimal, octal, URL, Morse, gzip/zlib, ROT-N and Atbash, chaining them automatically (e.g. base64->hex->gzip). Returns every readable result plus any flags found. Use on any encoded-looking string when unsure of the encoding.",
    parameters: {
      data: { type: "string", required: true, description: "The string to decode" },
      max_depth: { type: "number", required: false, description: "Max chained decode depth (default 4)" }
    },
    execute(args) {
      const depth = Math.min(Math.max(+args.max_depth || 4, 1), 6);
      const { hits, flags } = deepDecode(args.data, depth);
      const parts = [];
      if (flags.length) parts.push(section("\u{1F6A9} FLAGS", flags.join("\n")));
      if (hits.length) {
        const lines = hits.sort((a, b) => a.depth - b.depth).map((h) => `[depth ${h.depth}] ${h.path.join(" -> ")}
    ${cap(h.value, 400)}`);
        parts.push(section("Decode chains", lines.join("\n")));
      }
      const rb = rotBrute(args.data).filter((l) => l.includes("<--"));
      if (rb.length) parts.push(section("ROT/Atbash hits", rb.join("\n")));
      if (!parts.length) return "No successful decoding found. Consider XOR, a classical cipher, or custom crypto (ctf_crypto_xor / ctf_crypto_classical).";
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_extract_flags — flag regex over text or a file.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_extract_flags",
    category: "meta",
    description: 'Search for flag patterns (flag{...}, CTF{...}, picoCTF{...}, and any PREFIX{...}) in a string or file. Pass a custom prefix for competition-specific formats (e.g. "KUBSTU", "CSSCTF"). Use after decoding or analysing data.',
    parameters: {
      input: { type: "string", required: true, description: "Text to search, or a file path" },
      is_file: { type: "boolean", required: false, description: "Treat input as a file path" },
      prefix: { type: "string", required: false, description: "Extra flag prefix to match, e.g. KUBSTU" }
    },
    execute(args) {
      let text = args.input;
      if (args.is_file) {
        if (!fs3.existsSync(text)) return "File not found.";
        text = fs3.readFileSync(text).toString("latin1");
      }
      const extra = args.prefix ? [String(args.prefix)] : [];
      const found = extractFlags(text, extra);
      return found.length ? found.join("\n") : "No flag pattern found.";
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_run — arbitrary shell command for CTF tooling.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_run",
    category: "meta",
    description: "Execute a shell command for CTF analysis (zsteg, steghide, sage, john, hashcat, nc, python, radare2, etc.). Use ONLY for CTF-related work on challenges/targets you are authorised to analyse. Output is length-capped. For long-running network interaction prefer a script.",
    parameters: {
      command: { type: "string", required: true, description: "The command to run" },
      cwd: { type: "string", required: false, description: "Working directory" },
      timeout_s: { type: "number", required: false, description: "Timeout in seconds (default 30, max 120)" }
    },
    execute(args) {
      const cwd = args.cwd || ctx?.bash?.cwd || process.cwd();
      const timeout = Math.min(Math.max(+args.timeout_s || 30, 1), 120) * 1e3;
      try {
        const out = (0, import_child_process2.execSync)(args.command, {
          cwd,
          encoding: "utf-8",
          timeout,
          maxBuffer: 1024 * 1024 * 8
        });
        return cap(out, 9e3) || "(no output)";
      } catch (e) {
        const body = `${e.stdout || ""}
${e.stderr || ""}`.trim();
        return cap(`[exit ${e.status ?? "?"}] ${e.message}
${body}`, 9e3);
      }
    }
  })
];

// src/tools/crypto.ts
var cryptoTools = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_hash_id — identify a hash.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_hash_id",
    category: "crypto",
    description: "Identify the likely algorithm of a hash string (by length/charset and, if installed, hashid/hash-identifier), and suggest the matching hashcat/john mode. Use before cracking a hash.",
    parameters: {
      hash: { type: "string", required: true, description: "The hash string" }
    },
    execute(args) {
      const h = String(args.hash).trim();
      const parts = [];
      if (hasTool("hashid")) parts.push(section("hashid", safeExec(`hashid -m "${h.replace(/"/g, "")}"`, { tolerateFail: true })));
      parts.push(section("heuristic", runPyHelper("hash_id.py", [h])));
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_crypto_rsa — RSA attack suite.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_crypto_rsa",
    category: "crypto",
    description: "RSA attack suite. Give whatever you have (n, e, c, and optionally p, q, phi, d, or multiple (n,e,c) sets). Automatically tries: factordb lookup, trivial/small factors, Fermat (close primes), small-e e-th root (H\xE5stad single), Wiener (small d), common-modulus, shared-prime GCD, and direct decrypt when the key is recoverable. Returns the plaintext/flag if found.",
    parameters: {
      n: { type: "string", required: false, description: "Modulus n (decimal or 0x hex)" },
      e: { type: "string", required: false, description: "Public exponent e (default 65537)" },
      c: { type: "string", required: false, description: "Ciphertext c" },
      p: { type: "string", required: false, description: "Known prime p" },
      q: { type: "string", required: false, description: "Known prime q" },
      extra: {
        type: "string",
        required: false,
        description: 'JSON for advanced modes, e.g. {"sets":[{"n":..,"e":..,"c":..},{..}]} for common-modulus/H\xE5stad/shared-prime'
      }
    },
    execute(args) {
      const a = [];
      if (args.n) a.push("--n", String(args.n));
      if (args.e) a.push("--e", String(args.e));
      if (args.c) a.push("--c", String(args.c));
      if (args.p) a.push("--p", String(args.p));
      if (args.q) a.push("--q", String(args.q));
      if (args.extra) a.push("--extra", String(args.extra));
      return runPyHelper("rsa_attacks.py", a, { timeoutMs: 6e4 });
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_crypto_xor — XOR analysis.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_crypto_xor",
    category: "crypto",
    description: 'XOR cryptanalysis. Modes: single-byte brute force (scored by English/flag likeness), repeating-key recovery (Hamming-distance keysize + per-column frequency), and known-plaintext key recovery (give a crib like "flag{"). Input ciphertext as hex or base64.',
    parameters: {
      data: { type: "string", required: true, description: "Ciphertext (hex or base64)" },
      encoding: { type: "string", required: false, description: "Input encoding: hex (default) or base64" },
      mode: { type: "string", required: false, description: "single | repeating | known (default: auto-try all)" },
      crib: { type: "string", required: false, description: 'Known plaintext substring for "known" mode, e.g. flag{' }
    },
    execute(args) {
      const a = ["--data", String(args.data), "--encoding", String(args.encoding || "hex"), "--mode", String(args.mode || "auto")];
      if (args.crib) a.push("--crib", String(args.crib));
      return runPyHelper("xor_tools.py", a, { timeoutMs: 3e4 });
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_crypto_classical — classical ciphers + frequency analysis.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_crypto_classical",
    category: "crypto",
    description: 'Classical cipher toolkit: Caesar/ROT brute force, Vigen\xE8re (auto key-length via Kasiski/IoC + decrypt with given or guessed key), Atbash, rail-fence brute, and letter-frequency analysis for substitution ciphers. Use for "classical crypto" challenges.',
    parameters: {
      text: { type: "string", required: true, description: "The cipher text" },
      cipher: { type: "string", required: false, description: "caesar | vigenere | atbash | railfence | freq | auto (default auto)" },
      key: { type: "string", required: false, description: "Key for Vigen\xE8re (if known)" }
    },
    execute(args) {
      const a = ["--text", String(args.text), "--cipher", String(args.cipher || "auto")];
      if (args.key) a.push("--key", String(args.key));
      return runPyHelper("crypto_classical.py", a, { timeoutMs: 3e4 });
    }
  })
];

// src/tools/web.ts
var fs4 = __toESM(require("fs"));
var webTools = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_web_probe — recon on a single URL.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_web_probe",
    category: "web",
    description: "Recon a target URL (authorised challenges only): response headers, title, server/tech fingerprint, cookies & security headers, robots/sitemap, and a check for common source-leak paths (.git/HEAD, .env, backups, .DS_Store, swagger). Flags leaks worth pursuing.",
    parameters: {
      url: { type: "string", required: true, description: "Target URL (http/https)" }
    },
    execute(args) {
      const base = String(args.url).replace(/\/$/, "");
      const parts = [];
      const head = safeExec(`curl -sSikL "${base}" --max-time 10 -o /dev/null -D - 2>&1 | head -40`, { tolerateFail: true });
      parts.push(section("response headers (follow redirects)", head));
      const title = safeExec(`curl -sSL "${base}" --max-time 10 | grep -oiP '(?<=<title>).*?(?=</title>)' | head -1`, { tolerateFail: true });
      parts.push(section("title", title || "(none)"));
      const sec = safeExec(`curl -sSI "${base}" --max-time 10 | grep -iE 'content-security-policy|x-frame|x-powered-by|server:|set-cookie|x-content-type' | head -20`, { tolerateFail: true });
      parts.push(section("server / cookies / security headers", sec || "(none notable)"));
      const probes = ["/robots.txt", "/sitemap.xml", "/.git/HEAD", "/.git/config", "/.env", "/.svn/entries", "/.DS_Store", "/backup.zip", "/www.zip", "/source.zip", "/config.php.bak", "/index.php.bak", "/swagger.json", "/api/swagger.json", "/.htaccess", "/admin", "/flag", "/flag.txt"];
      const leakLines = [];
      for (const pth of probes) {
        const code = safeExec(`curl -s -o /dev/null -w "%{http_code} %{size_download}" "${base}${pth}" --max-time 6`, { tolerateFail: true }).trim();
        const status = code.split(" ")[0];
        if (status && status !== "404" && status !== "000") leakLines.push(`${pth} -> HTTP ${code}`);
      }
      parts.push(section("path probes (non-404)", leakLines.length ? leakLines.join("\n") + "\n\n\u26A0 If /.git/HEAD is 200, dump it: `git-dumper " + base + "/.git/ out` (or wget -r the .git dir then `git checkout .`)." : "(all 404)"));
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_web_fuzz — directory / content discovery.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_web_fuzz",
    category: "web",
    description: "Content discovery against a URL using ffuf or gobuster (whichever is installed), with a bundled wordlist by default. Use FUZZ as the placeholder for custom fuzzing (paths, params, subdomains/vhosts via Host header). Authorised targets only.",
    parameters: {
      url: { type: "string", required: true, description: "URL with optional FUZZ marker, e.g. https://host/FUZZ or https://host/?x=FUZZ" },
      wordlist: { type: "string", required: false, description: "Wordlist path (defaults to bundled dirs.txt)" },
      extensions: { type: "string", required: false, description: "Comma list of extensions, e.g. php,txt,bak" },
      mode: { type: "string", required: false, description: "dir (default) | vhost" }
    },
    execute(args) {
      let url = String(args.url);
      if (!/FUZZ/.test(url) && String(args.mode) !== "vhost") url = url.replace(/\/$/, "") + "/FUZZ";
      const wl = args.wordlist || pluginFile("wordlists", "dirs.txt") || "/usr/share/wordlists/dirb/common.txt";
      if (!fs4.existsSync(wl)) return `Wordlist not found: ${wl}. Pass wordlist= explicitly.`;
      const ext = args.extensions ? String(args.extensions) : "";
      if (hasTool("ffuf")) {
        if (String(args.mode) === "vhost") {
          const host = url.replace(/^https?:\/\//, "").split("/")[0];
          return section("ffuf (vhost)", safeExec(`ffuf -u "${url}" -H "Host: FUZZ.${host}" -w "${wl}" -mc 200,204,301,302,307,401,403 -fs 0 -s 2>/dev/null | head -60`, { timeoutMs: 9e4, tolerateFail: true }));
        }
        const extArg = ext ? `-e ${ext.split(",").map((x) => x.startsWith(".") ? x : "." + x).join(",")}` : "";
        return section("ffuf", safeExec(`ffuf -u "${url}" -w "${wl}" ${extArg} -mc 200,204,301,302,307,401,403 -s 2>/dev/null | head -60`, { timeoutMs: 9e4, tolerateFail: true }));
      }
      if (hasTool("gobuster")) {
        const extArg = ext ? `-x ${ext}` : "";
        const target = url.replace(/\/FUZZ$/, "");
        return section("gobuster", safeExec(`gobuster dir -u "${target}" -w "${wl}" ${extArg} -q -s '200,204,301,302,307,401,403' -b '' 2>/dev/null | head -60`, { timeoutMs: 9e4, tolerateFail: true }));
      }
      return 'Neither ffuf nor gobuster installed. Install one (apt install ffuf) or fall back to: `for w in $(cat wl); do curl -s -o /dev/null -w "%{http_code} $w\\n" URL/$w; done | grep -v 404`';
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_jwt — JWT decode & attacks.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_jwt",
    category: "web",
    description: "Decode a JWT (header+payload), flag common vulns (alg=none, HS/RS confusion), and attempt a weak-secret crack with a bundled wordlist (HS256). Optionally forge a token: give a new payload and a known/guessed secret. For authorised challenges only.",
    parameters: {
      token: { type: "string", required: true, description: "The JWT" },
      secret: { type: "string", required: false, description: "Secret to sign a forged token with (enables forge mode)" },
      forge_payload: { type: "string", required: false, description: 'JSON payload to forge (e.g. {"user":"admin"})' }
    },
    execute(args) {
      const a = ["--token", String(args.token)];
      const wl = pluginFile("wordlists", "jwt_secrets.txt");
      if (wl) a.push("--wordlist", wl);
      if (args.secret) a.push("--secret", String(args.secret));
      if (args.forge_payload) a.push("--forge", String(args.forge_payload));
      return runPyHelper("jwt_tool.py", a, { timeoutMs: 3e4 });
    }
  })
];

// src/tools/forensics.ts
var fs5 = __toESM(require("fs"));
var forensicsTools = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_analyze_file — one-shot file fingerprint.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_analyze_file",
    category: "forensics",
    description: "Fingerprint any unknown CTF attachment in one call: file type, entropy, strings (ascii+utf16), hexdump head/tail, exiftool metadata, binwalk signatures, and embedded-file carving hints. Use on every unknown file before deciding a category.",
    parameters: {
      path: { type: "string", required: true, description: "Absolute path to the file" },
      extract: { type: "boolean", required: false, description: "Run binwalk -e to auto-extract embedded files" }
    },
    execute(args) {
      const p = args.path;
      if (!fs5.existsSync(p)) return `File not found: ${p}`;
      const buf = fs5.readFileSync(p).subarray(0, 1024 * 512);
      const parts = [];
      parts.push(section("file", safeExec(`file "${p}"`, { tolerateFail: true })));
      parts.push(section("size / entropy", `${fs5.statSync(p).size} bytes | entropy ${shannonEntropy(buf).toFixed(2)} bits/byte`));
      parts.push(section("strings (ascii, n>=6, first 60)", safeExec(`strings -n 6 "${p}" | head -60`, { tolerateFail: true })));
      parts.push(section("strings (utf-16le, first 30)", safeExec(`strings -e l -n 6 "${p}" | head -30`, { tolerateFail: true })));
      parts.push(section("hexdump head (256B)", safeExec(`xxd -l 256 "${p}"`, { tolerateFail: true })));
      parts.push(section("hexdump tail (128B)", safeExec(`tail -c 128 "${p}" | xxd`, { tolerateFail: true })));
      if (hasTool("exiftool")) parts.push(section("exiftool", safeExec(`exiftool "${p}"`, { tolerateFail: true })));
      if (hasTool("binwalk")) {
        parts.push(section("binwalk", safeExec(`binwalk "${p}"`, { tolerateFail: true })));
        if (args.extract) parts.push(section("binwalk -e", safeExec(`binwalk -e --run-as=root "${p}" 2>&1 | tail -30`, { timeoutMs: 4e4, tolerateFail: true })));
      }
      const miss = missingTools(["exiftool", "binwalk", "foremost"]);
      if (miss.length) parts.push(section("missing tools", `Not installed: ${miss.join(", ")} (apt install ${miss.join(" ")})`));
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_stego — image/audio steganography battery.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_stego",
    category: "forensics",
    description: "Run a steganography battery on an image or audio file: exiftool, strings, pngcheck/zsteg (PNG/BMP), steghide extract (JPG/WAV, tries blank + given password), LSB plane extraction, and a spectrogram hint for audio. Use for forensics/stego image & sound challenges.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the image/audio file" },
      password: { type: "string", required: false, description: "Password to try with steghide (also tries empty)" }
    },
    execute(args) {
      const p = args.path;
      if (!fs5.existsSync(p)) return `File not found: ${p}`;
      const ft = safeExec(`file -b "${p}"`, { tolerateFail: true }).toLowerCase();
      const parts = [section("file", ft)];
      parts.push(section("strings (flag-like + readable, first 40)", safeExec(`strings -n 6 "${p}" | head -40`, { tolerateFail: true })));
      if (hasTool("exiftool")) parts.push(section("exiftool", safeExec(`exiftool "${p}"`, { tolerateFail: true })));
      if (/png|bitmap|bmp/.test(ft)) {
        if (hasTool("pngcheck")) parts.push(section("pngcheck", safeExec(`pngcheck -vtp7 "${p}" 2>&1 | head -40`, { tolerateFail: true })));
        if (hasTool("zsteg")) parts.push(section("zsteg -a", safeExec(`zsteg -a "${p}" 2>&1 | head -60`, { timeoutMs: 4e4, tolerateFail: true })));
        else parts.push(section("zsteg", "not installed (gem install zsteg) \u2014 using python LSB fallback below"));
        parts.push(section("LSB planes (python fallback)", runPyHelper("stego_lsb.py", [p])));
      }
      if (/jpeg|jpg|wav|au\b/.test(ft)) {
        if (hasTool("steghide")) {
          const pw = args.password ? String(args.password) : "";
          const tryPw = (pass, label) => section(`steghide (${label})`, safeExec(`steghide extract -sf "${p}" -p '${pass.replace(/'/g, "'\\''")}' -xf /tmp/steghide_out 2>&1; echo '---'; [ -f /tmp/steghide_out ] && (cat /tmp/steghide_out | head -c 400; rm -f /tmp/steghide_out)`, { tolerateFail: true }));
          parts.push(tryPw("", "empty password"));
          if (pw) parts.push(tryPw(pw, "given password"));
        } else {
          parts.push(section("steghide", "not installed (apt install steghide)"));
        }
      }
      if (/audio|wave|mpeg|flac|ogg/.test(ft)) {
        parts.push(section("audio hint", "Open the spectrogram in Audacity/Sonic Visualiser \u2014 flags are often drawn there. For LSB-in-samples, extract with: `sox in.wav -t raw -e unsigned -b 8 out.raw` then inspect. DTMF tones -> use a DTMF decoder."));
      }
      const miss = missingTools(["zsteg", "steghide", "pngcheck", "exiftool"]);
      if (miss.length) parts.push(section("missing tools", miss.join(", ")));
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_pcap — network capture analysis via tshark.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_pcap",
    category: "forensics",
    description: "Analyse a .pcap/.pcapng capture with tshark: protocol hierarchy, conversations, HTTP requests & objects, DNS queries, and a scan for flags/credentials across all ASCII payloads. Use for network-forensics challenges.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the .pcap/.pcapng file" },
      filter: { type: "string", required: false, description: 'Optional display filter, e.g. "http" or "tcp.port==1337"' }
    },
    execute(args) {
      const p = args.path;
      if (!fs5.existsSync(p)) return `File not found: ${p}`;
      if (!hasTool("tshark")) return "tshark not installed (apt install tshark / wireshark-cli). As a fallback, open the capture in Wireshark and use File > Export Objects.";
      const parts = [];
      parts.push(section("protocol hierarchy", safeExec(`tshark -r "${p}" -q -z io,phs 2>/dev/null | head -40`, { tolerateFail: true })));
      parts.push(section("TCP conversations", safeExec(`tshark -r "${p}" -q -z conv,tcp 2>/dev/null | head -25`, { tolerateFail: true })));
      parts.push(section("HTTP requests", safeExec(`tshark -r "${p}" -Y http.request -T fields -e ip.dst -e http.host -e http.request.method -e http.request.uri 2>/dev/null | head -40`, { tolerateFail: true })));
      parts.push(section("DNS queries", safeExec(`tshark -r "${p}" -Y dns.flags.response==0 -T fields -e dns.qry.name 2>/dev/null | sort -u | head -40`, { tolerateFail: true })));
      if (args.filter) parts.push(section(`custom filter: ${args.filter}`, safeExec(`tshark -r "${p}" -Y '${String(args.filter).replace(/'/g, "")}' 2>/dev/null | head -40`, { tolerateFail: true })));
      const sweep = safeExec(`tshark -r "${p}" -T fields -e data.text -e text 2>/dev/null | strings | grep -iE 'flag\\{|ctf\\{|pass|user|login|token|authorization' | head -40`, { timeoutMs: 4e4, tolerateFail: true });
      parts.push(section("flag/credential sweep", sweep || "(nothing obvious \u2014 try `tshark -r file -q -z follow,tcp,ascii,<stream>` on interesting streams, and export HTTP/SMB objects)"));
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_crack_archive — password-cracking for zip/rar/7z/pdf via john.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_crack_archive",
    category: "forensics",
    description: "Crack the password of an encrypted zip/rar/7z/pdf using John the Ripper (*2john + wordlist or incremental). Ships with a small rockyou-style wordlist; pass a bigger one for real cracking. For your own/authorised challenge files only.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the encrypted archive/pdf" },
      wordlist: { type: "string", required: false, description: "Path to a wordlist (defaults to bundled common.txt)" }
    },
    execute(args) {
      const p = args.path;
      if (!fs5.existsSync(p)) return `File not found: ${p}`;
      if (!hasTool("john")) return "john (John the Ripper) not installed (apt install john). Alternatively: fcrackzip -u -D -p wordlist file.zip";
      const ext = p.split(".").pop()?.toLowerCase();
      const twojohn = { zip: "zip2john", rar: "rar2john", "7z": "7z2john", pdf: "pdf2john" };
      const converter = twojohn[ext || ""] || `${ext}2john`;
      if (!hasTool(converter) && !hasTool(`${converter}.pl`)) return `${converter} not found. Install the john jumbo suite.`;
      const hashFile = `/tmp/ctf_${Date.now()}.hash`;
      const conv = safeExec(`${converter} "${p}" > "${hashFile}" 2>/dev/null; head -1 "${hashFile}"`, { tolerateFail: true });
      if (!fs5.existsSync(hashFile) || fs5.statSync(hashFile).size === 0) return `Could not extract hash with ${converter}.
${conv}`;
      const wl = args.wordlist || pluginFile("wordlists", "common.txt") || "";
      const wlArg = wl && fs5.existsSync(wl) ? `--wordlist="${wl}"` : "";
      const run = safeExec(`john ${wlArg} "${hashFile}" 2>&1 | tail -15; echo '--- cracked ---'; john --show "${hashFile}" 2>/dev/null`, { timeoutMs: 9e4, tolerateFail: true });
      safeExec(`rm -f "${hashFile}"`);
      return section("john", run);
    }
  })
];

// src/tools/binary.ts
var fs6 = __toESM(require("fs"));
var path3 = __toESM(require("path"));
var binaryTools = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_reverse — triage a binary for reversing.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_reverse",
    category: "reverse",
    description: "Triage a binary for reverse engineering: file/arch, checksec protections, symbols & imports, interesting strings (flag/password/system), packer detection (UPX), and an r2 function list + main disassembly if radare2 is present. Detects Python (.pyc) and .NET too. Use on ELF/PE/Mach-O reversing challenges.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the binary" }
    },
    execute(args) {
      const p = args.path;
      if (!fs6.existsSync(p)) return `File not found: ${p}`;
      const ft = safeExec(`file "${p}"`, { tolerateFail: true });
      const parts = [section("file", ft)];
      const low = ft.toLowerCase();
      if (/python .* byte-compiled|\.pyc/.test(low) || p.endsWith(".pyc")) {
        parts.push(section("Python bytecode", "Decompile with: `pip install decompyle3 uncompyle6` then `decompyle3 file.pyc`, or use pycdc. If magic header is stripped, prepend the correct magic for the Python version."));
      }
      if (/\.net|mono|assembly/.test(low)) {
        parts.push(section(".NET assembly", "Decompile with ILSpy / dnSpy / `ilspycmd file.dll`. Look for hardcoded strings and the key-check method."));
      }
      if (hasTool("checksec")) parts.push(section("checksec", safeExec(`checksec --file="${p}" 2>&1`, { tolerateFail: true })));
      else parts.push(section("checksec", "not installed (pip install pwntools gives checksec, or apt install checksec)"));
      parts.push(section("symbols (nm, first 40)", safeExec(`nm "${p}" 2>/dev/null | head -40 || echo '(stripped or no symbols)'`, { tolerateFail: true })));
      parts.push(section("imports (objdump -T / dynamic)", safeExec(`objdump -T "${p}" 2>/dev/null | head -30 || echo '(none)'`, { tolerateFail: true })));
      parts.push(section("interesting strings", safeExec(`strings -n 5 "${p}" | grep -iE 'flag|pass|secret|key|system|/bin/sh|cat |token|admin' | head -40`, { tolerateFail: true }) || "(none)"));
      const upx = safeExec(`strings "${p}" | grep -i UPX! | head -1`, { tolerateFail: true });
      if (upx.trim()) parts.push(section("packer", `Looks UPX-packed. Unpack: \`upx -d "${p}" -o unpacked\``));
      if (hasTool("r2") || hasTool("radare2")) {
        const r2 = hasTool("r2") ? "r2" : "radare2";
        parts.push(section("r2 functions (aflq)", safeExec(`${r2} -q -c 'aaa; aflq' "${p}" 2>/dev/null | head -50`, { timeoutMs: 4e4, tolerateFail: true })));
        parts.push(section("r2 main disasm", safeExec(`${r2} -q -c 'aaa; pdf @ main' "${p}" 2>/dev/null | head -80`, { timeoutMs: 4e4, tolerateFail: true })));
      } else {
        parts.push(section("disassembly", 'radare2 not installed. Use Ghidra (headless: analyzeHeadless), or `objdump -d -M intel file | less`. For a quick look: `gdb -batch -ex "disassemble main" file`.'));
      }
      const miss = missingTools(["checksec", "r2", "objdump", "nm"]);
      if (miss.length) parts.push(section("missing tools", miss.join(", ")));
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_pwn_recon — exploitation recon.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_pwn_recon",
    category: "pwn",
    description: "Binary-exploitation recon: checksec, GOT/PLT entries, useful ROP gadgets (ROPgadget/ropper: pop rdi, ret, syscall, /bin/sh), one_gadget RCE offsets if a libc is given, and libc version identification. Use on pwn binaries before writing an exploit.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the vulnerable binary" },
      libc: { type: "string", required: false, description: "Path to the provided libc.so (enables one_gadget + version id)" }
    },
    execute(args) {
      const p = args.path;
      if (!fs6.existsSync(p)) return `File not found: ${p}`;
      const parts = [];
      if (hasTool("checksec")) parts.push(section("checksec", safeExec(`checksec --file="${p}" 2>&1`, { tolerateFail: true })));
      parts.push(section("GOT/PLT", safeExec(`objdump -R "${p}" 2>/dev/null | head -30 || echo '(no relocations / static)'`, { tolerateFail: true })));
      if (hasTool("ROPgadget")) {
        const g = safeExec(`ROPgadget --binary "${p}" 2>/dev/null`, { timeoutMs: 4e4, tolerateFail: true });
        const want = ["pop rdi ; ret", "pop rsi ; ret", "pop rdx ; ret", ": ret", "syscall", "/bin/sh"];
        const picked = g.split("\n").filter((l) => want.some((w) => l.includes(w))).slice(0, 40);
        parts.push(section("ROP gadgets (key)", picked.join("\n") || "(none of the usual gadgets found \u2014 dump all with `ROPgadget --binary file`)"));
      } else if (hasTool("ropper")) {
        parts.push(section("ropper", safeExec(`ropper --file "${p}" --search "pop rdi" 2>/dev/null | head -20`, { timeoutMs: 4e4, tolerateFail: true })));
      } else {
        parts.push(section("ROP", "ROPgadget/ropper not installed (pip install ropgadget ropper)."));
      }
      if (args.libc && fs6.existsSync(args.libc)) {
        parts.push(section("libc version", safeExec(`strings "${args.libc}" | grep -iE 'glibc|GNU C Library' | head -3`, { tolerateFail: true })));
        if (hasTool("one_gadget")) parts.push(section("one_gadget", safeExec(`one_gadget "${args.libc}" 2>/dev/null | head -40`, { timeoutMs: 4e4, tolerateFail: true })));
        else parts.push(section("one_gadget", 'not installed (gem install one_gadget) \u2014 gives magic execve("/bin/sh") offsets.'));
        parts.push(section("libc offsets hint", "Leak a libc symbol (e.g. puts@GOT), then use https://libc.rip or `libc-database` to identify, and compute base = leak - libc.sym[name]."));
      }
      return parts.join("\n\n");
    }
  }),
  /* ----------------------------------------------------------------
   * ctf_pwn_template — generate a pwntools exploit skeleton file.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: "ctf_pwn_template",
    category: "pwn",
    description: "Generate a ready-to-edit pwntools exploit skeleton (local/remote toggle, libc loading, ROP helpers, send/recv wrappers, GDB script) and write it to a file. Use to start a pwn exploit quickly.",
    parameters: {
      binary: { type: "string", required: false, description: "Binary name/path (default ./chall)" },
      host: { type: "string", required: false, description: "Remote host" },
      port: { type: "number", required: false, description: "Remote port" },
      libc: { type: "string", required: false, description: "libc path to load" },
      out: { type: "string", required: false, description: "Output path (default ./exploit.py)" }
    },
    execute(args) {
      const bin = args.binary || "./chall";
      const host = args.host || "HOST";
      const port = args.port || 1337;
      const libc = args.libc || "";
      const out = args.out || path3.join(ctx?.bash?.cwd || process.cwd(), "exploit.py");
      const tpl = pwntoolsTemplate(bin, host, String(port), libc);
      try {
        fs6.writeFileSync(out, tpl, "utf-8");
        fs6.chmodSync(out, 493);
      } catch (e) {
        return `Could not write ${out}: ${e.message}

${cap(tpl, 6e3)}`;
      }
      return `Exploit skeleton written to ${out}

${cap(tpl, 4e3)}`;
    }
  })
];
function pwntoolsTemplate(bin, host, port, libc) {
  const libcLine = libc ? `libc = ELF("${libc}", checksec=False)` : `libc = exe.libc`;
  return `#!/usr/bin/env python3
from pwn import *

exe = context.binary = ELF("${bin}", checksec=False)
${libcLine}
context.terminal = ["tmux", "splitw", "-h"]

HOST, PORT = "${host}", ${port}

gdbscript = """
# break *main
# break *0x401234
continue
"""

def start():
    if args.REMOTE:
        return remote(HOST, PORT)
    if args.GDB:
        return gdb.debug([exe.path], gdbscript=gdbscript)
    return process([exe.path])

# --- helpers ---
def send_payload(io, payload):
    io.sendlineafter(b">", payload)  # adjust the prompt

io = start()

# === recon notes ===
# checksec: run ctf_pwn_recon first.
# offset to RIP: cyclic(200) -> crash -> cyclic_find(leak)
offset = 40

rop = ROP(exe)
# Example: leak libc via puts(puts@got), return to main, then one_gadget / system("/bin/sh")
# rop.raw(rop.find_gadget(["ret"]))       # stack align
# rop.puts(exe.got["puts"])
# rop.call(exe.sym["main"])

payload  = flat({
    offset: [
        # rop.chain(),
    ]
})

# send_payload(io, payload)
# io.recvline()
# leak = u64(io.recvline().strip().ljust(8, b"\\x00"))
# libc.address = leak - libc.sym["puts"]
# log.success(f"libc base: {hex(libc.address)}")

io.interactive()
`;
}

// src/tools/net.ts
var netTools = (ctx) => [
  textTool(ctx, {
    name: "ctf_nc",
    category: "misc",
    description: "Talk to a remote CTF service (nc host port). Connects, reads the banner/prompt, optionally sends a sequence of lines (separated by \\n), captures the full transcript and scans it for flags. Use for pwn/misc/crypto/PPC services where you just need to interact. For complex scripted loops, generate a pwntools script with ctf_pwn_template instead. Authorised challenge services only.",
    parameters: {
      host: { type: "string", required: true, description: "Service host" },
      port: { type: "number", required: true, description: "Service port" },
      send: { type: "string", required: false, description: "Lines to send, separated by \\n (each gets a newline). Omit to just read the banner." },
      wait: { type: "number", required: false, description: "Seconds to wait for each response (default 0.4)" },
      timeout: { type: "number", required: false, description: "Socket timeout seconds (default 8)" }
    },
    execute(args) {
      const a = ["--host", String(args.host), "--port", String(args.port)];
      if (args.send) a.push("--send", String(args.send));
      if (args.wait) a.push("--wait", String(args.wait));
      if (args.timeout) a.push("--timeout", String(args.timeout));
      const out = runPyHelper("netcat.py", a, { timeoutMs: Math.min((+args.timeout || 8) * 1e3 + 15e3, 6e4) });
      return out || "(no response)";
    }
  })
];

// src/tools/extra.ts
var fs7 = __toESM(require("fs"));
var extraTools = (ctx) => [
  /* ---------------- AES / block cipher ---------------- */
  textTool(ctx, {
    name: "ctf_crypto_aes",
    category: "crypto",
    description: "AES / block-cipher helper: detect ECB (repeated blocks), raw encrypt/decrypt (ECB/CBC/CTR with key+iv), and CBC bit-flip editing. Use for symmetric-crypto challenges. For padding/ECB oracles, script the oracle with ctf_run (the ctf-crypto skill explains).",
    parameters: {
      op: { type: "string", required: true, description: "detect | enc | dec | flip" },
      data: { type: "string", required: true, description: "Ciphertext/plaintext as hex (or base64 with b64=true)" },
      b64: { type: "boolean", required: false, description: "Input is base64" },
      key: { type: "string", required: false, description: "Key (hex 0x.. or ascii)" },
      iv: { type: "string", required: false, description: "IV (hex or ascii)" },
      mode: { type: "string", required: false, description: "ecb | cbc | ctr (default cbc)" },
      block: { type: "number", required: false, description: "flip: target plaintext block index" },
      pos: { type: "number", required: false, description: "flip: byte position in block" },
      old: { type: "string", required: false, description: "flip: known current plaintext byte (hex)" },
      new: { type: "string", required: false, description: "flip: desired plaintext byte (hex)" }
    },
    execute(args) {
      const a = [String(args.op), "--data", String(args.data)];
      if (args.b64) a.push("--b64");
      if (args.key) a.push("--key", String(args.key));
      if (args.iv) a.push("--iv", String(args.iv));
      if (args.mode) a.push("--mode", String(args.mode));
      if (args.block != null) a.push("--block", String(args.block));
      if (args.pos != null) a.push("--pos", String(args.pos));
      if (args.old) a.push("--old", String(args.old));
      if (args.new) a.push("--new", String(args.new));
      return runPyHelper("aes_tools.py", a, { timeoutMs: 2e4 });
    }
  }),
  /* ---------------- hash cracking ---------------- */
  textTool(ctx, {
    name: "ctf_crack_hash",
    category: "crypto",
    description: "Identify and crack a password hash. Detects the type, then runs hashcat (preferred) or John with a wordlist (bundled common.txt, or pass a bigger one like rockyou). Returns the plaintext if cracked. For authorised challenges only.",
    parameters: {
      hash: { type: "string", required: true, description: "The hash (or a path to a file of hashes with is_file)" },
      is_file: { type: "boolean", required: false, description: "Treat hash as a path to a hash file" },
      wordlist: { type: "string", required: false, description: "Wordlist path (defaults to bundled common.txt; use rockyou for real cracking)" },
      mode: { type: "string", required: false, description: "Explicit hashcat -m mode (skips auto-detect)" }
    },
    execute(args) {
      const idOut = runPyHelper("hash_id.py", [String(args.hash)]);
      const wl = args.wordlist || pluginFile("wordlists", "common.txt") || "";
      if (!wl || !fs7.existsSync(wl)) return `${idOut}

[!] No wordlist available \u2014 pass wordlist=.`;
      const hashFile = args.is_file ? String(args.hash) : (() => {
        const f = `/tmp/ctfhash_${Date.now()}.txt`;
        fs7.writeFileSync(f, String(args.hash).trim() + "\n");
        return f;
      })();
      let crackOut = "";
      if (hasTool("hashcat") && args.mode) {
        crackOut = safeExec(`hashcat -m ${args.mode} -a 0 "${hashFile}" "${wl}" --quiet --potfile-disable 2>&1 | tail -10; echo '--- show ---'; hashcat -m ${args.mode} --show "${hashFile}" "${wl}" 2>/dev/null`, { timeoutMs: 9e4, tolerateFail: true });
      } else if (hasTool("john")) {
        crackOut = safeExec(`john --wordlist="${wl}" "${hashFile}" 2>&1 | tail -10; echo '--- cracked ---'; john --show "${hashFile}" 2>/dev/null`, { timeoutMs: 9e4, tolerateFail: true });
      } else {
        crackOut = "Neither hashcat nor john installed. Install one; or try https://crackstation.net for common hashes.";
      }
      if (!args.is_file) safeExec(`rm -f "${hashFile}"`);
      return `${section("identify", idOut)}

${section("crack", crackOut)}`;
    }
  }),
  /* ---------------- QR / barcode ---------------- */
  textTool(ctx, {
    name: "ctf_qr",
    category: "misc",
    description: "Decode QR codes and barcodes from an image with zbarimg, and scan the decoded payload for flags. Use when a challenge image contains a QR/barcode.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the image" }
    },
    execute(args) {
      const p = args.path;
      if (!fs7.existsSync(p)) return `File not found: ${p}`;
      if (!hasTool("zbarimg")) return "zbarimg not installed (apt install zbar-tools). Online: zxing.org, or python `pyzbar`.";
      const out = safeExec(`zbarimg -q --raw "${p}" 2>&1`, { tolerateFail: true });
      return out.trim() ? section("decoded", out) : "No QR/barcode detected. Try cleaning/thresholding the image first, or it may be a partial/damaged code to reconstruct.";
    }
  }),
  /* ---------------- USB HID from pcap ---------------- */
  textTool(ctx, {
    name: "ctf_pcap_usb",
    category: "forensics",
    description: "Decode USB HID keyboard keystrokes from a pcap/pcapng into the typed text (handles shift & backspace) and scans for a flag. Use for USB-capture forensics challenges.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the USB capture (.pcap/.pcapng)" }
    },
    execute(args) {
      if (!fs7.existsSync(args.path)) return `File not found: ${args.path}`;
      if (!hasTool("tshark")) return "tshark not installed (apt install tshark).";
      return runPyHelper("usb_hid.py", [String(args.path)], { timeoutMs: 6e4 });
    }
  }),
  /* ---------------- memory forensics ---------------- */
  textTool(ctx, {
    name: "ctf_memory",
    category: "forensics",
    description: "Memory-image forensics with Volatility 3. Runs a plugin (default: triage set \u2014 pslist, cmdline). Pass plugin= for a specific one (windows.filescan, windows.hashdump, windows.netscan, linux.bash, etc.). Use for RAM-dump challenges.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the memory image" },
      plugin: { type: "string", required: false, description: "Volatility3 plugin, e.g. windows.pslist (default runs pslist + cmdline)" },
      args: { type: "string", required: false, description: 'Extra args for the plugin, e.g. "--pid 1234"' }
    },
    execute(args) {
      const p = args.path;
      if (!fs7.existsSync(p)) return `File not found: ${p}`;
      const vol = hasTool("vol") ? "vol" : hasTool("vol.py") ? "vol.py" : hasTool("volatility3") ? "volatility3" : "";
      if (!vol) return "Volatility3 not installed (pipx install volatility3, then `vol`). For Volatility2 use `ctf_run`.";
      const extra = args.args ? ` ${args.args}` : "";
      if (args.plugin) {
        return section(String(args.plugin), safeExec(`${vol} -f "${p}" ${args.plugin}${extra} 2>&1 | head -120`, { timeoutMs: 12e4, tolerateFail: true }));
      }
      const ps = safeExec(`${vol} -f "${p}" windows.pslist 2>&1 | head -60`, { timeoutMs: 12e4, tolerateFail: true });
      const cl = safeExec(`${vol} -f "${p}" windows.cmdline 2>&1 | head -60`, { timeoutMs: 12e4, tolerateFail: true });
      return `${section("windows.pslist", ps)}

${section("windows.cmdline", cl)}

Next: windows.filescan + dumpfiles, windows.hashdump, windows.netscan, or linux.* for Linux dumps.`;
    }
  }),
  /* ---------------- python jail ---------------- */
  textTool(ctx, {
    name: "ctf_pyjail",
    category: "misc",
    description: "Generate Python-jail escape payloads that avoid a given blacklist, plus char-construction helpers to rebuild banned words. Use for pyjail / sandbox-escape challenges.",
    parameters: {
      blacklist: { type: "string", required: false, description: 'Banned substrings, comma/space separated (e.g. "import,os,eval,exec")' },
      goal: { type: "string", required: false, description: "shell | read | rce (default shell)" },
      encode: { type: "string", required: false, description: 'Instead: show how to build this string without letters, e.g. "os"' }
    },
    execute(args) {
      const a = [];
      if (args.encode) a.push("--encode", String(args.encode));
      else {
        if (args.blacklist) a.push("--blacklist", String(args.blacklist));
        if (args.goal) a.push("--goal", String(args.goal));
      }
      return runPyHelper("pyjail_gen.py", a, { timeoutMs: 15e3 });
    }
  }),
  /* ---------------- targeted disassembly ---------------- */
  textTool(ctx, {
    name: "ctf_disasm",
    category: "reverse",
    description: "Disassemble a specific function or address in a binary (radare2 if present, else objdump). Use to read one routine (e.g. the key check) without dumping the whole binary.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the binary" },
      target: { type: "string", required: false, description: "Symbol (e.g. main) or address (0x401234). Default: main" }
    },
    execute(args) {
      const p = args.path;
      if (!fs7.existsSync(p)) return `File not found: ${p}`;
      const target = args.target ? String(args.target) : "main";
      if (hasTool("r2") || hasTool("radare2")) {
        const r2 = hasTool("r2") ? "r2" : "radare2";
        const at = /^0x/.test(target) ? `@ ${target}` : `@ sym.${target}`;
        const out = safeExec(`${r2} -q -c 'aaa; pdf ${at}' "${p}" 2>/dev/null | head -150`, { timeoutMs: 4e4, tolerateFail: true });
        if (out.trim()) return section(`r2 pdf ${target}`, out);
      }
      const dump = safeExec(`objdump -d -M intel "${p}" 2>/dev/null | awk '/<${target}>:/{f=1} f{print} f&&/^$/{exit}' | head -150`, { timeoutMs: 3e4, tolerateFail: true });
      return dump.trim() ? section(`objdump ${target}`, dump) : `Could not disassemble ${target}. Try an address, or install radare2.`;
    }
  }),
  /* ---------------- bit-plane export ---------------- */
  textTool(ctx, {
    name: "ctf_stego_planes",
    category: "forensics",
    description: "Export each colour channel bit-plane of an image to black/white PNGs (StegSolve-style) for visual inspection, and scan any that decode as QR. Use when LSB tools find nothing but the flag may be drawn in a bit plane.",
    parameters: {
      path: { type: "string", required: true, description: "Path to the image" },
      outdir: { type: "string", required: false, description: "Output directory (default <image>_planes)" },
      planes: { type: "string", required: false, description: "Comma list of bit indices to export (default 0,1,2,7)" }
    },
    execute(args) {
      const p = args.path;
      if (!fs7.existsSync(p)) return `File not found: ${p}`;
      const a = [p];
      if (args.outdir) a.push(String(args.outdir));
      if (args.planes) a.push(`--planes=${args.planes}`);
      const out = runPyHelper("stego_planes.py", a, { timeoutMs: 4e4 });
      let qr = "";
      const dir = args.outdir || p.replace(/\.[^.]+$/, "") + "_planes";
      if (hasTool("zbarimg") && fs7.existsSync(dir)) {
        const scan = safeExec(`for f in "${dir}"/plane_*_bit0.png; do zbarimg -q --raw "$f" 2>/dev/null; done`, { tolerateFail: true });
        if (scan.trim()) qr = "\n\n" + section("QR in planes", scan);
      }
      return out + qr;
    }
  })
];

// src/index.ts
var name = "ctf-pro-tools";
var inject = ["tools", "bash"];
var FACTORIES = [
  ["solve", solveTools],
  ["universal", universalTools],
  ["crypto", cryptoTools],
  ["web", webTools],
  ["forensics", forensicsTools],
  ["binary", binaryTools],
  ["net", netTools],
  ["submit", submitTools],
  ["extra", extraTools]
];
function apply(ctx) {
  let count = 0;
  for (const [group, factory] of FACTORIES) {
    let tools = [];
    try {
      tools = factory(ctx);
    } catch (e) {
      ctx.logger?.warn?.(`[ctf-pro] failed to build "${group}" tools: ${e?.message || e}`);
      continue;
    }
    for (const tool of tools) {
      try {
        ctx.tools.register(tool);
        count++;
      } catch (e) {
        ctx.logger?.warn?.(`[ctf-pro] failed to register a tool in "${group}": ${e?.message || e}`);
      }
    }
  }
  ctx.logger?.info?.(`[ctf-pro] loaded ${count} CTF tools across ${FACTORIES.length} categories`);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  inject,
  name
});
