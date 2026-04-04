import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // zod is only installed inside packages/agent; alias it so root-level
      // tests can use a clean `import { z } from 'zod'` instead of a deep
      // relative path into node_modules.
      zod: resolve(__dirname, "packages/agent/node_modules/zod/index.js"),
    },
  },
});
