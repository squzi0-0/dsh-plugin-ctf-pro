import type { Context } from '@deepseek-ai/cordis'
import { solveTools } from './tools/solve'
import { universalTools } from './tools/universal'
import { cryptoTools } from './tools/crypto'
import { webTools } from './tools/web'
import { forensicsTools } from './tools/forensics'
import { binaryTools } from './tools/binary'
import { netTools } from './tools/net'
import { submitTools } from './tools/submit'
import { extraTools } from './tools/extra'
import { ToolFactory } from './util/tool'

export const name = 'ctf-pro-tools'
export const inject = ['tools', 'bash']

const FACTORIES: Array<[string, ToolFactory]> = [
  ['solve', solveTools],
  ['universal', universalTools],
  ['crypto', cryptoTools],
  ['web', webTools],
  ['forensics', forensicsTools],
  ['binary', binaryTools],
  ['net', netTools],
  ['submit', submitTools],
  ['extra', extraTools],
]

export function apply(ctx: Context) {
  let count = 0
  for (const [group, factory] of FACTORIES) {
    let tools: any[] = []
    try {
      tools = factory(ctx)
    } catch (e: any) {
      ctx.logger?.warn?.(`[ctf-pro] failed to build "${group}" tools: ${e?.message || e}`)
      continue
    }
    for (const tool of tools) {
      try {
        ctx.tools.register(tool)
        count++
      } catch (e: any) {
        ctx.logger?.warn?.(`[ctf-pro] failed to register a tool in "${group}": ${e?.message || e}`)
      }
    }
  }
  ctx.logger?.info?.(`[ctf-pro] loaded ${count} CTF tools across ${FACTORIES.length} categories`)
}
