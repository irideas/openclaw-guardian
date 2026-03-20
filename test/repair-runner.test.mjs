import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runRepair } from "../core/repair-runner.mjs";
import {
  cleanupDir,
  createTempBundledOpenClawRoot,
  createTempLogDir,
  createTempOpenClawHome,
  REPO_ROOT,
  RUNTIME_ROOT,
  writeJson,
} from "./test-helpers.mjs";

test("runRepair dry-run 应当生成修复计划但不修改文件", async () => {
  const openclawHome = createTempOpenClawHome();
  const bundledRoot = createTempBundledOpenClawRoot();
  const logDir = createTempLogDir();
  const output = [];

  try {
    const externalDir = path.join(openclawHome, "extensions", "feishu");
    fs.mkdirSync(externalDir, { recursive: true });
    writeJson(path.join(openclawHome, "openclaw.json"), {
      plugins: {
        installs: {
          feishu: {
            source: "local"
          }
        }
      }
    });

    const result = await runRepair({
      issueId: "plugins-feishu-duplicate-id",
      apply: false,
      env: {
        ...process.env,
        LANG: "en_US.UTF-8",
        OPENCLAW_GUARDIAN_HOME: openclawHome,
        OPENCLAW_GUARDIAN_REPO_ROOT: REPO_ROOT,
        OPENCLAW_GUARDIAN_RUNTIME_ROOT: RUNTIME_ROOT,
        OPENCLAW_GUARDIAN_LOG_DIR: logDir,
        OPENCLAW_GUARDIAN_OPENCLAW_ROOT: bundledRoot,
      },
      write: (text) => output.push(text),
    });

    assert.equal(result.status, "dry-run");
    assert.equal(fs.existsSync(externalDir), true);
    assert.match(output.join(""), /Dry-run prepared a repair plan/);
    assert.match(output.join(""), /Remove the explicit `plugins\.installs\.feishu` reference/);
  } finally {
    cleanupDir(openclawHome);
    cleanupDir(bundledRoot);
    cleanupDir(logDir);
  }
});

test("runRepair apply 应当备份本地扩展并移除安装引用", async () => {
  const openclawHome = createTempOpenClawHome();
  const bundledRoot = createTempBundledOpenClawRoot();
  const logDir = createTempLogDir();

  try {
    const externalDir = path.join(openclawHome, "extensions", "feishu");
    fs.mkdirSync(externalDir, { recursive: true });
    fs.writeFileSync(path.join(externalDir, "index.ts"), "export {};\n", "utf8");
    writeJson(path.join(openclawHome, "openclaw.json"), {
      plugins: {
        installs: {
          feishu: {
            source: "local"
          }
        }
      }
    });

    const result = await runRepair({
      issueId: "plugins-feishu-duplicate-id",
      apply: true,
      env: {
        ...process.env,
        LANG: "zh_CN.UTF-8",
        OPENCLAW_GUARDIAN_HOME: openclawHome,
        OPENCLAW_GUARDIAN_REPO_ROOT: REPO_ROOT,
        OPENCLAW_GUARDIAN_RUNTIME_ROOT: RUNTIME_ROOT,
        OPENCLAW_GUARDIAN_LOG_DIR: logDir,
        OPENCLAW_GUARDIAN_OPENCLAW_ROOT: bundledRoot,
      },
      write: () => {},
    });

    assert.equal(result.status, "applied");
    assert.equal(fs.existsSync(externalDir), false);

    const backups = fs.readdirSync(path.join(openclawHome, ".extensions-backup"));
    assert.equal(backups.length, 1);

    const config = JSON.parse(fs.readFileSync(path.join(openclawHome, "openclaw.json"), "utf8"));
    assert.equal(config.plugins.installs, undefined);
  } finally {
    cleanupDir(openclawHome);
    cleanupDir(bundledRoot);
    cleanupDir(logDir);
  }
});
