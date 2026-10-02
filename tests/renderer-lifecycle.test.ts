import { PassThrough, Writable } from "node:stream";
import React, { act } from "react";
import { expect, test, vi } from "vitest";
import { renderSync, Text, useInput } from "../packages/ink-renderer/src/index";

const { synchronousWrite } = vi.hoisted(() => ({ synchronousWrite: vi.fn(() => 0) }));
vi.mock("node:fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs")>()),
  writeSync: synchronousWrite,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("custom output owns terminal cleanup and late exit waits settle", async () => {
  let output = "";
  const raw: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(value: boolean) {
      raw.push(value);
    },
    ref() {},
    unref() {},
  });
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    }),
    { isTTY: true, columns: 40, rows: 12 },
  );
  function Input() {
    useInput(() => {});
    return React.createElement(Text, null, "ready");
  }
  const instance = renderSync(React.createElement(Input), {
    stdin: stdin as never,
    stdout: stdout as never,
    stderr: stdout as never,
    patchConsole: false,
  });
  await act(async () => {
    instance.unmount();
  });
  await instance.waitUntilExit();
  expect(synchronousWrite).not.toHaveBeenCalled();
  expect(output).toContain("\x1b[?25h");
  expect(raw.at(-1)).toBe(false);
  expect(stdin.listenerCount("readable")).toBe(0);
  instance.cleanup();
  stdin.destroy();
  stdout.destroy();
});

const ctrlCSequences = [
  ["raw", "\x03"],
  ["Kitty CSI-u", "\x1b[99;5u"],
  ["modifyOtherKeys", "\x1b[27;5;99~"],
] as const;

test.each(
  ctrlCSequences,
)("unclaimed %s Ctrl+C exits and restores raw mode", async (_name, sequence) => {
  const raw: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode(value: boolean) {
      raw.push(value);
    },
    ref() {},
    unref() {},
  });
  const stdout = Object.assign(
    new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    {
      isTTY: true,
      columns: 40,
      rows: 12,
    },
  );
  function Input() {
    useInput(() => {});
    return React.createElement(Text, null, "ready");
  }
  let instance!: ReturnType<typeof renderSync>;
  await act(async () => {
    instance = renderSync(React.createElement(Input), {
      stdin: stdin as never,
      stdout: stdout as never,
      stderr: stdout as never,
      patchConsole: false,
    });
  });
  let exited = false;
  void instance.waitUntilExit().then(() => {
    exited = true;
  });
  try {
    await act(async () => {
      stdin.write(sequence);
    });
    await vi.waitFor(() => expect(exited).toBe(true), { timeout: 150 });
    expect(raw.at(-1)).toBe(false);
  } finally {
    await act(async () => {
      instance.unmount();
    });
    instance.cleanup();
    stdin.destroy();
    stdout.destroy();
  }
});

test.each(
  ctrlCSequences,
)("a capturing input hook can consume %s Ctrl+C", async (_name, sequence) => {
  const cancel = vi.fn();
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
    {
      isTTY: true,
      columns: 40,
      rows: 12,
    },
  );
  function Input() {
    useInput(
      (input, key, event) => {
        if (input === "c" && key.ctrl) {
          cancel();
          event.stopImmediatePropagation();
        }
      },
      { captureCtrlC: true },
    );
    return React.createElement(Text, null, "ready");
  }
  let instance!: ReturnType<typeof renderSync>;
  await act(async () => {
    instance = renderSync(React.createElement(Input), {
      stdin: stdin as never,
      stdout: stdout as never,
      stderr: stdout as never,
      patchConsole: false,
    });
  });
  let exited = false;
  void instance.waitUntilExit().then(() => {
    exited = true;
  });
  try {
    await act(async () => {
      stdin.write(sequence);
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce(), { timeout: 150 });
    expect(exited).toBe(false);
  } finally {
    await act(async () => {
      instance.unmount();
    });
    instance.cleanup();
    stdin.destroy();
    stdout.destroy();
  }
});
