declare module 'bidi-js' {
  const bidiFactory: () => {
    getReorderedString: (
      text: string,
      embeddingLevels: { levels: Uint8Array },
      start?: number,
      end?: number,
    ) => string
    getEmbeddingLevels: (
      text: string,
      direction?: 'ltr' | 'rtl' | 'auto',
    ) => { levels: Uint8Array; paragraphs: Array<{ start: number; end: number; level: number }> }
  }
  export default bidiFactory
}

declare module 'stack-utils' {
  interface StackUtilsOptions {
    cwd?: string
    internals?: RegExp[]
    wrapCallSite?: (callSite: NodeJS.CallSite) => NodeJS.CallSite
  }

  interface CallSiteLike {
    file?: string
    line?: number
    column?: number
    function?: string
    method?: string
    evalOrigin?: string
    native?: boolean
    typeName?: string
    methodName?: string
    functionName?: string
    fileName?: string
    lineNumber?: number
    columnNumber?: number
    source?: string
  }

  class StackUtils {
    constructor(options?: StackUtilsOptions)
    static nodeInternals(): RegExp[]
    clean(stack: string | string[]): string
    parse(stack: string | Error): CallSiteLike[]
    parseLine(line: string): CallSiteLike | null
    at(fn?: Function): CallSiteLike
    capture(limit?: number, fn?: Function): CallSiteLike[]
  }

  export = StackUtils
}

declare module 'semver' {
  export function satisfies(version: string, range: string): boolean
  export function valid(version: string | null): string | null
  export function coerce(version: string | null): { version: string } | null
  export function gte(v1: string, v2: string): boolean
  export function lte(v1: string, v2: string): boolean
  export function gt(v1: string, v2: string): boolean
  export function lt(v1: string, v2: string): boolean
}
