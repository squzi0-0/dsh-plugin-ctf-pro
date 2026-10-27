import { textTool, ToolFactory } from '../util/tool'
import { runPyHelper } from '../util'

/** Convenience used by ctf_solve's auto-submit. target = URL or host:port. */
export function submitFlag(target: string, flag: string): string {
  const a = ['--flag', flag]
  if (/^https?:\/\//i.test(target)) a.push('--url', target)
  else a.push('--nc', target)
  return runPyHelper('submit.py', a, { timeoutMs: 25000 })
}

export const submitTools: ToolFactory = (ctx) => [
  textTool(ctx, {
    name: 'ctf_submit',
    category: 'meta',
    description:
      'Submit a flag to a checker and report whether it was accepted. Supports CTFd-style HTTP (JSON or form POST, with cookies/CSRF headers and extra fields like challenge_id) and raw nc checkers (host:port). Authorised competition endpoints only.',
    parameters: {
      flag: { type: 'string', required: true, description: 'The flag to submit' },
      url: { type: 'string', required: false, description: 'HTTP submit endpoint (e.g. CTFd /api/v1/challenges/attempt)' },
      nc: { type: 'string', required: false, description: 'host:port of a netcat checker (alternative to url)' },
      field: { type: 'string', required: false, description: 'POST field name for the flag (default "submission"; CTFd uses "submission")' },
      json: { type: 'string', required: false, description: 'Extra JSON fields, e.g. {"challenge_id":5}' },
      headers: { type: 'string', required: false, description: 'Headers separated by ;; e.g. "Cookie: session=..;;CSRF-Token: .."' },
      form: { type: 'boolean', required: false, description: 'Send as urlencoded form instead of JSON' },
    },
    execute(args) {
      if (!args.url && !args.nc) return 'Provide either url= (HTTP) or nc= (host:port).'
      const a = ['--flag', String(args.flag), '--field', String(args.field || 'submission')]
      if (args.url) a.push('--url', String(args.url))
      if (args.nc) a.push('--nc', String(args.nc))
      if (args.json) a.push('--json', String(args.json))
      if (args.form) a.push('--form')
      if (args.headers) for (const h of String(args.headers).split(';;')) if (h.trim()) a.push('--header', h.trim())
      return runPyHelper('submit.py', a, { timeoutMs: 25000 })
    },
  }),
]
