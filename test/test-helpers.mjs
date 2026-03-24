import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CURRENT_FILE = fileURLToPath(import.meta.url);
export const TEST_DIR = path.dirname(CURRENT_FILE);
export const REPO_ROOT = path.resolve(TEST_DIR, "..");
export const BRIDGE_ROOT = path.join(REPO_ROOT, "bridge");

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
  // - `bridge/config/`：放启停覆盖
  //
  // 这样测试覆盖的就是“仓库根 + bridge 导出目录”的真实布局。
  fs.mkdirSync(path.join(root, "issues"), { recursive: true });
  fs.mkdirSync(path.join(root, "bridge", "config"), { recursive: true });
  return root;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function resolveProxyForTests() {
  // 测试代理必须由仓库自己显式控制，不能被开发机当前 shell
  // 里的 `HTTP_PROXY/HTTPS_PROXY` 偶然值污染。
  //
  // 优先级只保留两层：
  // 1. 显式传入 `OPENCLAW_GUARDIAN_TEST_PROXY_URL`
  // 2. 仓库约定的本地 HTTP 代理默认值
  return process.env.OPENCLAW_GUARDIAN_TEST_PROXY_URL || "http://127.0.0.1:7897";
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
