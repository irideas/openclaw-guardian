import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CURRENT_FILE = fileURLToPath(import.meta.url);
export const TEST_DIR = path.dirname(CURRENT_FILE);
export const REPO_ROOT = path.resolve(TEST_DIR, "..");

export function createTempLogDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-local-overrides-test-"));
}

export function cleanupDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

export function createTempRepoFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-local-overrides-fixture-"));
  fs.mkdirSync(path.join(root, "modules"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  return root;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function resolveProxyForTests() {
  return (
    process.env.OPENCLAW_PROXY_TEST_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "http://127.0.0.1:7897"
  );
}

export function runProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
}

export function hasOpenClawBinary() {
  const result = runProcess("bash", ["-lc", "type -P openclaw"]);
  return result.status === 0 && Boolean(result.stdout.trim());
}
