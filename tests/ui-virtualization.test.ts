import * as fs from "node:fs/promises";
import { PassThrough, Writable } from "node:stream";
import { Terminal } from "@xterm/headless";
import React, { act, useEffect } from "react";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { renderSync, Text } from "../packages/ink-renderer/src/index";
import { VirtualList, type VirtualListHandle } from "../packages/ui/src/useVirtualScroll";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const terminals: Array<ReturnType<typeof terminal>> = [];
const samples: Array<{
  itemCount: number;
  mountRendered: number;
  middleRendered: number;
  endRendered: number;
  peakMounted: number;
  elapsedMs: number;
}> = [];

function terminal(node: React.ReactNode, columns = 60, rows = 18) {
  const screen = new Terminal({ cols: columns, rows, scrollback: 100, allowProposedApi: true });
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
    { isTTY: true, columns, rows },
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
    screen,
    instance,
    output: () =>
      Array.from(
        { length: screen.rows },
        (_, row) =>
          screen.buffer.active
            .getLine(screen.buffer.active.viewportY + row)
            ?.translateToString(true) ?? "",
      ).join("\n"),
    resize: async (nextColumns: number, nextRows: number) => {
      screen.resize(nextColumns, nextRows);
      await act(async () => {
        stdout.columns = nextColumns;
        stdout.rows = nextRows;
        stdout.emit("resize");
      });
    },
  };
  terminals.push(result);
  return result;
}

afterEach(async () => {
  for (const item of terminals.splice(0)) {
    await act(async () => item.instance.unmount());
    item.instance.cleanup();
    await vi.waitFor(() => expect(item.stdout.writableLength).toBe(0));
    item.screen.dispose();
    item.stdin.destroy();
    item.stdout.destroy();
  }
});

afterAll(async () => {
  if (process.env.CCK_VIRTUAL_BENCHMARK_PATH) {
    await fs.writeFile(process.env.CCK_VIRTUAL_BENCHMARK_PATH, JSON.stringify(samples, null, 2));
  }
});

test.each([
  100, 1000, 5000,
])("renders a bounded window and reaches middle/end with %s items", async (itemCount) => {
  const started = performance.now();
  const rendered = new Set<number>();
  const mounted = new Set<number>();
  let peakMounted = 0;
  let handle: VirtualListHandle | null = null;
  function Row({ value }: { value: number }) {
    useEffect(() => {
      mounted.add(value);
      peakMounted = Math.max(peakMounted, mounted.size);
      return () => {
        mounted.delete(value);
      };
    }, [value]);
    return React.createElement(Text, null, `ROW-${value}\ndetail-${value}`);
  }
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(
      React.createElement(VirtualList<number>, {
        ref: (value) => {
          handle = value;
        },
        items: Array.from({ length: itemCount }, (_, index) => index),
        itemKey: (value) => value,
        viewportHeight: 8,
        estimatedItemHeight: 2,
        overscan: 2,
        renderItem: (value) => {
          rendered.add(value);
          return React.createElement(Row, { value });
        },
      }),
    );
  });
  await vi.waitFor(() => expect(t.output()).toContain("ROW-0"));
  expect(t.output()).not.toContain(`ROW-${itemCount - 1}`);
  expect(rendered.size).toBeLessThanOrEqual(16);
  const mountRendered = rendered.size;

  rendered.clear();
  const middle = Math.floor(itemCount / 2);
  await act(async () => handle!.scrollTo(middle));
  await vi.waitFor(() => expect(t.output()).toContain(`ROW-${middle}`));
  expect(t.output()).not.toContain("ROW-0\n");
  expect(rendered.size).toBeLessThanOrEqual(20);
  const middleRendered = rendered.size;

  rendered.clear();
  await act(async () => handle!.scrollToEnd());
  await vi.waitFor(() => expect(t.output()).toContain(`ROW-${itemCount - 1}`));
  expect(t.output()).toContain(`detail-${itemCount - 1}`);
  expect(rendered.size).toBeLessThanOrEqual(20);
  expect(peakMounted).toBeLessThanOrEqual(16);
  samples.push({
    itemCount,
    mountRendered,
    middleRendered,
    endRendered: rendered.size,
    peakMounted,
    elapsedMs: performance.now() - started,
  });
});

test("follows appended output at the end and preserves manual scroll until returning to the end", async () => {
  let handle: VirtualListHandle | null = null;
  let items = Array.from({ length: 100 }, (_, index) => ({ id: index, text: `ROW-${index}` }));
  const node = () =>
    React.createElement(VirtualList<(typeof items)[number]>, {
      ref: (value) => {
        handle = value;
      },
      items,
      itemKey: (value) => value.id,
      viewportHeight: 6,
      estimatedItemHeight: 1,
      overscan: 2,
      followOutput: true,
      renderItem: (value) => React.createElement(Text, null, value.text),
    });
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(node());
  });
  await vi.waitFor(() => expect(t.output()).toContain("ROW-99"));
  items = [...items, { id: 100, text: "APPENDED-100" }];
  await act(async () => t.instance.rerender(node()));
  await vi.waitFor(() => expect(t.output()).toContain("APPENDED-100"));

  await act(async () => handle!.scrollTo(45));
  await vi.waitFor(() => expect(t.output()).toContain("ROW-45"));
  await act(async () => handle!.scrollBy(2));
  await vi.waitFor(() => {
    expect(t.output()).toContain("ROW-47");
    expect(t.output()).not.toContain("ROW-45\n");
  });
  items = [...items, { id: 101, text: "APPENDED-101" }];
  await act(async () => t.instance.rerender(node()));
  await vi.waitFor(() => expect(t.output()).toContain("ROW-47"));
  expect(t.output()).not.toContain("APPENDED-101");

  await act(async () => handle!.scrollToEnd());
  await vi.waitFor(() => expect(t.output()).toContain("APPENDED-101"));
  items = [...items, { id: 102, text: "APPENDED-102" }];
  await act(async () => t.instance.rerender(node()));
  await vi.waitFor(() => expect(t.output()).toContain("APPENDED-102"));
});

test("remeasures a growing stream item and keeps its tail visible without losing earlier variable-height rows", async () => {
  let handle: VirtualListHandle | null = null;
  let items = Array.from({ length: 80 }, (_, index) => ({
    id: index,
    text: `ROW-${index}\n${"detail\n".repeat(index % 4)}END-${index}`,
  }));
  items = [...items, { id: 80, text: "STREAM-START" }];
  const node = () =>
    React.createElement(VirtualList<(typeof items)[number]>, {
      ref: (value) => {
        handle = value;
      },
      items,
      itemKey: (value) => value.id,
      viewportHeight: 8,
      estimatedItemHeight: 3,
      overscan: 2,
      followOutput: true,
      renderItem: (value) => React.createElement(Text, null, value.text),
    });
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(node());
  });
  await vi.waitFor(() => expect(t.output()).toContain("STREAM-START"));
  items = items.map((item) =>
    item.id === 80
      ? { ...item, text: `STREAM-START\n${"growing-line\n".repeat(15)}STREAM-GROWN-END` }
      : item,
  );
  await act(async () => t.instance.rerender(node()));
  await vi.waitFor(() => expect(t.output()).toContain("STREAM-GROWN-END"));
  expect(t.output()).not.toContain("STREAM-START");
  await act(async () => handle!.scrollTo(42));
  await vi.waitFor(() => expect(t.output()).toContain("ROW-42"));
  expect(t.output()).toContain("END-42");
  expect(t.output()).not.toContain("STREAM-GROWN-END");
  await t.resize(32, 14);
  await vi.waitFor(() => expect(t.output()).toContain("ROW-42"));
  await act(async () => handle!.scrollToEnd());
  await vi.waitFor(() => expect(t.output()).toContain("STREAM-GROWN-END"));
});

test("wraps CJK text on the terminal screen and remeasures it after a narrow resize", async () => {
  const text = `CJK ${"\u754c".repeat(24)} END`;
  let t!: ReturnType<typeof terminal>;
  await act(async () => {
    t = terminal(
      React.createElement(VirtualList<string>, {
        items: [text, "AFTER-CJK"],
        viewportHeight: 8,
        estimatedItemHeight: 1,
        overscan: 1,
        renderItem: (value) => React.createElement(Text, null, value),
      }),
    );
  });
  await vi.waitFor(() => expect(t.output()).toContain(text));
  expect(
    t
      .output()
      .split("\n")
      .filter((line) => line.includes("\u754c")),
  ).toHaveLength(1);
  await t.resize(20, 14);
  await vi.waitFor(() => {
    const lines = t.output().split("\n");
    const start = lines.findIndex((line) => line.startsWith("CJK"));
    const end = lines.findIndex((line) => line.startsWith("AFTER-CJK"));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(lines.slice(start, end).join("").replace(/\s/g, "")).toBe(
      `CJK${"\u754c".repeat(24)}END`,
    );
    expect(lines.filter((line) => line.includes("\u754c")).length).toBeGreaterThanOrEqual(3);
  });
});
