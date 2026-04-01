type LogFn = (...args: unknown[]) => void

let debugLogger: LogFn = () => {}
let errorLogger: LogFn = console.error

export function logForDebugging(...args: unknown[]) { debugLogger(...args) }
export function logError(...args: unknown[]) { errorLogger(...args) }

export function configureLogger(opts: { debug?: LogFn; error?: LogFn }) {
  if (opts.debug) debugLogger = opts.debug
  if (opts.error) errorLogger = opts.error
}
