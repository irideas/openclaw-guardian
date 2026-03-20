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
  const text = String(value || "").trim();
  return text || null;
}

function resolveEffectiveProxy() {
  return (
    normalize(process.env.https_proxy) ||
    normalize(process.env.HTTPS_PROXY) ||
    normalize(process.env.http_proxy) ||
    normalize(process.env.HTTP_PROXY)
  );
}

function isOpenAITokenEndpoint(url) {
  return url === "https://auth.openai.com/oauth/token";
}

function parseCurlHeaderFile(text) {
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
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) {
    log("curl_fallback_skipped", { reason: "global_fetch_missing" });
    return;
  }

  globalThis.fetch = async function patchedFetch(input, init) {
    const request = new Request(input, init);
    if (!isOpenAITokenEndpoint(request.url)) {
      return await originalFetch(input, init);
    }

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
  const log = context.log;
  const effectiveProxy = resolveEffectiveProxy();

  log("preload_loaded", {
    argv: process.argv,
    effectiveProxy,
  });

  if (process.env.OPENCLAW_PROXY_PRELOAD_DISABLE === "1") {
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
    const undici = await import(pathToFileURL(undiciPath).href);
    const agent = new undici.EnvHttpProxyAgent();
    undici.setGlobalDispatcher(agent);

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

