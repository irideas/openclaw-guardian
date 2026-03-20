import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runPreflights } from "../core/preflight-runner.mjs";
import {
  cleanupDir,
  createTempBundledOpenClawRoot,
  createTempLogDir,
  createTempOpenClawHome,
  REPO_ROOT,
  RUNTIME_ROOT,
  writeJson,
} from "./test-helpers.mjs";

test("runPreflights 应当输出匹配 issue 的中文提示", async () => {
  const openclawHome = createTempOpenClawHome();
  const bundledRoot = createTempBundledOpenClawRoot();
  const logDir = createTempLogDir();
  const output = [];

  try {
    fs.mkdirSync(path.join(openclawHome, "extensions", "feishu"), { recursive: true });
    writeJson(path.join(openclawHome, "openclaw.json"), {
      plugins: {},
    });

    const findings = await runPreflights({
      env: {
        ...process.env,
        LANG: "zh_CN.UTF-8",
        OPENCLAW_GUARDIAN_HOME: openclawHome,
        OPENCLAW_GUARDIAN_REPO_ROOT: REPO_ROOT,
        OPENCLAW_GUARDIAN_RUNTIME_ROOT: RUNTIME_ROOT,
        OPENCLAW_GUARDIAN_LOG_DIR: logDir,
        OPENCLAW_GUARDIAN_OPENCLAW_ROOT: bundledRoot,
      },
      argv: ["gateway", "restart"],
      write: (text) => output.push(text),
    });

    assert.equal(findings.length, 1);
    assert.match(output.join(""), /检测到额外的本地 `feishu` 插件/);
    assert.match(output.join(""), /guardian repair plugins-feishu-duplicate-id --dry-run/);
  } finally {
    cleanupDir(openclawHome);
    cleanupDir(bundledRoot);
    cleanupDir(logDir);
  }
});
