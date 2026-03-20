import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 这里集中放置 “local-overrides 运行时” 的公共能力：
// - 路径推导
// - 配置读取
// - 模块发现
// - manifest 校验
// - 模块匹配
// - 默认启用与显式启停规则
// - 强制模块解析
//
// 这样 `node-preload-entry.mjs` 只保留调度职责，
// 后续新增测试或新入口时也能复用同一套规则。

const CURRENT_FILE = fileURLToPath(import.meta.url);
const BOOTSTRAP_DIR = path.dirname(CURRENT_FILE);
const DEFAULT_RUNTIME_ROOT = path.resolve(BOOTSTRAP_DIR, "..");
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_RUNTIME_ROOT, "..");

export function normalize(value) {
  // 把各种空值、空白串统一归一成 `null`，
  // 可以显著减少后续 schema 校验时的分支复杂度。
  const text = String(value || "").trim();
  return text || null;
}

export function readJson(filePath) {
  // 这里只做“同步读取并解析 JSON”这一件事。
  // 更复杂的容错由调用方自己决定，以便不同调用场景能保留更明确的失败语义。
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function listModuleIds(runtimeRoot) {
  // 模块发现只认 `modules/` 目录下的一层子目录。
  // 这样仓库结构简单直接，也便于后续模板化生成模块。
  const modulesDir = path.join(runtimeRoot, "modules");
  try {
    return fs.readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function readManifest(runtimeRoot, moduleId) {
  // manifest 路径约定固定为：
  // `modules/<module-id>/module.json`
  const manifestPath = path.join(runtimeRoot, "modules", moduleId, "module.json");
  return {
    manifestPath,
    manifest: readJson(manifestPath),
  };
}

export function discoverModuleManifests(runtimeRoot) {
  // 这里即使某个模块 manifest 读取失败，也不会中断整个发现流程。
  // 原因是：
  // - 运行时应该尽量把“坏模块”和“好模块”隔离开
  // - 后续日志里仍然需要知道哪个模块的 manifest 缺失或损坏
  const discovered = [];
  for (const moduleId of listModuleIds(runtimeRoot)) {
    try {
      const { manifestPath, manifest } = readManifest(runtimeRoot, moduleId);
      discovered.push({ moduleId, manifestPath, manifest });
    } catch {
      discovered.push({ moduleId, manifestPath: path.join(runtimeRoot, "modules", moduleId, "module.json"), manifest: null });
    }
  }
  return discovered;
}

export function resolveRuntimePaths(env = process.env) {
  // 所有运行时路径都允许被环境变量覆盖。
  // 这样测试可以把日志目录、配置文件和仓库根切到临时目录，
  // 而正式运行时则回退到约定的默认路径。
  const runtimeRoot = normalize(env.OPENCLAW_LOCAL_OVERRIDES_RUNTIME_ROOT) || DEFAULT_RUNTIME_ROOT;
  const repoRoot = normalize(env.OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT) || DEFAULT_REPO_ROOT;
  const openclawHome = normalize(env.OPENCLAW_LOCAL_OVERRIDES_HOME) || path.resolve(repoRoot, "..");
  const logDir =
    normalize(env.OPENCLAW_LOCAL_OVERRIDES_LOG_DIR) ||
    path.join(openclawHome, "logs", "local-overrides");
  const configPath =
    normalize(env.OPENCLAW_LOCAL_OVERRIDES_CONFIG_PATH) ||
    path.join(runtimeRoot, "config", "enabled-modules.json");

  return {
    runtimeRoot,
    repoRoot,
    openclawHome,
    logDir,
    configPath,
  };
}

export function extractProvider(args) {
  // `openclaw` CLI 常见的 provider 写法有两种：
  // - `--provider openai-codex`
  // - `--provider=openai-codex`
  //
  // 这里统一抽出来，避免匹配逻辑在各处重复实现。
  const providerFlagIndex = args.findIndex((value) => value === "--provider");
  if (providerFlagIndex !== -1) {
    return args[providerFlagIndex + 1] || null;
  }

  const inline = args.find((value) => value.startsWith("--provider="));
  return inline ? inline.slice("--provider=".length) : null;
}

export function matchesManifest(manifest, args) {
  // 当前版本的匹配策略比较保守：
  // - `argvAll` 中列出的参数必须全部出现
  // - 如果声明了 `provider`，则要求 provider 精确匹配
  //
  // 这种方式虽然简单，但对 CLI 子命令型模块已经够稳定。
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

export function parseForcedModules(env = process.env) {
  // 强制模块主要给调试和测试使用。
  // 一旦模块被加入这个列表，即使当前命令不匹配，也会被运行时强制激活。
  const raw = normalize(env.OPENCLAW_LOCAL_OVERRIDES_FORCE_MODULES);
  if (!raw) return new Set();

  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function validateManifest(moduleId, manifest) {
  // 这里承担最基本的 manifest schema 校验。
  //
  // 当前选择“手写校验”而不是引入 JSON Schema 依赖，原因是：
  // - 仓库体量还小
  // - 运行时依赖越少越容易在本地环境直接工作
  // - 测试已经能为这些规则提供回归保护
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, reason: "manifest_invalid" };
  }

  if (normalize(manifest.id) !== moduleId) {
    return { ok: false, reason: "manifest_id_mismatch" };
  }

  if (normalize(manifest.kind) !== "node-preload") {
    return { ok: false, reason: "manifest_kind_invalid" };
  }

  if (
    manifest.enabledByDefault !== undefined &&
    typeof manifest.enabledByDefault !== "boolean"
  ) {
    return { ok: false, reason: "enabled_by_default_invalid" };
  }

  if (!normalize(manifest.entry?.preload)) {
    return { ok: false, reason: "preload_entry_missing" };
  }

  if (
    manifest.env !== undefined &&
    (typeof manifest.env !== "object" || Array.isArray(manifest.env))
  ) {
    return { ok: false, reason: "env_invalid" };
  }

  if (
    manifest.env?.variables !== undefined &&
    (!Array.isArray(manifest.env.variables) ||
      manifest.env.variables.some((value) => normalize(value) === null))
  ) {
    return { ok: false, reason: "env_variables_invalid" };
  }

  return { ok: true, reason: null };
}

export function resolveEnabledModules(configPath) {
  // 配置文件中的 `enabledModules` 是“显式追加启用”。
  const config = readJson(configPath);
  return Array.isArray(config.enabledModules) ? config.enabledModules : [];
}

export function resolveDisabledModules(configPath) {
  // 配置文件中的 `disabledModules` 优先级高于默认启用和显式启用。
  const config = readJson(configPath);
  return Array.isArray(config.disabledModules) ? config.disabledModules : [];
}

export function isEnabledByDefault(manifest) {
  // 默认启用状态来自模块自身，而不是集中配置。
  // 这样一个模块是否“默认打开”属于模块元数据，而不是用户本地状态。
  return manifest?.enabledByDefault === true;
}

export function resolveActiveModuleIds(runtimeRoot, configPath) {
  // 当前活动模块的求值顺序：
  // 1. 先发现所有模块
  // 2. 选出 `enabledByDefault: true` 的模块
  // 3. 合并配置里的 `enabledModules`
  // 4. 最后减去配置里的 `disabledModules`
  //
  // 这样“默认策略”和“本地覆盖策略”就能明确分层。
  const discovered = discoverModuleManifests(runtimeRoot);
  const defaults = discovered
    .filter(({ manifest }) => manifest && isEnabledByDefault(manifest))
    .map(({ moduleId }) => moduleId);

  let enabledModules = [];
  let disabledModules = [];

  try {
    enabledModules = resolveEnabledModules(configPath);
    disabledModules = resolveDisabledModules(configPath);
  } catch {
    enabledModules = [];
    disabledModules = [];
  }

  const active = new Set([...defaults, ...enabledModules]);
  for (const moduleId of disabledModules) {
    active.delete(moduleId);
  }

  return Array.from(active).sort();
}

export function resolveModuleLogPath(logDir, manifest, moduleId) {
  // 模块日志文件名优先使用 manifest 指定值，
  // 否则退回到 `<module-id>.log`，保证每个模块至少有稳定的默认日志路径。
  const logFileName = normalize(manifest.logging?.file) || `${moduleId}.log`;
  return path.join(logDir, logFileName);
}
