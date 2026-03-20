import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  extractProvider,
  matchesManifest,
  parseForcedModules,
  resolveModuleLogPath,
  resolveRuntimePaths,
  validateManifest,
} from "../bootstrap/module-runtime.mjs";

test("resolveRuntimePaths 应当支持环境变量覆盖", () => {
  const paths = resolveRuntimePaths({
    OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT: "/tmp/repo",
    OPENCLAW_LOCAL_OVERRIDES_HOME: "/tmp/home",
    OPENCLAW_LOCAL_OVERRIDES_LOG_DIR: "/tmp/logs",
    OPENCLAW_LOCAL_OVERRIDES_CONFIG_PATH: "/tmp/config.json",
  });

  assert.deepEqual(paths, {
    repoRoot: "/tmp/repo",
    openclawHome: "/tmp/home",
    logDir: "/tmp/logs",
    configPath: "/tmp/config.json",
  });
});

test("extractProvider 应当同时支持分离写法和内联写法", () => {
  assert.equal(extractProvider(["models", "auth", "--provider", "openai-codex"]), "openai-codex");
  assert.equal(extractProvider(["models", "auth", "--provider=openai-codex"]), "openai-codex");
  assert.equal(extractProvider(["models", "auth"]), null);
});

test("matchesManifest 应当正确匹配 openai-codex 登录命令", () => {
  const manifest = {
    match: {
      argvAll: ["models", "auth", "login"],
      provider: "openai-codex",
    },
  };

  assert.equal(
    matchesManifest(manifest, ["models", "auth", "login", "--provider", "openai-codex"]),
    true,
  );
  assert.equal(
    matchesManifest(manifest, ["models", "auth", "login", "--provider", "other"]),
    false,
  );
  assert.equal(
    matchesManifest(manifest, ["models", "auth", "--provider", "openai-codex"]),
    false,
  );
});

test("parseForcedModules 应当正确解析逗号分隔列表", () => {
  const forced = parseForcedModules({
    OPENCLAW_LOCAL_OVERRIDES_FORCE_MODULES: "a, b ,c",
  });

  assert.deepEqual(Array.from(forced), ["a", "b", "c"]);
});

test("validateManifest 应当校验模块 id 与 preload 入口", () => {
  assert.deepEqual(
    validateManifest("openai-codex-auth-proxy", {
      id: "openai-codex-auth-proxy",
      entry: { preload: "./preload-hook.mjs" },
    }),
    { ok: true, reason: null },
  );

  assert.deepEqual(
    validateManifest("openai-codex-auth-proxy", {
      id: "other",
      entry: { preload: "./preload-hook.mjs" },
    }),
    { ok: false, reason: "manifest_id_mismatch" },
  );
});

test("resolveModuleLogPath 应当按 manifest 指定的文件名输出", () => {
  const logPath = resolveModuleLogPath("/tmp/logs", {
    logging: { file: "custom.log" },
  }, "openai-codex-auth-proxy");

  assert.equal(logPath, path.join("/tmp/logs", "custom.log"));
});

