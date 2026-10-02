import { PassThrough, Writable } from "node:stream";
import { Terminal } from "@xterm/headless";
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSync, Text } from "../packages/ink-renderer/src/index";
import { REPL, type REPLProps } from "../packages/ui/src/REPL";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const terminals: Array<ReturnType<typeof terminal>> = [];
function terminal(props: REPLProps) {
  const screen = new Terminal({ cols: 60, rows: 18, allowProposedApi: true });
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
    { isTTY: true, columns: 60, rows: 18 },
  );
  const instance = renderSync(
    React.createElement(REPL, { spinner: React.createElement(Text, null, "busy"), ...props }),
    {
      stdin: stdin as never,
      stdout: stdout as never,
      stderr: stdout as never,
      patchConsole: false,
    },
  );
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

async function enter(t: ReturnType<typeof terminal>, message: string) {
  await t.input(message);
  await t.input("\r");
}

describe("REPL callback error recovery", () => {
  it("releases the submit guard after a synchronous callback failure", async () => {
    const failure = new Error("submit failed");
    const submit = vi.fn().mockImplementationOnce(() => {
      throw failure;
    });
    const onError = vi.fn();
    let t!: ReturnType<typeof terminal>;
    await act(async () => {
      t = terminal({ messages: [], onSubmit: submit, onError });
    });
    await enter(t, "first").catch(() => {});
    await enter(t, "second");
    expect(submit.mock.calls.map((call) => call[0])).toEqual(["first", "second"]);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("shows a rejected submission as a visible terminal error", async () => {
    const failure = new Error("submission rejected");
    const submit = vi.fn().mockRejectedValueOnce(failure);
    const onError = vi.fn();
    let t!: ReturnType<typeof terminal>;
    await act(async () => {
      t = terminal({ messages: [], onSubmit: submit, onError });
    });
    await enter(t, "first");
    await vi.waitFor(() => expect(t.output()).toContain("submission rejected"));
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it.each([
    "throw",
    "reject",
  ] as const)("reports cancellation callback failures without exiting the terminal: %s", async (kind) => {
    const failure = new Error("cancel failed");
    const onCancel = vi.fn(() => {
      if (kind === "throw") throw failure;
      return Promise.reject(failure);
    });
    const onError = vi.fn();
    let t!: ReturnType<typeof terminal>;
    await act(async () => {
      t = terminal({ messages: [], isLoading: true, onSubmit() {}, onCancel, onError });
    });
    await t.input("\x03").catch(() => {});
    await vi.waitFor(() => expect(t.output()).toContain("cancel failed"));
    expect(onError).toHaveBeenCalledWith(failure);
    expect(t.stdin.listenerCount("readable")).toBeGreaterThan(0);
  });

  it.each([
    "throw",
    "reject",
  ] as const)("contains a failing error observer and keeps the prompt usable: %s", async (kind) => {
    const onError = vi.fn(() => {
      if (kind === "throw") throw new Error("observer failed");
      return Promise.reject(new Error("observer failed"));
    });
    const submit = vi.fn().mockRejectedValueOnce(new Error("original failure"));
    let t!: ReturnType<typeof terminal>;
    await act(async () => {
      t = terminal({ messages: [], onSubmit: submit, onError });
    });
    await enter(t, "first");
    await vi.waitFor(() => expect(t.output()).toContain("original failure"));
    await enter(t, "second");
    expect(submit.mock.calls.map((call) => call[0])).toEqual(["first", "second"]);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
