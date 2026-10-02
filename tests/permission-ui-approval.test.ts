import { PassThrough, Writable } from "node:stream";
import { Terminal } from "@xterm/headless";
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Agent } from "../packages/agent/src/agent";
import { createPermissionHandler } from "../packages/agent/src/permission";
import { MockProvider } from "../packages/agent/src/providers/mock";
import type {
  PermissionConfig,
  PermissionHandler,
  PermissionResult,
  StreamChunk,
  ToolDefinition,
} from "../packages/agent/src/types";
import { renderSync } from "../packages/ink-renderer/src/index";
import { AgentREPL } from "../packages/ui/src/agent/AgentREPL";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const prompt = "Ready for another request";
const permissionLabel = "Yes, allow this action";
const terminals: Array<ReturnType<typeof terminal>> = [];
function terminal(agent: Agent) {
  const screen = new Terminal({ cols: 70, rows: 30, allowProposedApi: true });
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode() {},
    ref() {},
    unref() {},
  });
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        screen.write(chunk.toString(), callback);
      },
    }),
    { isTTY: true, columns: 70, rows: 30 },
  );
  const node = (next: Agent) =>
    React.createElement(AgentREPL, { agent: next, placeholder: prompt });
  const instance = renderSync(node(agent), {
    stdin: stdin as never,
    stdout: stdout as never,
    stderr: stdout as never,
    patchConsole: false,
  });
  const result = {
    screen,
    stdin,
    stdout,
    instance,
    output: () =>
      Array.from(
        { length: screen.rows },
        (_, row) =>
          screen.buffer.active
            .getLine(screen.buffer.active.viewportY + row)
            ?.translateToString(true) ?? "",
      ).join("\n"),
    input: async (data: string) => {
      await act(async () => {
        stdin.write(data);
      });
    },
    replaceAgent: async (next: Agent) => {
      await act(async () => instance.rerender(node(next)));
    },
  };
  terminals.push(result);
  return result;
}

afterEach(async () => {
  for (const t of terminals.splice(0)) {
    await act(async () => t.instance.unmount());
    t.instance.cleanup();
    await vi.waitFor(() => expect(t.stdout.writableLength).toBe(0));
    t.screen.dispose();
    t.stdin.destroy();
    t.stdout.destroy();
  }
});

function configuredAgent(handler?: PermissionHandler) {
  const execute = vi.fn(async () => ({ content: "write completed" }));
  const tool: ToolDefinition = {
    name: "Write",
    description: "Write a test value",
    inputSchema: z.object({}),
    execute,
  };
  const responses: StreamChunk[][] = [];
  for (let run = 0; run < 4; run++) {
    responses.push(
      [
        { type: "tool_use_start", toolCall: { id: `write-${run}`, name: "Write" } },
        { type: "tool_use_delta", text: "{}" },
        { type: "tool_use_end" },
        { type: "done" },
      ],
      [{ type: "text", text: `finished run ${run}` }, { type: "done" }],
    );
  }
  return {
    agent: new Agent({
      model: "mock",
      tools: [tool],
      permissionHandler: handler,
      provider: new MockProvider(responses),
    }),
    execute,
  };
}

async function mount(agent: Agent) {
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(agent);
  });
  await vi.waitFor(() => expect(t.output()).toContain(prompt));
  return t;
}
async function submit(t: ReturnType<typeof terminal>, message: string) {
  await t.input(message);
  await t.input("\r");
}
async function expectPermission(t: ReturnType<typeof terminal>) {
  await vi.waitFor(() => expect(t.output()).toContain(permissionLabel));
}
async function expectPrompt(t: ReturnType<typeof terminal>, agent: Agent) {
  await act(async () => agent.waitForIdle());
  await vi.waitFor(() => {
    expect(t.output()).toContain("finished run");
    expect(t.output()).not.toContain(permissionLabel);
    expect(t.output()).not.toContain("Thinking...");
  });
}

describe("mounted AgentREPL permission decisions", () => {
  it("remembers always allow for subsequent runs with the same Agent", async () => {
    const policy = vi.fn(createPermissionHandler({}));
    const { agent, execute } = configuredAgent(policy);
    const t = await mount(agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input("a");
    await expectPrompt(t, agent);
    expect(execute).toHaveBeenCalledTimes(1);
    await submit(t, "second");
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    await expectPrompt(t, agent);
    expect(policy).toHaveBeenCalledTimes(2);
  });

  it("allows y once and asks again on the next run", async () => {
    const { agent, execute } = configuredAgent();
    const t = await mount(agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input("y");
    await expectPrompt(t, agent);
    expect(execute).toHaveBeenCalledTimes(1);
    await submit(t, "second");
    await expectPermission(t);
    expect(execute).toHaveBeenCalledTimes(1);
    await t.input("n");
    await expectPrompt(t, agent);
  });

  it.each(["n", "\x1b"])("denies with %j and leaves the prompt usable", async (key) => {
    const { agent, execute } = configuredAgent();
    const t = await mount(agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input(key);
    await expectPrompt(t, agent);
    expect(execute).not.toHaveBeenCalled();
    await submit(t, "second");
    await expectPermission(t);
    await t.input("y");
    await expectPrompt(t, agent);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([
    "alwaysDeny",
    "custom",
  ] as const)("preserves a later explicit %s denial after a session grant", async (kind) => {
    const config: PermissionConfig = {};
    const policy = vi.fn(createPermissionHandler(config));
    const { agent, execute } = configuredAgent(policy);
    const t = await mount(agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input("a");
    await expectPrompt(t, agent);
    if (kind === "alwaysDeny") config.alwaysDeny = ["Write"];
    else config.onPermission = async () => ({ decision: "deny", reason: "Policy changed" });
    await submit(t, "second");
    await expectPrompt(t, agent);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(policy).toHaveBeenCalledTimes(2);
    expect(agent.getMessages().some((message) => message.role === "tool" && message.isError)).toBe(
      true,
    );
  });

  it("clears session grants when the mounted Agent changes", async () => {
    const first = configuredAgent();
    const second = configuredAgent();
    const t = await mount(first.agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input("a");
    await expectPrompt(t, first.agent);
    await t.replaceAgent(second.agent);
    await submit(t, "second");
    await expectPermission(t);
    expect(second.execute).not.toHaveBeenCalled();
    await t.input("n");
    await expectPrompt(t, second.agent);
  });

  it.each([
    "\x01",
    "\x19",
    "\x1ba",
    "\x1b[97;9u",
  ])("does not approve a modified shortcut %j", async (key) => {
    const { agent, execute } = configuredAgent();
    const t = await mount(agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input(key);
    await expectPermission(t);
    expect(execute).not.toHaveBeenCalled();
    await t.input("n");
    await expectPrompt(t, agent);
  });

  it("cannot open search while a permission overlay is active", async () => {
    const { agent, execute } = configuredAgent();
    const t = await mount(agent);
    await submit(t, "first");
    await expectPermission(t);
    await t.input("\x06");
    await expectPermission(t);
    expect(t.output()).not.toContain("Search:");
    expect(execute).not.toHaveBeenCalled();
    await t.input("n");
    await expectPrompt(t, agent);
  });

  it("closes search before displaying a newly arrived permission overlay", async () => {
    let answer!: (result: PermissionResult) => void;
    const policy = vi.fn(
      () =>
        new Promise<PermissionResult>((resolve) => {
          answer = resolve;
        }),
    );
    const { agent, execute } = configuredAgent(policy);
    const t = await mount(agent);
    await submit(t, "first");
    await vi.waitFor(() => expect(policy).toHaveBeenCalledTimes(1));
    await t.input("\x06");
    await vi.waitFor(() => expect(t.output()).toContain("Search:"));
    await act(async () => {
      answer({ decision: "deny", approvalRequired: true });
    });
    await expectPermission(t);
    expect(t.output()).not.toContain("Search:");
    expect(execute).not.toHaveBeenCalled();
    await t.input("n");
    await expectPrompt(t, agent);
    await t.input("\x06");
    await vi.waitFor(() => expect(t.output()).toContain("Search:"));
    await t.input("\x1b");
    await vi.waitFor(() => expect(t.output()).toContain(prompt));
  });
});
