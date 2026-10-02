import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { renderSync, Text, useInput } from "@claude-code-kit/ink-renderer";
import { REPL } from "@claude-code-kit/ui";
import xterm from "@xterm/headless";
import React, { act, useState } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function terminal() {
  const screen = new xterm.Terminal({ cols: 60, rows: 18, allowProposedApi: true });
  const rawModes: boolean[] = [];
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true,
    setRawMode: (enabled: boolean) => rawModes.push(enabled),
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
  return {
    screen,
    stdin,
    stdout,
    rawModes,
    text: () =>
      Array.from(
        { length: screen.rows },
        (_, row) => screen.buffer.active.getLine(row)?.translateToString(true) ?? "",
      ).join("\n"),
    flush: () => new Promise<void>((resolve) => screen.write("", resolve)),
    close: () => {
      stdin.destroy();
      stdout.destroy();
      screen.dispose();
    },
  };
}

assert.ok(React.isValidElement(<Text>Packaged component</Text>));

async function waitForScreen(surface: ReturnType<typeof terminal>, expected: RegExp) {
  const deadline = Date.now() + 2_000;
  do {
    await surface.flush();
    if (expected.test(surface.text())) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  assert.match(surface.text(), expected);
}

const keyboard = terminal();
let cancelled = 0;
function Keyboard() {
  const [value, setValue] = useState("ready");
  useInput(
    (input, key) => {
      if (input === "p") setValue("pressed");
      if (input === "c" && key.ctrl) cancelled++;
    },
    { captureCtrlC: true },
  );
  return <Text>{value}</Text>;
}
let instance!: ReturnType<typeof renderSync>;
try {
  await act(async () => {
    instance = renderSync(<Keyboard />, {
      stdin: keyboard.stdin as never,
      stdout: keyboard.stdout as never,
      stderr: keyboard.stdout as never,
      patchConsole: false,
    });
  });
  await waitForScreen(keyboard, /ready/);
  await act(async () => {
    keyboard.stdin.write("p");
  });
  await waitForScreen(keyboard, /pressed/);
  await act(async () => {
    keyboard.stdin.write("\x03");
  });
  assert.equal(cancelled, 1);
} finally {
  await act(async () => {
    instance?.unmount();
  });
  instance?.cleanup();
  assert.equal(keyboard.rawModes.at(-1), false);
  keyboard.close();
}

const repl = terminal();
const submitted: string[] = [];
let replInstance!: ReturnType<typeof renderSync>;
try {
  await act(async () => {
    replInstance = renderSync(
      <REPL
        messages={[]}
        onSubmit={(input) => {
          submitted.push(input);
        }}
        welcome={<Text>Starter ready</Text>}
      />,
      {
        stdin: repl.stdin as never,
        stdout: repl.stdout as never,
        stderr: repl.stdout as never,
        patchConsole: false,
      },
    );
  });
  await waitForScreen(repl, /Starter ready/);
  await act(async () => {
    repl.stdin.write("\x1b[200~hello packed\x1b[201~");
  });
  await waitForScreen(repl, /hello packed/);
  await act(async () => {
    repl.stdin.write("\r");
  });
  assert.deepEqual(submitted, ["hello packed"]);
} finally {
  await act(async () => {
    replInstance?.unmount();
  });
  replInstance?.cleanup();
  assert.equal(repl.rawModes.at(-1), false);
  repl.close();
}
console.log("OK packed mounted UI, stdin, Ctrl+C, bracketed paste and unmount");
