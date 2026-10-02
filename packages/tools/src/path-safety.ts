import * as fs from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";

function contains(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

async function resolveExistingAncestor(candidate: string): Promise<string> {
  try {
    return await fs.realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A dangling symlink cannot establish containment for a newly created target.
    const entry = await fs.lstat(candidate).catch((statError: NodeJS.ErrnoException) => {
      if (statError.code !== "ENOENT") throw statError;
      return undefined;
    });
    if (entry?.isSymbolicLink()) {
      throw new Error("path traversal denied: unresolved symbolic link");
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) throw error;
    return path.join(await resolveExistingAncestor(parent), path.basename(candidate));
  }
}

/** Resolve existing targets and the nearest existing parent of a new target. */
export async function resolveContainedPath(
  workingDirectory: string,
  requestedPath: string,
): Promise<string> {
  const root = path.resolve(workingDirectory);
  const realRoot = await fs.realpath(root);
  const candidate = path.resolve(root, requestedPath);
  const denied = () =>
    new Error(`path traversal denied — ${requestedPath} escapes working directory`);
  if (!contains(root, candidate) && !contains(realRoot, candidate)) throw denied();
  const resolved = await resolveExistingAncestor(candidate);
  if (!contains(realRoot, resolved)) throw denied();
  return resolved;
}

export async function validateGlobScope(
  pattern: string,
  searchDirectory: string,
  workingDirectory: string,
): Promise<void> {
  const positivePattern = pattern.startsWith("!") ? pattern.slice(1) : pattern;
  for (const task of fg.generateTasks(positivePattern)) {
    await resolveContainedPath(workingDirectory, path.resolve(searchDirectory, task.base));
  }
}
