// 这是兼容入口。
//
// 旧版本会直接把 `NODE_OPTIONS=--import=<本文件>` 注入到目标命令。
// 新版本已经改为统一 `bootstrap/node-preload-entry.mjs` 路由所有模块。
//
// 为了不破坏已有环境，这里保留一个兼容 preload：
// 它会直接调用模块的新实现，等价于旧入口仍然可用。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJsonlLogger } from "../bootstrap/logger.mjs";
import { activate } from "../modules/openai-codex-auth-proxy/preload-hook.mjs";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const CURRENT_DIR = path.dirname(CURRENT_FILE);
const REPO_ROOT = path.resolve(CURRENT_DIR, "..");
const OPENCLAW_HOME = path.resolve(REPO_ROOT, "..");
const LOG_PATH = process.env.OPENCLAW_PROXY_PRELOAD_LOG_PATH ||
  path.join(OPENCLAW_HOME, "logs", "local-overrides", "openai-codex-auth-proxy.log");

const log = createJsonlLogger(LOG_PATH, "openai-codex-auth-proxy.compat");

log("compat_preload_loaded", {
  argv: process.argv,
});

await activate({
  repoRoot: REPO_ROOT,
  openclawHome: OPENCLAW_HOME,
  moduleId: "openai-codex-auth-proxy",
  moduleDir: path.join(REPO_ROOT, "modules", "openai-codex-auth-proxy"),
  manifest: {
    id: "openai-codex-auth-proxy",
  },
  log,
  runtimeLog: log,
});
