import { PassThrough, Writable } from "node:stream";
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Agent } from "../packages/agent/src/agent.ts";
import { createPermissionHandler } from "../packages/agent/src/permission.ts";
import { MockProvider } from "../packages/agent/src/providers/mock.ts";
import type {
  PermissionHandler,
  PermissionResult,
  ToolDefinition,
} from "../packages/agent/src/types.ts";
import { renderSync, Text } from "../packages/ink-renderer/src/index.ts";
import { type UseAgentResult, useAgent } from "../packages/ui/src/agent/useAgent.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: Array<{
  instance: ReturnType<typeof renderSync>;
  stdin: PassThrough;
  stdout: Writable;
}> = [];
afterEach(async () => {
  for (const surface of mounted.splice(0)) {
    await act(async () => surface.instance.unmount());
    surface.instance.cleanup();
    surface.stdin.destroy();
    surface.stdout.destroy();
  }
});

async function bridge(agent: Agent) {
  let state!: UseAgentResult;
  function Bridge() {
    state = useAgent({ agent });
    return React.createElement(Text, null, "bridge");
  }
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode() {},
    ref() {},
    unref() {},
  });
  const stdout = Object.assign(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    { isTTY: true, columns: 60, rows: 18 },
  );
  let instance!: ReturnType<typeof renderSync>;
  await act(async () => {
    instance = renderSync(React.createElement(Bridge), {
      stdin: stdin as never,
      stdout: stdout as never,
      stderr: stdout as never,
      patchConsole: false,
    });
  });
  mounted.push({ instance, stdin, stdout });
  return () => state;
}
function configuredAgent(handler?: PermissionHandler, isReadOnly = false) {
  const execute = vi.fn(async () => ({ content: "executed" }));
  const tool: ToolDefinition = {
    name: "Write",
    description: "Write",
    inputSchema: z.object({}),
    execute,
    isReadOnly,
  };
  const agent = new Agent({
    model: "mock",
    permissionHandler: handler,
    tools: [tool],
    provider: new MockProvider([
      [
        { type: "tool_use_start", toolCall: { id: "write", name: "Write" } },
        { type: "tool_use_delta", text: "{}" },
        { type: "tool_use_end" },
        { type: "done" },
      ],
      [{ type: "done" }],
    ]),
  });
  return { agent, execute };
}
async function submitAndApprovePrompt(getState: () => UseAgentResult) {
  let pending!: Promise<void>;
  let settled = false;
  await act(async () => {
    pending = getState().submit("write");
    void pending.then(() => {
      settled = true;
    });
  });
  await vi.waitFor(() => expect(settled || getState().permissionRequest !== null).toBe(true));
  const prompted = getState().permissionRequest !== null;
  await act(async () => {
    getState().permissionRequest?.resolve("allow");
    await pending;
  });
  return prompted;
}

describe("mounted UI preserves Agent permission policy", () => {
  it("cannot approve a tool protected by alwaysDeny", async () => {
    const { agent, execute } = configuredAgent(createPermissionHandler({ alwaysDeny: ["Write"] }));
    const prompted = await submitAndApprovePrompt(await bridge(agent));
    expect(execute).not.toHaveBeenCalled();
    expect(prompted).toBe(false);
  });

  it("preserves custom policy denials", async () => {
    const handler = vi.fn(async () => ({
      decision: "deny" as const,
      reason: "organization policy",
    }));
    const { agent, execute } = configuredAgent(handler);
    const prompted = await submitAndApprovePrompt(await bridge(agent));
    expect(handler).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(prompted).toBe(false);
  });

  it("keeps permitted read-only tools automatic", async () => {
    const { agent, execute } = configuredAgent(undefined, true);
    const prompted = await submitAndApprovePrompt(await bridge(agent));
    expect(execute).toHaveBeenCalledOnce();
    expect(prompted).toBe(false);
  });

  it("asks for default-denied writes and executes only after approval", async () => {
    const { agent, execute } = configuredAgent();
    const prompted = await submitAndApprovePrompt(await bridge(agent));
    expect(prompted).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("fails closed on invalid runtime policy decisions", async () => {
    const { agent, execute } = configuredAgent(async () => ({ decision: "ask" }) as never);
    const prompted = await submitAndApprovePrompt(await bridge(agent));
    expect(execute).not.toHaveBeenCalled();
    expect(prompted).toBe(false);
  });

  it("does not create a stale prompt when a policy answers after cancellation", async () => {
    let answer!: (result: PermissionResult) => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const { agent, execute } = configuredAgent(async () => {
      entered();
      return new Promise((resolve) => {
        answer = resolve;
      });
    });
    const state = await bridge(agent);
    let task!: Promise<void>;
    await act(async () => {
      task = state().submit("old");
    });
    await waiting;
    await act(async () => {
      await state().cancel();
      await task;
    });
    await act(async () => {
      answer({ decision: "deny", approvalRequired: true });
      await Promise.resolve();
    });
    expect(state().permissionRequest).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});
