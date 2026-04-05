import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grepTool } from "../packages/tools/src/grep.ts";
import type { ToolContext } from "../packages/agent/src/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    workingDirectory: tmpDir,
    abortSignal: new AbortController().signal,
    env: {},
    ...overrides,
  };
}

function writeFile(name: string, content: string): string {
  const filePath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cck-grep-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Basic search (backward compatibility)
// ---------------------------------------------------------------------------

describe("grepTool basic", () => {
  it("finds files matching a regex pattern (default mode)", async () => {
    writeFile("src/index.ts", "export function hello() {}\nexport const world = 1");
    writeFile("src/other.ts", 'import { hello } from "./index"');

    const result = await grepTool.execute!(
      { pattern: "hello", path: tmpDir },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("index.ts");
    expect(result.content).toContain("other.ts");
  });

  it("returns no-match message when pattern is absent", async () => {
    writeFile("empty.ts", "nothing here");

    const result = await grepTool.execute!(
      { pattern: "xyzUnlikelyPattern123", path: tmpDir },
      makeCtx(),
    );

    expect(result.content).toMatch(/no matches/i);
  });

  it("handles invalid regex gracefully", async () => {
    writeFile("test.txt", "some content");

    const result = await grepTool.execute!(
      { pattern: "[invalid(", path: tmpDir },
      makeCtx(),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/Error searching/);
  });

  it("returns Aborted when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await grepTool.execute!(
      { pattern: "test", path: tmpDir },
      makeCtx({ abortSignal: controller.signal }),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toBe("Aborted");
  });

  it("searches a single file when path points to a file", async () => {
    const filePath = writeFile("target.txt", "line one\nfind me\nline three");

    const result = await grepTool.execute!(
      { pattern: "find me", path: filePath, output_mode: "content" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("find me");
  });
});

// ---------------------------------------------------------------------------
// output_mode: files_with_matches (default)
// ---------------------------------------------------------------------------

describe("output_mode: files_with_matches", () => {
  it("returns only file paths by default", async () => {
    writeFile("a.ts", "const x = hello");
    writeFile("b.ts", "const y = world");
    writeFile("c.ts", "const z = hello world");

    const result = await grepTool.execute!(
      { pattern: "hello", path: tmpDir },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("a.ts");
    expect(result.content).toContain("c.ts");
    expect(result.content).not.toContain("b.ts");
    // Should not contain line content, only paths
    expect(result.content).not.toContain("const x");
  });

  it("explicit files_with_matches mode works", async () => {
    writeFile("match.js", "console.log('test')");

    const result = await grepTool.execute!(
      { pattern: "console", path: tmpDir, output_mode: "files_with_matches" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("match.js");
  });
});

// ---------------------------------------------------------------------------
// output_mode: content
// ---------------------------------------------------------------------------

describe("output_mode: content", () => {
  it("returns matching lines with line numbers", async () => {
    writeFile("file.ts", "line one\nline two\nfind this\nline four");

    const result = await grepTool.execute!(
      { pattern: "find this", path: tmpDir, output_mode: "content" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("file.ts:3:find this");
  });

  it("returns matching lines without line numbers when -n is false", async () => {
    writeFile("file.ts", "line one\nfind this\nline three");

    const result = await grepTool.execute!(
      { pattern: "find this", path: tmpDir, output_mode: "content", "-n": false },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("file.ts:find this");
    // Should not have line number
    expect(result.content).not.toContain("file.ts:2:");
  });

  it("finds multiple matches across files", async () => {
    writeFile("a.ts", "hello world\ngoodbye world");
    writeFile("b.ts", "hello again");

    const result = await grepTool.execute!(
      { pattern: "hello", path: tmpDir, output_mode: "content" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("hello world");
    expect(result.content).toContain("hello again");
  });
});

// ---------------------------------------------------------------------------
// output_mode: count
// ---------------------------------------------------------------------------

describe("output_mode: count", () => {
  it("returns match counts per file", async () => {
    writeFile("multi.ts", "apple\nbanana\napple pie\napple sauce");
    writeFile("single.ts", "one apple here");

    const result = await grepTool.execute!(
      { pattern: "apple", path: tmpDir, output_mode: "count" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("multi.ts:3");
    expect(result.content).toContain("single.ts:1");
  });

  it("excludes files with zero matches", async () => {
    writeFile("match.ts", "target");
    writeFile("nomatch.ts", "nothing");

    const result = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "count" },
      makeCtx(),
    );

    expect(result.content).toContain("match.ts:1");
    expect(result.content).not.toContain("nomatch.ts");
  });
});

// ---------------------------------------------------------------------------
// Context lines: -A, -B, -C / context
// ---------------------------------------------------------------------------

describe("context lines", () => {
  const fileContent = "line1\nline2\nMATCH\nline4\nline5\nline6";

  it("-A shows lines after match", async () => {
    writeFile("ctx.txt", fileContent);

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-A": 2 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("MATCH");
    expect(result.content).toContain("line4");
    expect(result.content).toContain("line5");
    // Should not include line before match
    expect(result.content).not.toContain("line2");
  });

  it("-B shows lines before match", async () => {
    writeFile("ctx.txt", fileContent);

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-B": 2 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("line1");
    expect(result.content).toContain("line2");
    expect(result.content).toContain("MATCH");
    // Should not include lines after match
    expect(result.content).not.toContain("line4");
  });

  it("-C provides symmetric context", async () => {
    writeFile("ctx.txt", fileContent);

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-C": 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("line2");
    expect(result.content).toContain("MATCH");
    expect(result.content).toContain("line4");
    expect(result.content).not.toContain("line1");
    expect(result.content).not.toContain("line5");
  });

  it("context parameter is alias for -C", async () => {
    writeFile("ctx.txt", fileContent);

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", context: 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("line2");
    expect(result.content).toContain("MATCH");
    expect(result.content).toContain("line4");
  });

  it("merges overlapping context blocks", async () => {
    writeFile("close.txt", "line1\nMATCH_A\nline3\nMATCH_B\nline5");

    const result = await grepTool.execute!(
      { pattern: "MATCH_", path: tmpDir, output_mode: "content", "-C": 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    // Should be one merged block, no separator
    expect(result.content).not.toContain("--");
    expect(result.content).toContain("line1");
    expect(result.content).toContain("MATCH_A");
    expect(result.content).toContain("line3");
    expect(result.content).toContain("MATCH_B");
    expect(result.content).toContain("line5");
  });

  it("separates non-overlapping context blocks with --", async () => {
    writeFile("far.txt", "line1\nMATCH_A\nline3\nline4\nline5\nline6\nMATCH_B\nline8");

    const result = await grepTool.execute!(
      { pattern: "MATCH_", path: tmpDir, output_mode: "content", "-C": 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("--");
  });

  it("context uses - separator for non-match lines and : for match lines", async () => {
    writeFile("sep.txt", "before\nMATCH\nafter");

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-C": 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    // Match line uses ":"
    expect(result.content).toContain("sep.txt:2:MATCH");
    // Context lines use "-"
    expect(result.content).toContain("sep.txt-1-before");
    expect(result.content).toContain("sep.txt-3-after");
  });

  it("-A and -B override -C", async () => {
    writeFile("override.txt", "line1\nline2\nMATCH\nline4\nline5\nline6");

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-C": 0, "-A": 2, "-B": 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("line2");
    expect(result.content).toContain("MATCH");
    expect(result.content).toContain("line4");
    expect(result.content).toContain("line5");
    expect(result.content).not.toContain("line1");
    expect(result.content).not.toContain("line6");
  });
});

// ---------------------------------------------------------------------------
// head_limit and offset
// ---------------------------------------------------------------------------

describe("head_limit and offset", () => {
  it("limits output to head_limit entries in files_with_matches mode", async () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`file${String(i).padStart(2, "0")}.ts`, "target pattern");
    }

    const result = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "files_with_matches", head_limit: 3 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
  });

  it("limits output in content mode", async () => {
    writeFile("many.txt", Array.from({ length: 20 }, (_, i) => `match_${i}`).join("\n"));

    const result = await grepTool.execute!(
      { pattern: "match_", path: tmpDir, output_mode: "content", head_limit: 5 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(5);
  });

  it("limits output in count mode", async () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`c${i}.ts`, "pattern");
    }

    const result = await grepTool.execute!(
      { pattern: "pattern", path: tmpDir, output_mode: "count", head_limit: 3 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
  });

  it("offset skips entries before applying head_limit", async () => {
    for (let i = 0; i < 10; i++) {
      writeFile(`s${String(i).padStart(2, "0")}.ts`, "target");
    }

    const resultAll = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "files_with_matches", head_limit: 0 },
      makeCtx(),
    );
    const allFiles = resultAll.content.split("\n").filter(Boolean);

    const resultOffset = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "files_with_matches", offset: 3, head_limit: 2 },
      makeCtx(),
    );
    const offsetFiles = resultOffset.content.split("\n").filter(Boolean);

    expect(offsetFiles.length).toBe(2);
    // The offset entries should correspond to items 3 and 4 (0-indexed) of the full list
    expect(offsetFiles[0]).toBe(allFiles[3]);
    expect(offsetFiles[1]).toBe(allFiles[4]);
  });

  it("head_limit 0 means unlimited", async () => {
    for (let i = 0; i < 5; i++) {
      writeFile(`u${i}.ts`, "unlimited");
    }

    const result = await grepTool.execute!(
      { pattern: "unlimited", path: tmpDir, output_mode: "files_with_matches", head_limit: 0 },
      makeCtx(),
    );

    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// multiline mode
// ---------------------------------------------------------------------------

describe("multiline mode", () => {
  it("matches patterns spanning multiple lines", async () => {
    writeFile("multi.ts", "function hello() {\n  return 1;\n}\n\nfunction world() {\n  return 2;\n}");

    const result = await grepTool.execute!(
      { pattern: "hello\\(\\) \\{\\s+return", path: tmpDir, output_mode: "content", multiline: true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("function hello()");
    expect(result.content).toContain("return 1");
  });

  it("dotAll flag works (dot matches newline)", async () => {
    writeFile("dot.txt", "start\nmiddle\nend");

    const result = await grepTool.execute!(
      { pattern: "start.+end", path: tmpDir, output_mode: "content", multiline: true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("start");
    expect(result.content).toContain("end");
  });

  it("single-line mode does not match across lines", async () => {
    writeFile("nope.txt", "start\nend");

    const result = await grepTool.execute!(
      { pattern: "start.*end", path: tmpDir, output_mode: "content", multiline: false },
      makeCtx(),
    );

    expect(result.content).toMatch(/no matches/i);
  });

  it("multiline mode in files_with_matches returns file paths", async () => {
    writeFile("ml.txt", "hello\nworld");

    const result = await grepTool.execute!(
      { pattern: "hello\\nworld", path: tmpDir, output_mode: "files_with_matches", multiline: true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("ml.txt");
  });

  it("multiline mode in count returns match count", async () => {
    writeFile("mlcount.txt", "AB\nCD\nAB\nCD");

    const result = await grepTool.execute!(
      { pattern: "AB\\nCD", path: tmpDir, output_mode: "count", multiline: true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("mlcount.txt:2");
  });
});

// ---------------------------------------------------------------------------
// File type filtering
// ---------------------------------------------------------------------------

describe("type filter", () => {
  it("filters to JavaScript files", async () => {
    writeFile("app.js", "const x = 1");
    writeFile("app.ts", "const x = 1");
    writeFile("app.py", "x = 1");

    const result = await grepTool.execute!(
      { pattern: "const|x", path: tmpDir, output_mode: "files_with_matches", type: "js" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("app.js");
    expect(result.content).not.toContain("app.ts");
    expect(result.content).not.toContain("app.py");
  });

  it("filters to TypeScript files including .tsx", async () => {
    writeFile("comp.tsx", "export default () => <div/>");
    writeFile("util.ts", "export const x = 1");
    writeFile("script.js", "const y = 2");

    const result = await grepTool.execute!(
      { pattern: "export", path: tmpDir, output_mode: "files_with_matches", type: "ts" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("comp.tsx");
    expect(result.content).toContain("util.ts");
    expect(result.content).not.toContain("script.js");
  });

  it("filters to Python files", async () => {
    writeFile("main.py", "print('hello')");
    writeFile("types.pyi", "x: int");
    writeFile("main.js", "console.log('hello')");

    const result = await grepTool.execute!(
      { pattern: "hello|int", path: tmpDir, output_mode: "files_with_matches", type: "py" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("main.py");
    expect(result.content).toContain("types.pyi");
    expect(result.content).not.toContain("main.js");
  });

  it("returns error for unknown type", async () => {
    writeFile("test.txt", "content");

    const result = await grepTool.execute!(
      { pattern: "content", path: tmpDir, type: "unknownlang" },
      makeCtx(),
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown file type");
  });

  it("type filter works with glob", async () => {
    writeFile("src/a.ts", "target");
    writeFile("src/b.ts", "target");
    writeFile("lib/c.ts", "target");

    const result = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "files_with_matches", type: "ts", glob: "src/**" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain(path.join("src", "a.ts"));
    expect(result.content).toContain(path.join("src", "b.ts"));
    expect(result.content).not.toContain(path.join("lib", "c.ts"));
  });
});

// ---------------------------------------------------------------------------
// Case insensitive (-i)
// ---------------------------------------------------------------------------

describe("case insensitive search (-i)", () => {
  it("matches regardless of case", async () => {
    writeFile("case.txt", "Hello World\nhello world\nHELLO WORLD");

    const result = await grepTool.execute!(
      { pattern: "hello", path: tmpDir, output_mode: "content", "-i": true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(3);
  });

  it("case sensitive by default", async () => {
    writeFile("case.txt", "Hello World\nhello world\nHELLO WORLD");

    const result = await grepTool.execute!(
      { pattern: "hello", path: tmpDir, output_mode: "content" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    // Only lowercase match
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(1);
    expect(result.content).toContain("hello world");
  });
});

// ---------------------------------------------------------------------------
// Line numbers (-n)
// ---------------------------------------------------------------------------

describe("line numbers (-n)", () => {
  it("shows line numbers by default in content mode", async () => {
    writeFile("num.txt", "first\nsecond\nthird");

    const result = await grepTool.execute!(
      { pattern: "second", path: tmpDir, output_mode: "content" },
      makeCtx(),
    );

    expect(result.content).toContain("num.txt:2:second");
  });

  it("hides line numbers when -n is false", async () => {
    writeFile("num.txt", "first\nsecond\nthird");

    const result = await grepTool.execute!(
      { pattern: "second", path: tmpDir, output_mode: "content", "-n": false },
      makeCtx(),
    );

    expect(result.content).toContain("num.txt:second");
    expect(result.content).not.toMatch(/num\.txt:\d+:second/);
  });

  it("-n is ignored for non-content modes", async () => {
    writeFile("num.txt", "target");

    const resultFWM = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "files_with_matches", "-n": true },
      makeCtx(),
    );
    expect(resultFWM.content).toBe("num.txt");

    const resultCount = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "count", "-n": true },
      makeCtx(),
    );
    expect(resultCount.content).toBe("num.txt:1");
  });
});

// ---------------------------------------------------------------------------
// glob filter
// ---------------------------------------------------------------------------

describe("glob filter", () => {
  it("restricts search to matching files", async () => {
    writeFile("src/app.ts", "target");
    writeFile("src/app.js", "target");
    writeFile("src/style.css", "target");

    const result = await grepTool.execute!(
      { pattern: "target", path: tmpDir, glob: "**/*.ts" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("app.ts");
    expect(result.content).not.toContain("app.js");
    expect(result.content).not.toContain("style.css");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty files", async () => {
    writeFile("empty.txt", "");

    const result = await grepTool.execute!(
      { pattern: "anything", path: tmpDir },
      makeCtx(),
    );

    expect(result.content).toMatch(/no matches/i);
  });

  it("handles files with only newlines", async () => {
    writeFile("newlines.txt", "\n\n\n");

    const result = await grepTool.execute!(
      { pattern: "anything", path: tmpDir },
      makeCtx(),
    );

    expect(result.content).toMatch(/no matches/i);
  });

  it("context at beginning of file does not go negative", async () => {
    writeFile("start.txt", "MATCH\nline2\nline3");

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-B": 5 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    // Should start from line 1, not crash
    expect(result.content).toContain("MATCH");
  });

  it("context at end of file does not exceed bounds", async () => {
    writeFile("end.txt", "line1\nline2\nMATCH");

    const result = await grepTool.execute!(
      { pattern: "MATCH", path: tmpDir, output_mode: "content", "-A": 5 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("MATCH");
  });

  it("metadata includes matchCount", async () => {
    writeFile("meta.txt", "a\nb\na\nb\na");

    const result = await grepTool.execute!(
      { pattern: "a", path: tmpDir, output_mode: "content" },
      makeCtx(),
    );

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.matchCount).toBe(3);
  });

  it("isReadOnly is true", () => {
    expect(grepTool.isReadOnly).toBe(true);
  });

  it("tool name is Grep", () => {
    expect(grepTool.name).toBe("Grep");
  });

  it("skips binary files without erroring", async () => {
    // Create a file with null bytes (binary)
    const binPath = path.join(tmpDir, "binary.dat");
    const buf = Buffer.alloc(100);
    buf.write("target");
    buf[10] = 0;
    fs.writeFileSync(binPath, buf);

    writeFile("text.txt", "target");

    const result = await grepTool.execute!(
      { pattern: "target", path: tmpDir },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    // Should find match in text file; binary may or may not match (it's valid utf8 with nulls)
    expect(result.content).toContain("text.txt");
  });

  it("defaults head_limit to 250", async () => {
    // Create 300 files
    for (let i = 0; i < 300; i++) {
      writeFile(`f${String(i).padStart(3, "0")}.ts`, "target");
    }

    const result = await grepTool.execute!(
      { pattern: "target", path: tmpDir, output_mode: "files_with_matches" },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// Combined parameters
// ---------------------------------------------------------------------------

describe("combined parameters", () => {
  it("multiline + case insensitive", async () => {
    writeFile("combo.txt", "Hello\nWORLD");

    const result = await grepTool.execute!(
      { pattern: "hello\\nworld", path: tmpDir, output_mode: "files_with_matches", multiline: true, "-i": true },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("combo.txt");
  });

  it("type + content mode + context", async () => {
    writeFile("app.ts", "import React from 'react'\n\nexport function App() {\n  return null\n}");
    writeFile("app.js", "import React from 'react'\n\nexport function App() {\n  return null\n}");

    const result = await grepTool.execute!(
      { pattern: "export function", path: tmpDir, output_mode: "content", type: "ts", "-A": 1 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("app.ts");
    expect(result.content).toContain("export function App()");
    expect(result.content).toContain("return null");
    expect(result.content).not.toContain("app.js");
  });

  it("offset + head_limit in content mode", async () => {
    writeFile("lines.txt", Array.from({ length: 10 }, (_, i) => `match_${i}`).join("\n"));

    const result = await grepTool.execute!(
      { pattern: "match_", path: tmpDir, output_mode: "content", offset: 3, head_limit: 4 },
      makeCtx(),
    );

    expect(result.isError).toBeFalsy();
    const lines = result.content.split("\n").filter(Boolean);
    expect(lines.length).toBe(4);
    expect(result.content).toContain("match_3");
    expect(result.content).toContain("match_6");
    expect(result.content).not.toContain("match_0");
    expect(result.content).not.toContain("match_7");
  });
});
