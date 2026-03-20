import fs from "node:fs";
import path from "node:path";
import { inspectState } from "./preflight.mjs";

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function removeFeishuInstallRef(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (
    !config.plugins ||
    typeof config.plugins !== "object" ||
    !config.plugins.installs ||
    typeof config.plugins.installs !== "object" ||
    !Object.prototype.hasOwnProperty.call(config.plugins.installs, "feishu")
  ) {
    return false;
  }

  delete config.plugins.installs.feishu;
  if (Object.keys(config.plugins.installs).length === 0) {
    delete config.plugins.installs;
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return true;
}

function buildBackupPath(state) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(state.backupRoot, `feishu-${stamp}`);
}

export async function runRepair(context) {
  const state = inspectState(context);
  const actions = [];
  const warnings = [];

  if (!state.externalFeishuExists && !state.installsFeishu) {
    return {
      status: "noop",
      summary: context.t("repair.noop.summary"),
      actions,
      warnings,
    };
  }

  let backupPath = null;
  if (state.externalFeishuExists) {
    backupPath = buildBackupPath(state);
    actions.push(
      context.t("repair.action.backupExtension", {
        from: state.externalFeishuDir,
        to: backupPath,
      }),
    );
  }

  if (state.installsFeishu) {
    actions.push(context.t("repair.action.removeInstallRef"));
  }

  if (!state.allowConfigured) {
    warnings.push(context.t("repair.warning.allowMissing"));
  }

  if (!context.apply) {
    context.log("repair_plan", {
      apply: false,
      actions,
      warnings,
    });

    return {
      status: "dry-run",
      summary: context.t("repair.dryRun.summary"),
      actions,
      warnings,
    };
  }

  if (state.externalFeishuExists && backupPath) {
    ensureDir(state.backupRoot);
    fs.renameSync(state.externalFeishuDir, backupPath);
  }

  if (state.installsFeishu && fs.existsSync(state.configPath)) {
    removeFeishuInstallRef(state.configPath);
  }

  context.log("repair_apply_done", {
    apply: true,
    backupPath,
    actions,
    warnings,
  });

  return {
    status: "applied",
    summary: context.t("repair.apply.summary"),
    actions,
    warnings,
  };
}
