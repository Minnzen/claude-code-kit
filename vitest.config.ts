import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude git worktrees created by Claude Code agents (.claude/worktrees/)
    // so vitest does not re-run duplicate copies of tests from those directories.
    exclude: [".claude/**", "node_modules/**"],
  },
  resolve: {
    alias: [
      {
        find: /^@claude-code-kit\/ink-renderer$/,
        replacement: resolve(__dirname, "packages/ink-renderer/src/index.ts"),
      },
      {
        find: /^react$/,
        replacement: resolve(__dirname, "packages/ink-renderer/node_modules/react/index.js"),
      },
      // zod is only installed inside packages/agent; alias it so root-level
      // tests can use a clean `import { z } from 'zod'` instead of a deep
      // relative path into node_modules.
      {
        find: /^zod$/,
        replacement: resolve(__dirname, "packages/agent/node_modules/zod/index.js"),
      },
    ],
  },
});
