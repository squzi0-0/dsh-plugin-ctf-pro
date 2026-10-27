import { defineTool } from '@deepseek-ai/dsh-tools'

/**
 * Thin wrapper so every tool in this plugin returns a plain string that is
 * rendered as text, without repeating the output/render boilerplate.
 *
 * `ctx` is whatever the plugin's apply() received; tools that need bash cwd,
 * logger, etc. read it from here.
 */
export interface ToolParam {
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  description: string
}

export interface TextToolDef<C = any> {
  name: string
  description: string
  category?: string
  parameters?: Record<string, ToolParam>
  execute: (args: any, ctx: C) => Promise<string> | string
}

export function textTool<C = any>(ctx: C, def: TextToolDef<C>) {
  return defineTool({
    name: def.name,
    description: def.description,
    parameters: def.parameters ?? {},
    output: {
      schema: { type: 'string' },
      render: (_args: any, value: string) => [{ type: 'text', text: value }],
    },
    async execute(args: any) {
      try {
        const r = await def.execute(args, ctx)
        return typeof r === 'string' ? r : JSON.stringify(r, null, 2)
      } catch (e: any) {
        return `[${def.name} failed] ${e?.message || e}`
      }
    },
  })
}

/** Factory signature every tool module exports: (ctx) => Tool[] */
export type ToolFactory = (ctx: any) => any[]
