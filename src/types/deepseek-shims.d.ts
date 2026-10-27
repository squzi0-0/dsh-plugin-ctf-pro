/**
 * Minimal ambient declarations so the plugin type-checks / bundles standalone.
 * At runtime DSH provides the real @deepseek-ai/cordis and @deepseek-ai/dsh-tools.
 * These shims are intentionally loose and are NOT bundled into lib/.
 */
declare module '@deepseek-ai/cordis' {
  export interface Logger {
    info?(...args: any[]): void
    warn?(...args: any[]): void
    error?(...args: any[]): void
  }
  export interface Context {
    logger?: Logger
    tools: { register(tool: any): void }
    bash?: { cwd?: string }
    [key: string]: any
  }
}

declare module '@deepseek-ai/dsh-tools' {
  export function defineTool(def: any): any
}
