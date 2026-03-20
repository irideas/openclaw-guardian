import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJsonlLogger } from "./logger.mjs";

// 这是 `local-overrides` 的统一 Node preload 入口。
//
// 它不包含任何具体业务修复逻辑，只负责：
// 1. 读取启用模块配置
// 2. 根据当前 `process.argv` 匹配模块
// 3. 动态加载模块自己的 `preload-hook.mjs`
// 4. 为模块提供统一上下文和日志能力
//
// 这样以后新增覆盖方案时，只需要新增模块，
// 而不需要再为每个方案单独接一条 shell `source`。

const CURRENT_FILE = fileURLToPath(import.meta.url);
const BOOTSTRAP_DIR = path.dirname(CURRENT_FILE);
const REPO_ROOT = path.resolve(BOOTSTRAP_DIR, "..");
const OPENCLAW_HOME = path.resolve(REPO_ROOT, "..");

const RUNTIME_LOG_PATH = path.join(
  OPENCLAW_HOME,
  "logs",
  "local-overrides",
  "runtime.log",
);

const runtimeLog = createJsonlLogger(RUNTIME_LOG_PATH, "bootstrap.node-preload");

function normalize(value) {
  const text = String(value || "").trim();
  return text || null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveEnabledModules() {
  const configPath = path.join(REPO_ROOT, "config", "enabled-modules.json");
  const config = readJson(configPath);
  const enabledModules = Array.isArray(config.enabledModules) ? config.enabledModules : [];
  return { configPath, enabledModules };
}

function extractProvider(args) {
  const providerFlagIndex = args.findIndex((value) => value === "--provider");
  if (providerFlagIndex !== -1) {
    return args[providerFlagIndex + 1] || null;
  }

  const inline = args.find((value) => value.startsWith("--provider="));
  return inline ? inline.slice("--provider=".length) : null;
}

function matchesManifest(manifest, args) {
  const match = manifest.match || {};
  const argvAll = Array.isArray(match.argvAll) ? match.argvAll : [];
  const provider = normalize(match.provider);

  const hasAllArgs = argvAll.every((value) => args.includes(value));
  if (!hasAllArgs) return false;

  if (provider && extractProvider(args) !== provider) {
    return false;
  }

  return true;
}

function parseForcedModules() {
  const raw = normalize(process.env.OPENCLAW_LOCAL_OVERRIDES_FORCE_MODULES);
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

async function activateModule(moduleId, manifest, moduleDir) {
  const preloadEntry = manifest.entry?.preload;
  if (!preloadEntry) {
    runtimeLog("module_skipped", {
      moduleId,
      reason: "preload_entry_missing",
    });
    return;
  }

  const logFileName = normalize(manifest.logging?.file) || `${moduleId}.log`;
  const moduleLogPath = path.join(
    OPENCLAW_HOME,
    "logs",
    "local-overrides",
    logFileName,
  );
  const moduleLog = createJsonlLogger(moduleLogPath, moduleId);

  try {
    const hookPath = path.join(moduleDir, preloadEntry);
    const hookModule = await import(pathToFileURL(hookPath).href);
    if (typeof hookModule.activate !== "function") {
      moduleLog("module_skipped", { reason: "activate_missing", hookPath });
      return;
    }

    moduleLog("module_activate_start", {
      argv: process.argv,
      moduleDir,
    });

    await hookModule.activate({
      repoRoot: REPO_ROOT,
      openclawHome: OPENCLAW_HOME,
      moduleId,
      moduleDir,
      manifest,
      log: moduleLog,
      runtimeLog,
    });

    moduleLog("module_activate_done", {
      argv: process.argv,
    });
  } catch (error) {
    moduleLog("module_activate_failed", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
}

async function main() {
  if (process.env.OPENCLAW_LOCAL_OVERRIDES_DISABLE === "1") {
    runtimeLog("runtime_skipped", { reason: "global_disable" });
    return;
  }

  const args = process.argv.slice(2);
  const forcedModules = parseForcedModules();
  const { configPath, enabledModules } = resolveEnabledModules();

  runtimeLog("runtime_loaded", {
    argv: process.argv,
    configPath,
    enabledModules,
    forcedModules: Array.from(forcedModules),
  });

  for (const moduleId of enabledModules) {
    const moduleDir = path.join(REPO_ROOT, "modules", moduleId);
    const manifestPath = path.join(moduleDir, "module.json");

    if (!fs.existsSync(manifestPath)) {
      runtimeLog("module_skipped", {
        moduleId,
        reason: "manifest_missing",
        manifestPath,
      });
      continue;
    }

    const manifest = readJson(manifestPath);
    const forceMatch = forcedModules.has(moduleId);
    const normalMatch = matchesManifest(manifest, args);

    runtimeLog("module_evaluated", {
      moduleId,
      manifestPath,
      forceMatch,
      normalMatch,
    });

    if (!forceMatch && !normalMatch) {
      continue;
    }

    await activateModule(moduleId, manifest, moduleDir);
  }
}

await main();

