import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJsonlLogger } from "./logger.mjs";
import {
  resolveRuntimePaths,
  discoverModuleManifests,
  resolveActiveModuleIds,
  resolveModuleLogPath,
  matchesManifest,
  parseForcedModules,
  validateManifest,
} from "./module-runtime.mjs";

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

const RUNTIME_PATHS = resolveRuntimePaths();
const REPO_ROOT = RUNTIME_PATHS.repoRoot;
const OPENCLAW_HOME = RUNTIME_PATHS.openclawHome;
const LOG_DIR = RUNTIME_PATHS.logDir;
const RUNTIME_LOG_PATH = path.join(LOG_DIR, "runtime.log");

const runtimeLog = createJsonlLogger(RUNTIME_LOG_PATH, "bootstrap.node-preload");

async function activateModule(moduleId, manifest, moduleDir) {
  const validation = validateManifest(moduleId, manifest);
  if (!validation.ok) {
    runtimeLog("module_skipped", {
      moduleId,
      reason: validation.reason,
    });
    return;
  }

  const moduleLogPath = resolveModuleLogPath(LOG_DIR, manifest, moduleId);
  const moduleLog = createJsonlLogger(moduleLogPath, moduleId);

  try {
    const hookPath = path.join(moduleDir, manifest.entry.preload);
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
  const configPath = RUNTIME_PATHS.configPath;
  const discoveredModules = discoverModuleManifests(REPO_ROOT);
  const activeModuleIds = resolveActiveModuleIds(REPO_ROOT, configPath);
  const activeSet = new Set(activeModuleIds);

  runtimeLog("runtime_loaded", {
    argv: process.argv,
    configPath,
    discoveredModules: discoveredModules.map(({ moduleId }) => moduleId),
    activeModuleIds,
    forcedModules: Array.from(forcedModules),
  });

  for (const { moduleId, manifestPath, manifest } of discoveredModules) {
    const forceMatch = forcedModules.has(moduleId);
    const activeByConfig = activeSet.has(moduleId);
    const normalMatch = activeByConfig && manifest ? matchesManifest(manifest, args) : false;

    runtimeLog("module_evaluated", {
      moduleId,
      manifestPath,
      activeByConfig,
      forceMatch,
      normalMatch,
    });

    if (!forceMatch && !normalMatch) {
      continue;
    }

    if (!manifest) {
      runtimeLog("module_skipped", {
        moduleId,
        reason: "manifest_missing",
        manifestPath,
      });
      continue;
    }

    const moduleDir = path.join(REPO_ROOT, "modules", moduleId);
    await activateModule(moduleId, manifest, moduleDir);
  }
}

await main();
