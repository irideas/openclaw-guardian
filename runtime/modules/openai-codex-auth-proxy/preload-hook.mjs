import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

// 这是 `openai-codex-auth-proxy` 模块自己的 Node preload 实现。
//
// 模块职责很单一：
// 1. 为当前 `openclaw` 进程安装 `EnvHttpProxyAgent`
// 2. 只对 `https://auth.openai.com/oauth/token` 这个端点增加极窄的 `curl fallback`
//
// 它不再负责命令匹配、配置读取或统一接入。
// 这些工作已经转移到 `bootstrap/node-preload-entry.mjs`。

function normalize(value) {
  // 和公共运行时保持相同的空值归一策略，避免字符串判断出现分叉。
  const text = String(value || "").trim();
  return text || null;
}

function resolveEffectiveProxy() {
  // 当前模块只关心 HTTP(S) 代理。
  // 这里明确不读 `ALL_PROXY`，避免把 shell 中残留的其他代理语义混入进来。
  return (
    normalize(process.env.https_proxy) ||
    normalize(process.env.HTTPS_PROXY) ||
    normalize(process.env.http_proxy) ||
    normalize(process.env.HTTP_PROXY)
  );
}

function isOpenAITokenEndpoint(url) {
  // 模块只对这一个端点做 `curl fallback`，
  // 以确保影响范围尽可能小。
  return url === "https://auth.openai.com/oauth/token";
}

function parseCurlHeaderFile(text) {
  // HTTPS 代理场景下，`curl -D` 可能同时写出：
  // - `HTTP/1.1 200 Connection established`
  // - 真实目标站点的最终响应头
  //
  // 这里始终取最后一个 HTTP 响应块作为真正的业务响应。
  const normalized = text.replace(/\r\n/g, "\n");
  const chunks = normalized
    .split(/\n\n+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => /^HTTP\/\d(?:\.\d)?\s+\d+/.test(value));

  const last = chunks.at(-1);
  if (!last) {
    throw new Error("curl response header block not found");
  }

  const lines = last.split("\n");
  const statusLine = lines.shift() || "";
  const match = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/);
  if (!match) {
    throw new Error(`invalid status line from curl: ${statusLine}`);
  }

  const status = Number(match[1]);
  const headers = new Headers();
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!key) continue;
    headers.append(key, value);
  }

  return { status, headers };
}

async function waitForProcessResult(child, stdoutPath, stderrPath) {
  // `spawn` 的结果统一在这里汇总，便于上层逻辑只关心：
  // - 退出码
  // - stdout/stderr 内容
  // 而不用在每个调用点重复写样板代码。
  return await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      try {
        const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, "utf8") : "";
        const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, "utf8") : "";
        resolve({ code, signal, stdout, stderr });
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function curlFetchThroughProxy(request, effectiveProxy, log) {
  // 这是模块最关键的兼容层：
  // 仅在 `oauth/token` 这个端点上，用 `curl -x <proxy>` 取代原始 `fetch`。
  //
  // 这样做不是因为 `curl` 更“高级”，而是因为本地实验已经证明：
  // - `undici + EnvHttpProxyAgent` 可以修复一部分代理问题
  // - 但这一个端点在某些代理链路上仍可能超时
  // - 同路径的 `curl` 却可以稳定返回 200/401
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-oauth-token-"));
  const headerPath = path.join(tempDir, "headers.txt");
  const bodyPath = path.join(tempDir, "body.txt");
  const stderrPath = path.join(tempDir, "stderr.txt");

  try {
    const method = request.method || "GET";
    const args = [
      "-sS",
      "-x",
      effectiveProxy,
      "-X",
      method,
      request.url,
      "-D",
      headerPath,
      "-o",
      bodyPath,
    ];

    request.headers.forEach((value, key) => {
      // `host` 和 `content-length` 由 `curl` 自己生成，避免和原请求冲突。
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "content-length") return;
      args.push("-H", `${key}: ${value}`);
    });

    if (method !== "GET" && method !== "HEAD") {
      const bodyText = await request.text();
      if (bodyText.length > 0) {
        args.push("--data-raw", bodyText);
      }
    }

    log("curl_fallback_spawn", {
      url: request.url,
      method,
      effectiveProxy,
    });

    const stderrFd = fs.openSync(stderrPath, "w");
    const child = spawn("curl", args, {
      stdio: ["ignore", "ignore", stderrFd],
    });
    const { code, signal, stderr } = await waitForProcessResult(child, bodyPath, stderrPath);
    fs.closeSync(stderrFd);

    if (code !== 0) {
      log("curl_fallback_failed", {
        url: request.url,
        method,
        effectiveProxy,
        code,
        signal,
        stderr,
      });
      throw new TypeError(`curl fallback failed: ${stderr || `exit ${code}`}`.trim());
    }

    const headerText = fs.readFileSync(headerPath, "utf8");
    const bodyText = fs.readFileSync(bodyPath, "utf8");
    const { status, headers } = parseCurlHeaderFile(headerText);

    log("curl_fallback_succeeded", {
      url: request.url,
      method,
      effectiveProxy,
      status,
    });

    return new Response(bodyText, {
      status,
      headers,
    });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // 临时目录清理失败不影响主流程。
    }
  }
}

function installCurlFallbackFetch(effectiveProxy, log) {
  // 这里不是覆盖整个进程的所有请求，而是保留原始 `fetch`，
  // 只对单一已知异常端点做窄拦截。
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) {
    log("curl_fallback_skipped", { reason: "global_fetch_missing" });
    return;
  }

  globalThis.fetch = async function patchedFetch(input, init) {
    const request = new Request(input, init);
    // 除目标端点外，其他请求完全走原始链路。
    if (!isOpenAITokenEndpoint(request.url)) {
      return await originalFetch(input, init);
    }

    // 保留一个可调试的关闭开关，便于以后对比：
    // 是 `EnvHttpProxyAgent` 本身生效，还是 `curl fallback` 在兜底。
    if (process.env.OPENCLAW_PROXY_CURL_FALLBACK_DISABLE === "1") {
      return await originalFetch(input, init);
    }

    return await curlFetchThroughProxy(request, effectiveProxy, log);
  };

  log("curl_fallback_installed", {
    effectiveProxy,
    target: "https://auth.openai.com/oauth/token",
  });
}

function resolveOpenClawRoot() {
  // 当前模块必须定位“正在执行的 openclaw 安装目录”，
  // 以便从那个目录里加载与其版本匹配的 `undici`。
  //
  // 这样可以避免：
  // - 错用系统上其他版本的 `undici`
  // - `nvm` / 多 Node 版本并存时的依赖错配
  const override = normalize(process.env.OPENCLAW_PROXY_PRELOAD_OPENCLAW_ROOT);
  if (override) return override;

  const arg1 = process.argv[1];
  if (arg1) {
    try {
      const real = fs.realpathSync(arg1);
      const stat = fs.statSync(real);
      if (stat.isFile()) {
        const base = path.basename(real);
        if (base === "openclaw.mjs") return path.dirname(real);
        if (base === "openclaw") {
          return path.resolve(path.dirname(real), "..", "lib", "node_modules", "openclaw");
        }
      }
    } catch {
      // 继续走兜底逻辑。
    }
  }

  try {
    const versionRoot = path.resolve(process.execPath, "..", "..");
    const candidate = path.join(versionRoot, "lib", "node_modules", "openclaw");
    if (fs.existsSync(path.join(candidate, "openclaw.mjs"))) return candidate;
  } catch {
    // 继续返回 null。
  }

  return null;
}

export async function activate(context) {
  // `activate()` 是统一运行时约定的模块入口。
  // 运行时已经负责：
  // - 模块发现
  // - manifest 匹配
  // - 日志器注入
  //
  // 本模块在这里只聚焦自己的网络修复逻辑。
  const log = context.log;
  const effectiveProxy = resolveEffectiveProxy();

  log("preload_loaded", {
    argv: process.argv,
    effectiveProxy,
  });

  if (process.env.OPENCLAW_PROXY_PRELOAD_DISABLE === "1") {
    // 保留旧开关只是为了兼容既有调试习惯；
    // 它现在只影响模块本身，不再影响整个框架的模块发现。
    log("preload_skipped", { reason: "legacy_disable" });
    return;
  }

  if (!effectiveProxy) {
    log("preload_skipped", { reason: "no_proxy_env" });
    return;
  }

  const openclawRoot = resolveOpenClawRoot();
  if (!openclawRoot) {
    log("preload_skipped", { reason: "openclaw_root_not_found" });
    return;
  }

  const undiciPath = path.join(openclawRoot, "node_modules", "undici", "index.js");

  try {
    // 这里显式加载“当前 openclaw 安装目录里的 undici”，
    // 而不是依赖外部全局模块解析。
    const undici = await import(pathToFileURL(undiciPath).href);
    const agent = new undici.EnvHttpProxyAgent();
    undici.setGlobalDispatcher(agent);

    // `EnvHttpProxyAgent` 负责修正绝大多数裸 `fetch(...)` 的代理感知，
    // `curl fallback` 只负责已知异常的 token 端点。
    installCurlFallbackFetch(effectiveProxy, log);

    log("preload_activated", {
      openclawRoot,
      undiciPath,
      effectiveProxy,
      dispatcher: agent.constructor?.name || "unknown",
    });

    if (process.env.OPENCLAW_PROXY_PRELOAD_STDERR === "1") {
      console.error(`[openclaw-preload] EnvHttpProxyAgent enabled for ${effectiveProxy}`);
    }
  } catch (error) {
    log("preload_failed", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
}
