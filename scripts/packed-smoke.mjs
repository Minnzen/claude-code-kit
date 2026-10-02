import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(path.join(tmpdir(), "claude-code-kit-packed-"));
const artifacts = path.join(workspace, "artifacts");
const npmUserConfig = path.join(workspace, "npmrc");
const packageNames = ["shared", "ink-renderer", "agent", "tools", "ui"];
const nodeCommand = process.env.PACKED_SMOKE_NODE ?? process.execPath;
const env = {
  ...process.env,
  NODE_PATH: "",
  NODE_AUTH_TOKEN: "",
  NPM_TOKEN: "",
  npm_config_userconfig: npmUserConfig,
  npm_config_globalconfig: path.join(workspace, "global-npmrc"),
  npm_config_registry: "https://registry.npmjs.org/",
  npm_config_cache: path.join(workspace, "npm-cache"),
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_engine_strict: "true",
};

for (const key of Object.keys(env)) {
  if (/token|auth/i.test(key)) delete env[key];
}

function run(command, args, cwd, overrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...overrides },
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`,
    );
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Private-mode CSI sequences are expected in terminal output.
  return stripVTControlCharacters(result.stdout.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")).trim();
}

try {
  await mkdir(artifacts);
  await writeFile(npmUserConfig, "registry=https://registry.npmjs.org/\naudit=false\nfund=false\n");
  await writeFile(env.npm_config_globalconfig, "");
  const dependencies = {};
  for (const name of packageNames) {
    const source = JSON.parse(
      await readFile(path.join(root, "packages", name, "package.json"), "utf8"),
    );
    assert.equal(source.engines.node, ">=22.0.0");
    const packed = JSON.parse(
      run(
        "pnpm",
        ["pack", "--json", "--pack-destination", artifacts],
        path.join(root, "packages", name),
        { npm_config_engine_strict: "false" },
      ),
    );
    const filename = packed.filename ?? packed[0]?.filename;
    assert.ok(filename, `No tarball filename for ${source.name}`);
    const tarball = path.isAbsolute(filename) ? filename : path.join(artifacts, filename);
    const manifest = JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"], root));
    assert.equal(manifest.version, source.version);
    for (const spec of Object.values(manifest.dependencies ?? {})) {
      assert.ok(
        !spec.startsWith("workspace:") && spec !== "*",
        "Packed runtime dependencies must be installable and bounded",
      );
    }
    dependencies[source.name] = `file:${tarball}`;
    console.log(`Packed ${source.name}@${source.version}`);
  }

  const peers = { react: "19.2.4", "react-reconciler": "0.33.0", zod: "4.3.6" };
  const developerDependencies = { tsx: "4.21.0", "@xterm/headless": "6.0.0" };
  for (const kind of ["full", "ui-only"]) {
    const project = path.join(workspace, kind);
    await mkdir(project);
    const selected =
      kind === "full"
        ? dependencies
        : Object.fromEntries(
            Object.entries(dependencies).filter(
              ([name]) => !["@claude-code-kit/agent", "@claude-code-kit/tools"].includes(name),
            ),
          );
    await writeFile(
      path.join(project, "package.json"),
      JSON.stringify(
        {
          name: `packed-smoke-${kind}`,
          private: true,
          type: "module",
          dependencies: { ...selected, ...peers },
          devDependencies: developerDependencies,
        },
        null,
        2,
      ),
    );
    // npm installs the same file tarballs a consumer receives, outside the repository.
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project);
    const installedProject = await realpath(project);
    for (const name of Object.keys(selected)) {
      const installed = await realpath(path.join(project, "node_modules", name));
      assert.ok(
        installed.startsWith(installedProject + path.sep),
        `${name} resolves outside the isolated install`,
      );
      assert.ok(!installed.startsWith(root + path.sep), `${name} resolved to the workspace`);
    }
    if (kind === "full") {
      for (const filename of ["esm.mjs", "cjs.cjs", "tsx.ts"]) {
        await cp(path.join(root, "tests", "smoke", filename), path.join(project, filename));
      }
      console.log(run(nodeCommand, ["esm.mjs"], project));
      console.log(run(nodeCommand, ["cjs.cjs"], project));
      console.log(
        run(nodeCommand, [path.join(project, "node_modules/tsx/dist/cli.mjs"), "tsx.ts"], project),
      );
      await writeFile(
        path.join(project, "agent.mjs"),
        `import assert from 'node:assert/strict';\nimport { Agent, MockProvider } from '@claude-code-kit/agent';\nconst agent = new Agent({ model: 'mock', provider: new MockProvider([[{type:'text',text:'packed response'},{type:'done'}]]) });\nassert.equal(await agent.chat('hello'), 'packed response');\nassert.equal(agent.getMessages().length, 2);\nconsole.log('OK packed headless agent');\n`,
      );
      console.log(run(nodeCommand, ["agent.mjs"], project));
    } else {
      await writeFile(
        path.join(project, "ui.mjs"),
        `import assert from 'node:assert/strict';\nimport { createRequire } from 'node:module';\nimport { Text, Box, render } from '@claude-code-kit/ink-renderer';\nimport { REPL } from '@claude-code-kit/ui';\nconst require = createRequire(import.meta.url);\nassert.equal(typeof render, 'function');\nassert.ok(Text && Box && REPL);\nassert.throws(() => require.resolve('@claude-code-kit/agent'), { code: 'MODULE_NOT_FOUND' });\nassert.ok(require('@claude-code-kit/ui').REPL);\nconsole.log('OK packed UI-only ESM/CJS without optional agent');\n`,
      );
      console.log(run(nodeCommand, ["ui.mjs"], project));
      await writeFile(
        path.join(project, "starter.tsx"),
        `import assert from 'node:assert/strict';\nimport React from 'react';\nimport { Box, Text } from '@claude-code-kit/ink-renderer';\nimport { REPL } from '@claude-code-kit/ui';\nconst component = <Box><Text>Packaged starter</Text></Box>;\nassert.ok(React.isValidElement(component));\nassert.ok(REPL);\nconsole.log('OK packed UI starter TSX');\n`,
      );
      console.log(
        run(
          nodeCommand,
          [path.join(project, "node_modules/tsx/dist/cli.mjs"), "starter.tsx"],
          project,
        ),
      );
    }
    await cp(
      path.join(root, "scripts", "packed-terminal.tsx"),
      path.join(project, "packed-terminal.tsx"),
    );
    console.log(
      run(
        nodeCommand,
        [path.join(project, "node_modules/tsx/dist/cli.mjs"), "packed-terminal.tsx"],
        project,
      ),
    );
    console.log(
      `OK isolated ${kind} tarball install (${run(nodeCommand, ["--version"], project)})`,
    );
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}
