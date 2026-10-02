import { PassThrough, Writable } from "node:stream";
import { Terminal } from "@xterm/headless";
import React, { act } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { renderSync, Text, useInput } from "../packages/ink-renderer/src/index";
import { type UseAgentResult, useAgent } from "../packages/ui/src/agent/useAgent";
import { REPL } from "../packages/ui/src/REPL";
import { VirtualList } from "../packages/ui/src/useVirtualScroll";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const terminals: Array<ReturnType<typeof terminal>> = [];
function terminal(node: React.ReactNode) {
  const screen = new Terminal({ cols: 60, rows: 18, scrollback: 100, allowProposedApi: true });
  const rawModes: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode: (value: boolean) => rawModes.push(value),
    ref() {},
    unref() {},
  });
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        screen.write(chunk.toString(), callback);
      },
    }),
    {
      isTTY: true,
      columns: 60,
      rows: 18,
    },
  );
  const instance = renderSync(node, {
    stdin: stdin as never,
    stdout: stdout as never,
    stderr: stdout as never,
    patchConsole: false,
  });
  const result = {
    stdin,
    stdout,
    rawModes,
    instance,
    screen,
    output: () =>
      Array.from(
        { length: screen.rows },
        (_, row) =>
          screen.buffer.active
            .getLine(screen.buffer.active.viewportY + row)
            ?.translateToString(true) ?? "",
      ).join("\n"),
    resize: async (columns: number, rows: number) => {
      screen.resize(columns, rows);
      await act(async () => {
        stdout.columns = columns;
        stdout.rows = rows;
        stdout.emit("resize");
      });
    },
    input: async (data: string) => {
      await act(async () => {
        stdin.write(data);
      });
    },
  };
  terminals.push(result);
  return result;
}
afterEach(async () => {
  for (const t of terminals.splice(0)) {
    await act(async () => {
      t.instance.unmount();
    });
    t.instance.cleanup();
    await vi.waitFor(() => expect(t.stdout.writableLength).toBe(0));
    t.screen.dispose();
    t.stdin.destroy();
    t.stdout.destroy();
  }
});

test("loading REPL handles Ctrl+C before the renderer default exit and releases raw mode", async () => {
  const cancel = vi.fn();
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(
      React.createElement(REPL, {
        messages: [],
        isLoading: true,
        onSubmit() {},
        onCancel: cancel,
      } as never),
    );
  });
  await t.input("\x03");
  expect(cancel).toHaveBeenCalledTimes(1);
  await act(async () => {
    t.instance.rerender(React.createElement(Text, null, "still mounted"));
  });
  await vi.waitFor(() => expect(t.output()).toContain("mounted"));
  await act(async () => {
    t.instance.unmount();
  });
  expect(t.rawModes.at(-1)).toBe(false);
  expect(t.stdin.listenerCount("readable")).toBe(0);
});

test("unclaimed Ctrl+C still exits a normal input component", async () => {
  function Input() {
    useInput(() => {});
    return React.createElement(Text, null, "ready");
  }
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(React.createElement(Input));
  });
  await t.input("\x03");
  await t.instance.waitUntilExit();
  expect(t.rawModes.at(-1)).toBe(false);
});

test("permission cancellation settles pending approval before allowing another submit and restores handler on unmount", async () => {
  const original = vi.fn(async () => ({ decision: "deny", approvalRequired: true }));
  let handler = original;
  let runCount = 0;
  let running: Promise<void> = Promise.resolve();
  let state!: UseAgentResult;
  const decisions: string[] = [];
  const agent = {
    getPermissionHandler: () => handler,
    setPermissionHandler(next: typeof handler) {
      handler = next;
    },
    abort() {},
    waitForIdle: () => Promise.resolve(),
    async cancel() {
      await running;
    },
    clearMessages: vi.fn(),
    async *run() {
      runCount++;
      let finish!: () => void;
      running = new Promise<void>((resolve) => {
        finish = resolve;
      });
      try {
        decisions.push(
          (await handler({ tool: "write", input: { text: "private" } } as never)).decision,
        );
        yield { type: "done" };
      } finally {
        finish();
      }
    },
  };
  function Bridge() {
    state = useAgent({ agent: agent as never });
    return React.createElement(Text, null, state.isLoading ? "busy" : "idle");
  }
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(React.createElement(Bridge));
  });
  let submit!: Promise<void>;
  await act(async () => {
    submit = state.submit("first") as never;
  });
  await vi.waitFor(() => expect(state.permissionRequest).not.toBeNull());
  await act(async () => {
    await state.cancel();
  });
  await submit;
  expect(decisions).toEqual(["deny"]);
  expect(state.isLoading).toBe(false);
  expect(state.permissionRequest).toBeNull();
  await act(async () => {
    t.instance.unmount();
  });
  await vi.waitFor(() => expect(handler).toBe(original));
  expect(runCount).toBe(1);
});

test("virtual list scrolls to an item using measured variable heights without blank padding", async () => {
  let handle: { scrollTo(index: number): void } | null = null;
  const items = Array.from({ length: 100 }, (_, i) => i);
  const rendered = new Set<number>();
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(
      React.createElement(VirtualList<number>, {
        ref: (value: typeof handle) => {
          handle = value;
        },
        items,
        viewportHeight: 6,
        overscan: 1,
        renderItem: (item: number) => {
          rendered.add(item);
          return React.createElement(Text, null, `ITEM-${item}\n${"line\n".repeat(item % 3)}`);
        },
      } as never),
    );
  });
  await vi.waitFor(() => expect(handle).not.toBeNull());
  rendered.clear();
  await act(async () => {
    handle!.scrollTo(70);
  });
  await vi.waitFor(() => expect(t.output()).toContain("ITEM-70"));
  expect(rendered.size).toBeLessThan(20);
});

test("bracketed paste submits once and resize leaves the prompt usable", async () => {
  const submit = vi.fn();
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(
      React.createElement(REPL, { messages: [], onSubmit: submit, placeholder: "Next task" }),
    );
  });
  await t.input("\x1b[200~pasted text\x1b[201~\r");
  await vi.waitFor(() => expect(submit).toHaveBeenCalledWith("pasted text"));
  expect(submit).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(t.output()).toContain("Next task"));
  await t.resize(32, 12);
  await t.input("next");
  await t.input("\r");
  await vi.waitFor(() => expect(submit).toHaveBeenCalledWith("next"));
  expect(submit).toHaveBeenCalledTimes(2);
});

test("REPL search navigates off-screen history and manual scroll survives appended messages", async () => {
  const messages = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    role: "user" as const,
    content: i === 0 ? "target-needle" : `recent-${i}`,
  }));
  let t!: ReturnType<typeof terminal>;
  const props = { messages, historyHeight: 7, onSubmit() {} };
  await act(async () => {
    t = terminal(React.createElement(REPL, props));
  });
  await vi.waitFor(() => expect(t.output()).toContain("recent-99"));
  expect(t.output()).not.toContain("target-needle");
  await t.input("\x06");
  await t.input("needle");
  await vi.waitFor(() => expect(t.output()).toContain("target-needle"));
  await t.input("\x1b");
  await vi.waitFor(() => expect(t.output()).not.toContain("Search:"));
  await act(async () => {
    t.instance.rerender(
      React.createElement(REPL, {
        ...props,
        messages: [...messages, { id: "100", role: "user", content: "appended-tail" }],
      }),
    );
  });
  await vi.waitFor(() => expect(t.output()).toContain("target-needle"));
  expect(t.output()).not.toContain("appended-tail");
  await t.input("\x1b[1;5F");
  await vi.waitFor(() => expect(t.output()).toContain("appended-tail"));
});

test("unmount denies a pending permission and restores the original policy", async () => {
  const original = vi.fn(async () => ({ decision: "deny" as const, approvalRequired: true }));
  let handler = original;
  let state!: UseAgentResult;
  let idle = Promise.resolve();
  let decision = "";
  const agent = {
    getPermissionHandler: () => handler,
    setPermissionHandler(next: typeof handler) {
      handler = next;
    },
    waitForIdle: () => idle,
    abort() {},
    cancel: () => idle,
    clearMessages() {},
    async *run() {
      let finish!: () => void;
      idle = new Promise<void>((resolve) => {
        finish = resolve;
      });
      try {
        decision = (await handler({ tool: "write", input: {} } as never)).decision;
        yield { type: "done" };
      } finally {
        finish();
      }
    },
  };
  function Bridge() {
    state = useAgent({ agent: agent as never });
    return React.createElement(Text, null, "bridge");
  }
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(React.createElement(Bridge));
  });
  let result!: Promise<void>;
  await act(async () => {
    result = state.submit("pending");
  });
  await vi.waitFor(() => expect(state.permissionRequest).not.toBeNull());
  await act(async () => {
    t.instance.unmount();
  });
  await result;
  expect(decision).toBe("deny");
  await vi.waitFor(() => expect(handler).toBe(original));
});

test("replacement mount skips a dead permission bridge when restoring policy", async () => {
  const original = vi.fn(async () => ({ decision: "deny" as const, approvalRequired: true }));
  let handler = original;
  let idle = Promise.resolve();
  let active = false;
  let state!: UseAgentResult;
  const agent = {
    getPermissionHandler: () => handler,
    setPermissionHandler(next: typeof handler) {
      handler = next;
    },
    abort() {},
    async waitForIdle() {
      if (active) await idle;
    },
    async cancel() {
      await this.waitForIdle();
    },
    clearMessages() {},
    async *run() {
      active = true;
      let finish!: () => void;
      idle = new Promise<void>((resolve) => {
        finish = resolve;
      });
      try {
        await handler({ tool: "write", input: {} } as never);
        yield { type: "done" };
      } finally {
        active = false;
        finish();
      }
    },
  };
  function Bridge() {
    state = useAgent({ agent: agent as never });
    return React.createElement(Text, null, state.isLoading ? "busy" : "idle");
  }
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(React.createElement(Bridge, { key: "first" }));
  });
  let result!: Promise<void>;
  await act(async () => {
    result = state.submit("first");
  });
  await vi.waitFor(() => expect(state.permissionRequest).not.toBeNull());
  await act(async () => {
    t.instance.rerender(React.createElement(Bridge, { key: "second" }));
  });
  await result;
  await act(async () => {
    t.instance.unmount();
  });
  await vi.waitFor(() => expect(handler).toBe(original));
});

test("throwing error observers do not leak loading or pending permissions", async () => {
  const original = async () => ({ decision: "deny" as const, approvalRequired: true });
  let handler = original;
  let state!: UseAgentResult;
  const agent = {
    getPermissionHandler: () => handler,
    setPermissionHandler(next: typeof handler) {
      handler = next;
    },
    waitForIdle: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
    abort() {},
    clearMessages() {},
    async *run() {
      yield { type: "error", error: new Error("upstream failed") };
      yield { type: "done" };
    },
  };
  const observer = vi.fn(() => {
    throw new Error("observer failed");
  });
  function Bridge() {
    state = useAgent({ agent: agent as never, onError: observer });
    return React.createElement(Text, null, "bridge");
  }
  await act(async () => {
    terminal(React.createElement(Bridge));
  });
  await act(async () => {
    await state.submit("first");
  });
  expect(observer).toHaveBeenCalledTimes(1);
  expect(state.isLoading).toBe(false);
  expect(
    state.messages.some(
      (message) =>
        Array.isArray(message.content) &&
        message.content.some(
          (content) => content.type === "error" && content.message === "upstream failed",
        ),
    ),
  ).toBe(true);
});

test("clearing a controlled prompt restores its cursor and placeholder", async () => {
  const submit = vi.fn();
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(
      React.createElement(REPL, { messages: [], onSubmit: submit, placeholder: "Next task" }),
    );
  });
  await t.input("message");
  await vi.waitFor(() => expect(t.output()).toContain("message"));
  expect(t.output()).not.toContain("Next task");
  await t.input("\r");
  await vi.waitFor(() => expect(submit).toHaveBeenCalledWith("message"));
  await vi.waitFor(() => expect(t.output()).toContain("Next task"));
});
