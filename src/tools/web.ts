import { textTool, ToolFactory } from '../util/tool'
import { safeExec, hasTool, section, pluginFile, runPyHelper } from '../util'
import * as fs from 'fs'

export const webTools: ToolFactory = (ctx) => [
  /* ----------------------------------------------------------------
   * ctf_web_probe — recon on a single URL.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_web_probe',
    category: 'web',
    description:
      'Recon a target URL (authorised challenges only): response headers, title, server/tech fingerprint, cookies & security headers, robots/sitemap, and a check for common source-leak paths (.git/HEAD, .env, backups, .DS_Store, swagger). Flags leaks worth pursuing.',
    parameters: {
      url: { type: 'string', required: true, description: 'Target URL (http/https)' },
    },
    execute(args) {
      const base = String(args.url).replace(/\/$/, '')
      const parts: string[] = []
      const head = safeExec(`curl -sSikL "${base}" --max-time 10 -o /dev/null -D - 2>&1 | head -40`, { tolerateFail: true })
      parts.push(section('response headers (follow redirects)', head))
      const title = safeExec(`curl -sSL "${base}" --max-time 10 | grep -oiP '(?<=<title>).*?(?=</title>)' | head -1`, { tolerateFail: true })
      parts.push(section('title', title || '(none)'))
      // security headers quick read
      const sec = safeExec(`curl -sSI "${base}" --max-time 10 | grep -iE 'content-security-policy|x-frame|x-powered-by|server:|set-cookie|x-content-type' | head -20`, { tolerateFail: true })
      parts.push(section('server / cookies / security headers', sec || '(none notable)'))
      // source-leak probes
      const probes = ['/robots.txt', '/sitemap.xml', '/.git/HEAD', '/.git/config', '/.env', '/.svn/entries', '/.DS_Store', '/backup.zip', '/www.zip', '/source.zip', '/config.php.bak', '/index.php.bak', '/swagger.json', '/api/swagger.json', '/.htaccess', '/admin', '/flag', '/flag.txt']
      const leakLines: string[] = []
      for (const pth of probes) {
        const code = safeExec(`curl -s -o /dev/null -w "%{http_code} %{size_download}" "${base}${pth}" --max-time 6`, { tolerateFail: true }).trim()
        const status = code.split(' ')[0]
        if (status && status !== '404' && status !== '000') leakLines.push(`${pth} -> HTTP ${code}`)
      }
      parts.push(section('path probes (non-404)', leakLines.length ? leakLines.join('\n') + '\n\n⚠ If /.git/HEAD is 200, dump it: `git-dumper ' + base + '/.git/ out` (or wget -r the .git dir then `git checkout .`).' : '(all 404)'))
      return parts.join('\n\n')
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_web_fuzz — directory / content discovery.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_web_fuzz',
    category: 'web',
    description:
      'Content discovery against a URL using ffuf or gobuster (whichever is installed), with a bundled wordlist by default. Use FUZZ as the placeholder for custom fuzzing (paths, params, subdomains/vhosts via Host header). Authorised targets only.',
    parameters: {
      url: { type: 'string', required: true, description: 'URL with optional FUZZ marker, e.g. https://host/FUZZ or https://host/?x=FUZZ' },
      wordlist: { type: 'string', required: false, description: 'Wordlist path (defaults to bundled dirs.txt)' },
      extensions: { type: 'string', required: false, description: 'Comma list of extensions, e.g. php,txt,bak' },
      mode: { type: 'string', required: false, description: 'dir (default) | vhost' },
    },
    execute(args) {
      let url = String(args.url)
      if (!/FUZZ/.test(url) && String(args.mode) !== 'vhost') url = url.replace(/\/$/, '') + '/FUZZ'
      const wl = args.wordlist || pluginFile('wordlists', 'dirs.txt') || '/usr/share/wordlists/dirb/common.txt'
      if (!fs.existsSync(wl)) return `Wordlist not found: ${wl}. Pass wordlist= explicitly.`
      const ext = args.extensions ? String(args.extensions) : ''
      if (hasTool('ffuf')) {
        if (String(args.mode) === 'vhost') {
          const host = url.replace(/^https?:\/\//, '').split('/')[0]
          return section('ffuf (vhost)', safeExec(`ffuf -u "${url}" -H "Host: FUZZ.${host}" -w "${wl}" -mc 200,204,301,302,307,401,403 -fs 0 -s 2>/dev/null | head -60`, { timeoutMs: 90000, tolerateFail: true }))
        }
        const extArg = ext ? `-e ${ext.split(',').map((x) => (x.startsWith('.') ? x : '.' + x)).join(',')}` : ''
        return section('ffuf', safeExec(`ffuf -u "${url}" -w "${wl}" ${extArg} -mc 200,204,301,302,307,401,403 -s 2>/dev/null | head -60`, { timeoutMs: 90000, tolerateFail: true }))
      }
      if (hasTool('gobuster')) {
        const extArg = ext ? `-x ${ext}` : ''
        const target = url.replace(/\/FUZZ$/, '')
        return section('gobuster', safeExec(`gobuster dir -u "${target}" -w "${wl}" ${extArg} -q -s '200,204,301,302,307,401,403' -b '' 2>/dev/null | head -60`, { timeoutMs: 90000, tolerateFail: true }))
      }
      return 'Neither ffuf nor gobuster installed. Install one (apt install ffuf) or fall back to: `for w in $(cat wl); do curl -s -o /dev/null -w "%{http_code} $w\\n" URL/$w; done | grep -v 404`'
    },
  }),

  /* ----------------------------------------------------------------
   * ctf_jwt — JWT decode & attacks.
   * ---------------------------------------------------------------- */
  textTool(ctx, {
    name: 'ctf_jwt',
    category: 'web',
    description:
      'Decode a JWT (header+payload), flag common vulns (alg=none, HS/RS confusion), and attempt a weak-secret crack with a bundled wordlist (HS256). Optionally forge a token: give a new payload and a known/guessed secret. For authorised challenges only.',
    parameters: {
      token: { type: 'string', required: true, description: 'The JWT' },
      secret: { type: 'string', required: false, description: 'Secret to sign a forged token with (enables forge mode)' },
      forge_payload: { type: 'string', required: false, description: 'JSON payload to forge (e.g. {"user":"admin"})' },
    },
    execute(args) {
      const a = ['--token', String(args.token)]
      const wl = pluginFile('wordlists', 'jwt_secrets.txt')
      if (wl) a.push('--wordlist', wl)
      if (args.secret) a.push('--secret', String(args.secret))
      if (args.forge_payload) a.push('--forge', String(args.forge_payload))
      return runPyHelper('jwt_tool.py', a, { timeoutMs: 30000 })
    },
  }),
]
