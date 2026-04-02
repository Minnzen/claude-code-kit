/**
 * execFile wrapper that never throws.
 * Simplified version using Node.js child_process directly.
 */

import { execFile as cpExecFile, type ExecFileOptions } from 'child_process'

type ExecResult = {
  stdout: string
  stderr: string
  code: number
  error?: string
}

export function execFileNoThrow(
  file: string,
  args: string[],
  options: {
    timeout?: number
    input?: string
    env?: NodeJS.ProcessEnv
    useCwd?: boolean
  } = {},
): Promise<ExecResult> {
  return new Promise(resolve => {
    const opts: ExecFileOptions & { encoding: 'utf8' } = {
      timeout: options.timeout ?? 600000,
      env: options.env,
      maxBuffer: 1_000_000,
      encoding: 'utf8',
    }

    const child = cpExecFile(file, args, opts, (error, stdout, stderr) => {
      if (error) {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code: error.code ? Number(error.code) : 1,
          error: error.message,
        })
      } else {
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          code: 0,
        })
      }
    })

    if (options.input && child.stdin) {
      child.stdin.write(options.input)
      child.stdin.end()
    }
  })
}
