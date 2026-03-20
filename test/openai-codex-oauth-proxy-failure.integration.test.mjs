import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createTempLogDir,
  cleanupDir,
  hasOpenClawBinary,
  REPO_ROOT,
  resolveProxyForTests,
  runProcess,
} from "./test-helpers.mjs";

const BOOTSTRAP_ENTRY = path.join(REPO_ROOT, "runtime", "bootstrap", "node-entry.mjs");
const BOOTSTRAP_BASH = path.join(REPO_ROOT, "runtime", "bootstrap", "bash-init.bash");
const ISSUE_ID = "openai-codex-oauth-proxy-failure";
const ISSUE_LOG = "openai-codex-oauth-proxy-failure.log";

test("统一 runtime 路由应能跑通 openai-codex OAuth 代理问题的假 token 交换", () => {
  const logDir = createTempLogDir();
  const proxy = resolveProxyForTests();

  try {
    const env = {
      ...process.env,
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      OPENCLAW_GUARDIAN_LOG_DIR: logDir,
      OPENCLAW_GUARDIAN_FORCE_ISSUES: ISSUE_ID,
    };
    delete env.ALL_PROXY;
    delete env.all_proxy;

    const script = `
      const res = await fetch("https://auth.openai.com/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
          redirect_uri: "http://localhost:1455/auth/callback",
          code_verifier: "debug-verifier",
          code: "debug-code"
        })
      });
      console.log(JSON.stringify({ status: res.status, body: await res.text() }));
    `;

    const result = runProcess(
      process.execPath,
      ["--import", BOOTSTRAP_ENTRY, "--input-type=module", "--eval", script],
      { env },
    );

    assert.equal(result.status, 0, result.stderr);

    const payload = JSON.parse(result.stdout.trim());
    assert.equal(payload.status, 401);
    assert.match(payload.body, /token_expired/);

    const runtimeLog = fs.readFileSync(path.join(logDir, "runtime.log"), "utf8");
    const issueLog = fs.readFileSync(path.join(logDir, ISSUE_LOG), "utf8");

    assert.match(runtimeLog, /"activeIssueIds":\[[^\]]*"openai-codex-oauth-proxy-failure"/);
    assert.match(runtimeLog, /"forceMatch":true/);
    assert.match(issueLog, /"event":"curl_fallback_succeeded".*"status":401/);
  } finally {
    cleanupDir(logDir);
  }
});

test("统一 bash 入口应能把 openclaw 目标命令路由到 openai-codex OAuth 代理 issue", (t) => {
  if (!hasOpenClawBinary()) {
    t.skip("当前环境缺少 openclaw 可执行文件");
    return;
  }

  const logDir = createTempLogDir();
  const proxy = resolveProxyForTests();

  try {
    const env = {
      ...process.env,
      HTTP_PROXY: proxy,
      HTTPS_PROXY: proxy,
      OPENCLAW_GUARDIAN_LOG_DIR: logDir,
    };
    delete env.ALL_PROXY;
    delete env.all_proxy;

    const result = runProcess(
      "bash",
      [
        "-lc",
        `source "${BOOTSTRAP_BASH}" && openclaw models auth login --provider openai-codex --help`,
      ],
      { env },
    );

    assert.equal(result.status, 0, result.stderr);

    const runtimeLog = fs.readFileSync(path.join(logDir, "runtime.log"), "utf8");
    const issueLog = fs.readFileSync(path.join(logDir, ISSUE_LOG), "utf8");

    assert.match(runtimeLog, /"activeByConfig":true/);
    assert.match(runtimeLog, /"normalMatch":true/);
    assert.match(issueLog, /"event":"preload_activated"/);
  } finally {
    cleanupDir(logDir);
  }
});
