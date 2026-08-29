#!/usr/bin/env tsx
/**
 * Collects the TypeScript test files and hands them to `tsx --test`.
 *
 * The glob cannot be left to the shell: npm runs scripts through `sh`, which
 * has no globstar, so the recursive pattern silently expanded to nothing and
 * the suite reported "no tests" without executing one. Node's own test
 * discovery does not help either — it only matches JavaScript extensions.
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const TEST_ROOT = join(ROOT, "src");
const TEST_SUFFIX = ".test.ts";
const IGNORED_DIRS = new Set(["node_modules", "lib", ".git"]);

function collectTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return IGNORED_DIRS.has(entry.name) ? [] : collectTestFiles(path);
    }
    return entry.name.endsWith(TEST_SUFFIX) ? [path] : [];
  });
}

const files = collectTestFiles(TEST_ROOT).sort();

if (files.length === 0) {
  console.error(`No *${TEST_SUFFIX} files found under ${TEST_ROOT}`);
  process.exit(1);
}

const tsx = join(ROOT, "node_modules", ".bin", "tsx");
const child = spawn(tsx, ["--test", ...process.argv.slice(2), ...files], {
  stdio: "inherit",
  cwd: ROOT,
});

child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
