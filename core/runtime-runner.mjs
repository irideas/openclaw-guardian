import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJsonlLogger } from "./logger.mjs";
import { resolveLocale } from "./locale.mjs";
import { loadIssueMessages, renderMessage } from "./i18n-renderer.mjs";
import {
  discoverIssues,
  matchesIssue,
  parseForcedIssues,
  resolveActiveIssueIds,
  resolveIssueLogPath,
  resolveRuntimePaths,
  validateIssue,
} from "./issue-loader.mjs";

// 这是 `guardian` 的统一 runtime runner。
//
// 它当前只负责 issue 的 `runtime` 能力面：
// - 发现 issue
// - 解析启停配置
// - 依据当前命令进行 issue 匹配
// - 加载 issue 的 `runtime.mjs`
//
// `preflight` 与 `repair` 在这个阶段先只搭骨架，不混进现有可用链路。

const PATHS = resolveRuntimePaths();
const REPO_ROOT = PATHS.repoRoot;
const RUNTIME_ROOT = PATHS.runtimeRoot;
const ISSUES_ROOT = PATHS.issuesRoot;
const OPENCLAW_HOME = PATHS.openclawHome;
const LOG_DIR = PATHS.logDir;
const ISSUE_CONFIG_PATH = PATHS.issueConfigPath;
const RUNTIME_LOG_PATH = path.join(LOG_DIR, "runtime.log");
const LOCALE = resolveLocale();

const runtimeLog = createJsonlLogger(RUNTIME_LOG_PATH, "guardian.runtime", {
  locale: LOCALE,
});

function isGuardianDisabled(env = process.env) {
  return env.OPENCLAW_GUARDIAN_DISABLE === "1";
}

async function activateRuntimeIssue(issueId, issue, issueDir) {
  const validation = validateIssue(issueId, issue);
  if (!validation.ok) {
    runtimeLog("issue_skipped", {
      issueId,
      reason: validation.reason,
    });
    return;
  }

  if (issue.capabilities.runtime !== true) {
    runtimeLog("issue_skipped", {
      issueId,
      reason: "runtime_capability_disabled",
    });
    return;
  }

  const issueLogPath = resolveIssueLogPath(LOG_DIR, issue, issueId);
  const issueLog = createJsonlLogger(issueLogPath, issueId, {
    locale: LOCALE,
  });

  try {
    const runtimeEntry = path.join(issueDir, issue.entry.runtime);
    const issueModule = await import(pathToFileURL(runtimeEntry).href);
    if (typeof issueModule.activate !== "function") {
      issueLog("issue_skipped", {
        reason: "activate_missing",
        runtimeEntry,
      });
      return;
    }

    const messages = loadIssueMessages(issueDir, LOCALE);
    const t = (key, params = {}) => renderMessage(messages, key, params);

    issueLog("issue_activate_start", {
      argv: process.argv,
      issueDir,
    });

    await issueModule.activate({
      repoRoot: REPO_ROOT,
      runtimeRoot: RUNTIME_ROOT,
      openclawHome: OPENCLAW_HOME,
      issueId,
      issueDir,
      issue,
      locale: LOCALE,
      messages,
      t,
      log: issueLog,
      runtimeLog,
    });

    issueLog("issue_activate_done", {
      argv: process.argv,
    });
  } catch (error) {
    issueLog("issue_activate_failed", {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
}

export async function runRuntime() {
  if (isGuardianDisabled()) {
    runtimeLog("runtime_skipped", { reason: "global_disable" });
    return;
  }

  const args = process.argv.slice(2);
  const forcedIssues = parseForcedIssues();
  const discoveredIssues = discoverIssues(ISSUES_ROOT);
  const activeIssueIds = resolveActiveIssueIds(ISSUES_ROOT, ISSUE_CONFIG_PATH);
  const activeSet = new Set(activeIssueIds);

  runtimeLog("runtime_loaded", {
    argv: process.argv,
    issueConfigPath: ISSUE_CONFIG_PATH,
    discoveredIssues: discoveredIssues.map(({ issueId }) => issueId),
    activeIssueIds,
    forcedIssues: Array.from(forcedIssues),
  });

  for (const { issueId, issuePath, issue } of discoveredIssues) {
    const forceMatch = forcedIssues.has(issueId);
    const activeByConfig = activeSet.has(issueId);
    const normalMatch = activeByConfig && issue ? matchesIssue(issue, args) : false;

    runtimeLog("issue_evaluated", {
      issueId,
      issuePath,
      activeByConfig,
      forceMatch,
      normalMatch,
    });

    if (!forceMatch && !normalMatch) {
      continue;
    }

    if (!issue) {
      runtimeLog("issue_skipped", {
        issueId,
        reason: "issue_manifest_missing",
        issuePath,
      });
      continue;
    }

    const issueDir = path.join(ISSUES_ROOT, issueId);
    await activateRuntimeIssue(issueId, issue, issueDir);
  }
}
