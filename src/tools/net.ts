import { textTool, ToolFactory } from '../util/tool'
import { runPyHelper, hasTool, safeExec } from '../util'

export const netTools: ToolFactory = (ctx) => [
  textTool(ctx, {
    name: 'ctf_nc',
    category: 'misc',
    description:
      'Talk to a remote CTF service (nc host port). Connects, reads the banner/prompt, optionally sends a sequence of lines (separated by \\n), captures the full transcript and scans it for flags. Use for pwn/misc/crypto/PPC services where you just need to interact. For complex scripted loops, generate a pwntools script with ctf_pwn_template instead. Authorised challenge services only.',
    parameters: {
      host: { type: 'string', required: true, description: 'Service host' },
      port: { type: 'number', required: true, description: 'Service port' },
      send: { type: 'string', required: false, description: 'Lines to send, separated by \\n (each gets a newline). Omit to just read the banner.' },
      wait: { type: 'number', required: false, description: 'Seconds to wait for each response (default 0.4)' },
      timeout: { type: 'number', required: false, description: 'Socket timeout seconds (default 8)' },
    },
    execute(args) {
      const a = ['--host', String(args.host), '--port', String(args.port)]
      if (args.send) a.push('--send', String(args.send))
      if (args.wait) a.push('--wait', String(args.wait))
      if (args.timeout) a.push('--timeout', String(args.timeout))
      const out = runPyHelper('netcat.py', a, { timeoutMs: Math.min((+args.timeout || 8) * 1000 + 15000, 60000) })
      return out || '(no response)'
    },
  }),
]
