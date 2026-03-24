import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { __test__ } from "../issues/openai-codex-oauth-proxy-failure/mitigation.mjs";

const { installCurlFallbackFetch } = __test__;

function createFakeCurlBin(exitCode = 35, stderrText = "curl: (35) LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to auth.openai.com:443") {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-guardian-fake-curl-"));
  const curlPath = path.join(binDir, "curl");
  fs.writeFileSync(
    curlPath,
    `#!/usr/bin/env bash\nprintf '%s\\n' '${stderrText.replace(/'/g, "'\"'\"'")}' >&2\nexit ${exitCode}\n`,
    "utf8"
  );
  fs.chmodSync(curlPath, 0o755);
  return { binDir, curlPath };
}

test("installCurlFallbackFetch 应在 curl 传输层失败时退回原始 fetch", async () => {
  const originalFetch = globalThis.fetch;
  const originalPath = process.env.PATH;
  const { binDir } = createFakeCurlBin();
  const events = [];

  try {
    process.env.PATH = `${binDir}:${originalPath || ""}`;
    delete process.env.OPENCLAW_GUARDIAN_CODEX_AUTH_CURL_FALLBACK_DISABLE;

    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      return new Response(
        JSON.stringify({
          source: "original-fetch",
          url: request.url,
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    };

    installCurlFallbackFetch("http://127.0.0.1:7897", (event, payload) => {
      events.push({ event, payload });
    });

    const response = await fetch("https://auth.openai.com/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "debug-code",
      }),
    });

    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.source, "original-fetch");

    assert.ok(events.some((entry) => entry.event === "curl_fallback_spawn"));
    assert.ok(events.some((entry) => entry.event === "curl_fallback_failed"));
    assert.ok(
      events.some(
        (entry) =>
          entry.event === "curl_fallback_degraded_to_fetch" &&
          entry.payload?.code === 35
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.PATH = originalPath;
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});
