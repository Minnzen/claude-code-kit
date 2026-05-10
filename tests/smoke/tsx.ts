// Cross-environment smoke (tsx mode).
//
// This is the exact runtime that surfaced the 0.3.1 `Dynamic require of
// "semver" is not supported` crash (issue #1). Running this on every commit
// ensures any future CJS->ESM regression is caught before publish.

import * as agent from "@claude-code-kit/agent";
import * as inkRenderer from "@claude-code-kit/ink-renderer";
import * as shared from "@claude-code-kit/shared";
import * as tools from "@claude-code-kit/tools";
import * as ui from "@claude-code-kit/ui";

type Case = { name: string; mod: Record<string, unknown>; expect: string[] };

const cases: Case[] = [
  { name: "@claude-code-kit/shared", mod: shared, expect: ["gt", "gte", "satisfies"] },
  { name: "@claude-code-kit/ink-renderer", mod: inkRenderer, expect: ["Box", "render"] },
  { name: "@claude-code-kit/agent", mod: agent, expect: ["Agent", "MockProvider", "ToolRegistry"] },
  { name: "@claude-code-kit/tools", mod: tools, expect: ["bashTool", "readTool", "grepTool"] },
  { name: "@claude-code-kit/ui", mod: ui, expect: ["MessageList", "DiffView", "AgentREPL"] },
];

let failed = 0;
for (const { name, mod, expect } of cases) {
  const missing = expect.filter((sym) => (mod as Record<string, unknown>)[sym] === undefined);
  if (missing.length > 0) {
    console.error(`FAIL ${name} (tsx): missing exports: ${missing.join(", ")}`);
    failed++;
  } else {
    console.log(`OK   ${name} (tsx): ${expect.join(", ")}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed tsx smoke import.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} packages imported cleanly via tsx.`);
