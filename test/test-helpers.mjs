import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CURRENT_FILE = fileURLToPath(import.meta.url);
export const TEST_DIR = path.dirname(CURRENT_FILE);
export const REPO_ROOT = path.resolve(TEST_DIR, "..");
export const RUNTIME_ROOT = path.join(REPO_ROOT, "runtime");

export function createTempLogDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-guardian-test-"));
}

export function createTempOpenClawHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-home-"));
  fs.mkdirSync(path.join(root, "extensions"), { recursive: true });
  return root;
}

export function createTempBundledOpenClawRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bundled-openclaw-"));
  fs.mkdirSync(path.join(root, "extensions", "feishu"), { recursive: true });
  fs.writeFileSync(path.join(root, "extensions", "feishu", "index.ts"), "export {};\n", "utf8");
  return root;
}

export function cleanupDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

export function createTempRepoFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-guardian-fixture-"));
  // issue-centric 重构后，夹具需要同时包含：
  // - `issues/`：放 issue 元数据
  // - `runtime/config/`：放启停覆盖
  //
  // 这样测试覆盖的就是“仓库根 + runtime 导出目录”的真实布局。
  fs.mkdirSync(path.join(root, "issues"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "config"), { recursive: true });
  return root;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function resolveProxyForTests() {
  return (
    process.env.OPENCLAW_GUARDIAN_TEST_PROXY_URL ||
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
