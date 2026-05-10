// Cross-environment smoke (CJS mode).
//
// Mirrors esm.mjs but exercises the require() path. Validates that our dual
// CJS+ESM build does not break consumers that still use CJS.

const cases = [
  { pkg: "@claude-code-kit/shared", expect: ["gt", "gte", "satisfies"] },
  { pkg: "@claude-code-kit/ink-renderer", expect: ["Box", "render"] },
  { pkg: "@claude-code-kit/agent", expect: ["Agent", "MockProvider", "ToolRegistry"] },
  { pkg: "@claude-code-kit/tools", expect: ["bashTool", "readTool", "grepTool"] },
  { pkg: "@claude-code-kit/ui", expect: ["MessageList", "DiffView", "AgentREPL"] },
];

let failed = 0;
for (const { pkg, expect } of cases) {
  try {
    const mod = require(pkg);
    const missing = expect.filter((name) => mod[name] === undefined);
    if (missing.length > 0) {
      console.error(`FAIL ${pkg} (cjs): missing exports: ${missing.join(", ")}`);
      failed++;
    } else {
      console.log(`OK   ${pkg} (cjs): ${expect.join(", ")}`);
    }
  } catch (err) {
    console.error(`FAIL ${pkg} (cjs): ${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed CJS smoke import.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} packages imported cleanly via CJS.`);
