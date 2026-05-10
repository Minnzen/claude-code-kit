// Cross-environment smoke (ESM mode).
//
// Catches the class of regression that 0.3.1 had to fix:
//   `Dynamic require of "semver" is not supported` when a CJS-only require()
//   leaks into native ESM loaders.
//
// Each package is loaded via `import()` and one of its named exports is
// asserted to exist. Any load error or missing export fails the script.

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
    const mod = await import(pkg);
    const missing = expect.filter((name) => mod[name] === undefined);
    if (missing.length > 0) {
      console.error(`FAIL ${pkg} (esm): missing exports: ${missing.join(", ")}`);
      failed++;
    } else {
      console.log(`OK   ${pkg} (esm): ${expect.join(", ")}`);
    }
  } catch (err) {
    console.error(`FAIL ${pkg} (esm): ${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} package(s) failed ESM smoke import.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} packages imported cleanly via ESM.`);
