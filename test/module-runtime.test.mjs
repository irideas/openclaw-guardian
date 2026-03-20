import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  discoverModuleManifests,
  extractProvider,
  isEnabledByDefault,
  matchesManifest,
  parseForcedModules,
  resolveActiveModuleIds,
  resolveModuleLogPath,
  resolveRuntimePaths,
  validateManifest,
} from "../runtime/bootstrap/module-runtime.mjs";
import { cleanupDir, createTempRepoFixture, writeJson } from "./test-helpers.mjs";

test("resolveRuntimePaths 应当支持环境变量覆盖", () => {
  const paths = resolveRuntimePaths({
    OPENCLAW_LOCAL_OVERRIDES_RUNTIME_ROOT: "/tmp/repo/runtime",
    OPENCLAW_LOCAL_OVERRIDES_REPO_ROOT: "/tmp/repo",
    OPENCLAW_LOCAL_OVERRIDES_HOME: "/tmp/home",
    OPENCLAW_LOCAL_OVERRIDES_LOG_DIR: "/tmp/logs",
    OPENCLAW_LOCAL_OVERRIDES_CONFIG_PATH: "/tmp/config.json",
  });

  assert.deepEqual(paths, {
    runtimeRoot: "/tmp/repo/runtime",
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
      kind: "node-preload",
      entry: { preload: "./preload-hook.mjs" },
    }),
    { ok: true, reason: null },
  );

  assert.deepEqual(
    validateManifest("openai-codex-auth-proxy", {
      id: "other",
      kind: "node-preload",
      entry: { preload: "./preload-hook.mjs" },
    }),
    { ok: false, reason: "manifest_id_mismatch" },
  );
});

test("validateManifest 应当校验 kind、enabledByDefault 与 env 字段", () => {
  assert.deepEqual(
    validateManifest("openai-codex-auth-proxy", {
      id: "openai-codex-auth-proxy",
      kind: "other-kind",
      entry: { preload: "./preload-hook.mjs" },
    }),
    { ok: false, reason: "manifest_kind_invalid" },
  );

  assert.deepEqual(
    validateManifest("openai-codex-auth-proxy", {
      id: "openai-codex-auth-proxy",
      kind: "node-preload",
      enabledByDefault: "yes",
      entry: { preload: "./preload-hook.mjs" },
    }),
    { ok: false, reason: "enabled_by_default_invalid" },
  );
});

test("resolveModuleLogPath 应当按 manifest 指定的文件名输出", () => {
  const logPath = resolveModuleLogPath("/tmp/logs", {
    logging: { file: "custom.log" },
  }, "openai-codex-auth-proxy");

  assert.equal(logPath, path.join("/tmp/logs", "custom.log"));
});

test("isEnabledByDefault 应当识别默认启用模块", () => {
  assert.equal(isEnabledByDefault({ enabledByDefault: true }), true);
  assert.equal(isEnabledByDefault({ enabledByDefault: false }), false);
  assert.equal(isEnabledByDefault({}), false);
});

test("discoverModuleManifests 与 resolveActiveModuleIds 应当支持默认启用和显式禁用", () => {
  const repoRoot = createTempRepoFixture();
  const runtimeRoot = path.join(repoRoot, "runtime");

  try {
    writeJson(path.join(runtimeRoot, "modules", "alpha", "module.json"), {
      id: "alpha",
      kind: "node-preload",
      enabledByDefault: true,
      entry: { preload: "./preload-hook.mjs" },
    });
    writeJson(path.join(runtimeRoot, "modules", "beta", "module.json"), {
      id: "beta",
      kind: "node-preload",
      enabledByDefault: false,
      entry: { preload: "./preload-hook.mjs" },
    });
    fs.mkdirSync(path.join(runtimeRoot, "modules", "broken"), { recursive: true });
    writeJson(path.join(runtimeRoot, "config", "enabled-modules.json"), {
      enabledModules: ["beta"],
      disabledModules: ["alpha"],
    });

    const discovered = discoverModuleManifests(runtimeRoot);
    assert.deepEqual(
      discovered.map((item) => item.moduleId),
      ["alpha", "beta", "broken"],
    );

    const active = resolveActiveModuleIds(
      runtimeRoot,
      path.join(runtimeRoot, "config", "enabled-modules.json"),
    );
    assert.deepEqual(active, ["beta"]);
  } finally {
    cleanupDir(repoRoot);
  }
});

test("resolveActiveModuleIds 在配置缺失时应回退到 enabledByDefault", () => {
  const repoRoot = createTempRepoFixture();
  const runtimeRoot = path.join(repoRoot, "runtime");

  try {
    writeJson(path.join(runtimeRoot, "modules", "alpha", "module.json"), {
      id: "alpha",
      kind: "node-preload",
      enabledByDefault: true,
      entry: { preload: "./preload-hook.mjs" },
    });
    writeJson(path.join(runtimeRoot, "modules", "beta", "module.json"), {
      id: "beta",
      kind: "node-preload",
      enabledByDefault: false,
      entry: { preload: "./preload-hook.mjs" },
    });

    const active = resolveActiveModuleIds(
      runtimeRoot,
      path.join(runtimeRoot, "config", "missing.json"),
    );
    assert.deepEqual(active, ["alpha"]);
  } finally {
    cleanupDir(repoRoot);
  }
});
