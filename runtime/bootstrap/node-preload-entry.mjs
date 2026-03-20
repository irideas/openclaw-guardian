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
// 1. 读取运行时路径和模块配置
// 2. 发现仓库中的模块
// 3. 根据当前 `process.argv`、默认启用规则和强制模块规则决定激活集合
// 4. 动态加载模块自己的 `preload-hook.mjs`
// 5. 为模块提供统一上下文和日志能力
//
// 这样以后新增覆盖方案时，只需要新增模块，
// 而不需要再为每个方案单独接一条 shell `source`。

const RUNTIME_PATHS = resolveRuntimePaths();
const RUNTIME_ROOT = RUNTIME_PATHS.runtimeRoot;
const REPO_ROOT = RUNTIME_PATHS.repoRoot;
const OPENCLAW_HOME = RUNTIME_PATHS.openclawHome;
const LOG_DIR = RUNTIME_PATHS.logDir;
const RUNTIME_LOG_PATH = path.join(LOG_DIR, "runtime.log");

const runtimeLog = createJsonlLogger(RUNTIME_LOG_PATH, "bootstrap.node-preload");

async function activateModule(moduleId, manifest, moduleDir) {
  // 在真正 import 模块前先做 schema 校验。
  // 这样可以把“模块配置错误”与“模块运行时异常”清晰分开。
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
    // 模块入口固定由 manifest 声明，运行时不对模块类型做额外猜测。
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
    // 统一运行时也保留一个全局禁用开关，便于排查“是不是 override 导致的问题”。
    runtimeLog("runtime_skipped", { reason: "global_disable" });
    return;
  }

  const args = process.argv.slice(2);
  const forcedModules = parseForcedModules();
  const configPath = RUNTIME_PATHS.configPath;
  const discoveredModules = discoverModuleManifests(RUNTIME_ROOT);
  const activeModuleIds = resolveActiveModuleIds(RUNTIME_ROOT, configPath);
  const activeSet = new Set(activeModuleIds);

  // `runtime_loaded` 记录的是本次进程级调度上下文。
  // 它可以帮助我们区分：
  // - 这次一共发现了哪些模块
  // - 哪些模块按配置是活跃的
  // - 有没有强制模块参与
  runtimeLog("runtime_loaded", {
    argv: process.argv,
    configPath,
    discoveredModules: discoveredModules.map(({ moduleId }) => moduleId),
    activeModuleIds,
    forcedModules: Array.from(forcedModules),
  });

  for (const { moduleId, manifestPath, manifest } of discoveredModules) {
    // 模块是否激活有三层信号：
    // 1. `activeByConfig`：是否经过默认启用/显式启停规则求值得到激活
    // 2. `forceMatch`：是否被强制模块列表命中
    // 3. `normalMatch`：在已激活前提下，当前命令是否命中 manifest 匹配规则
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
      // manifest 缺失或损坏时，不阻断其他模块，只把这个模块记为跳过。
      runtimeLog("module_skipped", {
        moduleId,
        reason: "manifest_missing",
        manifestPath,
      });
      continue;
    }

    // 到这里说明模块已经满足“应该尝试激活”的条件，
    // 后续的 schema 校验和模块执行交给 `activateModule()`。
    const moduleDir = path.join(RUNTIME_ROOT, "modules", moduleId);
    await activateModule(moduleId, manifest, moduleDir);
  }
}

await main();
