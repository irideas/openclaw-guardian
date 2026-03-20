import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function readOpenClawConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function resolveOpenClawRootFromPath(filePath) {
  try {
    const real = fs.realpathSync(filePath);
    const stat = fs.statSync(real);
    if (!stat.isFile()) return null;

    const base = path.basename(real);
    if (base === "openclaw.mjs") {
      return path.dirname(real);
    }

    if (base === "openclaw") {
      return path.resolve(path.dirname(real), "..", "lib", "node_modules", "openclaw");
    }
  } catch {
    return null;
  }

  return null;
}

function resolveBundledOpenClawRoot() {
  const override = process.env.OPENCLAW_GUARDIAN_OPENCLAW_ROOT;
  if (override && pathExists(path.join(override, "extensions", "feishu", "index.ts"))) {
    return override;
  }

  const fromArgv = resolveOpenClawRootFromPath(process.argv[1] || "");
  if (fromArgv) return fromArgv;

  const fromPath = spawnSync("bash", ["-lc", "type -P openclaw"], {
    encoding: "utf8",
  });
  if (fromPath.status === 0) {
    const candidate = resolveOpenClawRootFromPath(fromPath.stdout.trim());
    if (candidate) return candidate;
  }

  try {
    const versionRoot = path.resolve(process.execPath, "..", "..");
    const candidate = path.join(versionRoot, "lib", "node_modules", "openclaw");
    if (pathExists(path.join(candidate, "openclaw.mjs"))) {
      return candidate;
    }
  } catch {
    // 继续返回 null。
  }

  return null;
}

export function inspectState(context) {
  const openclawHome = context.openclawHome || path.join(os.homedir(), ".openclaw");
  const configPath = path.join(openclawHome, "openclaw.json");
  const externalFeishuDir = path.join(openclawHome, "extensions", "feishu");
  const backupRoot = path.join(openclawHome, ".extensions-backup");
  const config = readOpenClawConfig(configPath);
  const plugins = config.plugins && typeof config.plugins === "object" ? config.plugins : {};
  const bundledOpenClawRoot = resolveBundledOpenClawRoot();
  const bundledFeishuIndex = bundledOpenClawRoot
    ? path.join(bundledOpenClawRoot, "extensions", "feishu", "index.ts")
    : null;

  return {
    openclawHome,
    configPath,
    backupRoot,
    externalFeishuDir,
    externalFeishuExists: pathExists(externalFeishuDir),
    bundledOpenClawRoot,
    bundledFeishuExists: bundledFeishuIndex ? pathExists(bundledFeishuIndex) : false,
    bundledFeishuIndex,
    allowConfigured: Array.isArray(plugins.allow) && plugins.allow.length > 0,
    installsFeishu:
      !!plugins.installs &&
      typeof plugins.installs === "object" &&
      Object.prototype.hasOwnProperty.call(plugins.installs, "feishu"),
  };
}

function buildFindings(state, t) {
  if (!state.bundledFeishuExists) {
    return [];
  }

  if (!state.externalFeishuExists && !state.installsFeishu) {
    return [];
  }

  const details = [];
  if (state.externalFeishuExists) {
    details.push(t("preflight.detail.externalDir", { path: state.externalFeishuDir }));
  }
  if (state.installsFeishu) {
    details.push(t("preflight.detail.installRef"));
  }
  if (!state.allowConfigured) {
    details.push(t("preflight.detail.allowMissing"));
  }

  return [
    {
      code: "plugins.feishu_duplicate_id",
      severity: "warning",
      summary: t("preflight.summary"),
      detail: details.join(" "),
      suggestions: [
        t("suggestion.doctor"),
        t("suggestion.repair"),
      ],
    },
  ];
}

export async function runPreflight(context) {
  const state = inspectState(context);

  context.log("preflight_state", {
    externalFeishuExists: state.externalFeishuExists,
    installsFeishu: state.installsFeishu,
    allowConfigured: state.allowConfigured,
    bundledFeishuExists: state.bundledFeishuExists,
  });

  return buildFindings(state, context.t);
}
