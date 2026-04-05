import { z } from "zod";
import type { ToolDefinition, ToolContext, ToolResult } from "@claude-code-kit/agent";

const DEFAULT_TIMEOUT = 120_000;

export interface SubagentFactoryInput {
  task: string;
  description?: string;
  signal: AbortSignal;
}

export interface SubagentConfig {
  /**
   * Factory that creates a new Agent for each subagent invocation.
   * Receives an object with task, optional description, and AbortSignal.
   * The returned object must have a `chat(input: string): Promise<string>` method.
   */
  agentFactory: (input: SubagentFactoryInput) => { chat(input: string): Promise<string> };

  /** Timeout in milliseconds for the subagent execution. Default: 120_000 (2 minutes). */
  timeout?: number;
}

const inputSchema = z.object({
  task: z.string().describe("The task for the subagent to complete"),
  description: z.string().optional().describe("Optional additional context for the subagent"),
});

type Input = z.infer<typeof inputSchema>;

/**
 * Creates a subagent tool that spawns an independent Agent to handle a delegated task.
 *
 * The subagent runs with its own session (no shared message history with the parent)
 * and returns its final text response to the caller.
 */
export function createSubagentTool(config: SubagentConfig): ToolDefinition<Input> {
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;

  async function execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.abortSignal.aborted) {
      return { content: "Aborted before subagent started", isError: true };
    }

    const prompt = input.description
      ? `${input.task}\n\nAdditional context: ${input.description}`
      : input.task;

    // Child controller lets us propagate cancellation into the subagent
    const childController = new AbortController();

    let subagent: { chat(input: string): Promise<string> };
    try {
      subagent = config.agentFactory({
        task: input.task,
        description: input.description,
        signal: childController.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: `Failed to create subagent: ${msg}`, isError: true };
    }

    // Race the subagent against timeout and abort signal
    try {
      const result = await raceWithTimeoutAndAbort(
        subagent.chat(prompt),
        timeout,
        ctx.abortSignal,
      );
      return { content: result || "(subagent returned empty response)" };
    } catch (err: unknown) {
      // Abort the child so the subagent stops any in-flight work
      childController.abort();

      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "Subagent timed out" || msg === "Subagent aborted") {
        return { content: msg, isError: true };
      }
      return { content: `Subagent error: ${msg}`, isError: true };
    }
  }

  return {
    name: "Agent",
    description:
      "Spawn an independent subagent to complete a delegated task. " +
      "The subagent runs with its own context and returns the result. " +
      "Use this for tasks that can be completed independently.",
    inputSchema,
    execute,
    isReadOnly: false,
    isDestructive: false,
    requiresConfirmation: true,
    timeout,
  };
}

/**
 * Race a promise against a timeout and an AbortSignal.
 * Rejects with a descriptive error if the timeout or abort fires first.
 */
function raceWithTimeoutAndAbort<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const settle = () => {
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settle();
        reject(new Error("Subagent timed out"));
      }
    }, timeoutMs);

    const onAbort = () => {
      if (!settled) {
        settle();
        reject(new Error("Subagent aborted"));
      }
    };

    if (signal.aborted) {
      settled = true;
      clearTimeout(timer);
      reject(new Error("Subagent aborted"));
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        if (!settled) {
          settle();
          resolve(value);
        }
      },
      (err) => {
        if (!settled) {
          settle();
          reject(err);
        }
      },
    );
  });
}
