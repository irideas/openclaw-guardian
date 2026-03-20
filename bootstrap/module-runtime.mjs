import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 这里集中放置 “local-overrides 运行时” 的公共能力：
// - 路径推导
// - 配置读取
// - 模块匹配
// - 强制模块解析
//
// 这样 `node-preload-entry.mjs` 只保留调度职责，
// 后续新增测试或新入口时也能复用同一套规则。

const CURRENT_FILE = fileURLToPath(import.meta.url);
const BOOTSTRAP_DIR = path.dirname(CURRENT_FILE);
const DEFAULT_REPO_ROOT = path.resolve(BOOTSTRAP_DIR, "..");

export function normalize(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function listModuleIds(repoRoot) {
  const modulesDir = path.join(repoRoot, "modules");
  try {
    return fs.readdirSync(modulesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function readManifest(repoRoot, moduleId) {
  const manifestPath = path.join(repoRoot, "modules", moduleId, "module.json");
  return {
    manifestPath,
    manifest: readJson(manifestPath),
  };
}

export function discoverModuleManifests(repoRoot) {
  const discovered = [];
  for (const moduleId of listModuleIds(repoRoot)) {
    try {
      const { manifestPath, manifest } = readManifest(repoRoot, moduleId);
      discovered.push({ moduleId, manifestPath, manifest });
    } catch {
      discovered.push({ moduleId, manifestPath: path.join(repoRoot, "modules", moduleId, "module.json"), manifest: null });
    }
  }
  return discovered;
}

export function resolveRuntimePaths(env = process.env) {
  const repoRoot = normalize(env.OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT) || DEFAULT_REPO_ROOT;
  const openclawHome = normalize(env.OPENCLAW_LOCAL_OVERRIDES_HOME) || path.resolve(repoRoot, "..");
  const logDir =
    normalize(env.OPENCLAW_LOCAL_OVERRIDES_LOG_DIR) ||
    path.join(openclawHome, "logs", "local-overrides");
  const configPath =
    normalize(env.OPENCLAW_LOCAL_OVERRIDES_CONFIG_PATH) ||
    path.join(repoRoot, "config", "enabled-modules.json");

  return {
    repoRoot,
    openclawHome,
    logDir,
    configPath,
  };
}

export function extractProvider(args) {
  const providerFlagIndex = args.findIndex((value) => value === "--provider");
  if (providerFlagIndex !== -1) {
    return args[providerFlagIndex + 1] || null;
  }

  const inline = args.find((value) => value.startsWith("--provider="));
  return inline ? inline.slice("--provider=".length) : null;
}

export function matchesManifest(manifest, args) {
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
    manifest.compat !== undefined &&
    (typeof manifest.compat !== "object" || Array.isArray(manifest.compat))
  ) {
    return { ok: false, reason: "compat_invalid" };
  }

  if (
    normalize(manifest.compat?.legacyShellInit) === null &&
    manifest.compat?.legacyShellInit !== undefined
  ) {
    return { ok: false, reason: "compat_legacy_shell_init_invalid" };
  }

  if (
    normalize(manifest.compat?.legacyPreload) === null &&
    manifest.compat?.legacyPreload !== undefined
  ) {
    return { ok: false, reason: "compat_legacy_preload_invalid" };
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
  const config = readJson(configPath);
  return Array.isArray(config.enabledModules) ? config.enabledModules : [];
}

export function resolveDisabledModules(configPath) {
  const config = readJson(configPath);
  return Array.isArray(config.disabledModules) ? config.disabledModules : [];
}

export function isEnabledByDefault(manifest) {
  return manifest?.enabledByDefault === true;
}

export function resolveActiveModuleIds(repoRoot, configPath) {
  const discovered = discoverModuleManifests(repoRoot);
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
  const logFileName = normalize(manifest.logging?.file) || `${moduleId}.log`;
  return path.join(logDir, logFileName);
}
