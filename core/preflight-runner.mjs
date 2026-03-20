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

function writeLine(writer, text = "") {
  writer(`${text}\n`);
}

function printFinding(writer, issueId, finding) {
  writeLine(writer, `[${finding.severity || "warning"}] ${issueId}${finding.code ? ` / ${finding.code}` : ""}`);
  writeLine(writer, finding.summary || issueId);

  if (finding.detail) {
    writeLine(writer, finding.detail);
  }

  for (const suggestion of finding.suggestions || []) {
    writeLine(writer, `- ${suggestion}`);
  }

  writeLine(writer);
}

export async function runPreflights(options = {}) {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const writer = options.write || ((text) => process.stderr.write(text));
  const paths = resolveRuntimePaths(env);
  const locale = resolveLocale(env, options.locale || null);
  const preflightLog = createJsonlLogger(path.join(paths.logDir, "preflight.log"), "guardian.preflight", {
    locale,
  });

  if (env.OPENCLAW_GUARDIAN_DISABLE === "1" || env.OPENCLAW_GUARDIAN_PREFLIGHT_DISABLE === "1") {
    preflightLog("preflight_skipped", { reason: "global_disable", argv });
    return [];
  }

  const forcedIssues = parseForcedIssues(env);
  const discoveredIssues = discoverIssues(paths.issuesRoot);
  const activeIssueIds = resolveActiveIssueIds(paths.issuesRoot, paths.issueConfigPath);
  const activeSet = new Set(activeIssueIds);
  const findings = [];

  preflightLog("preflight_loaded", {
    argv,
    issueConfigPath: paths.issueConfigPath,
    discoveredIssues: discoveredIssues.map(({ issueId }) => issueId),
    activeIssueIds,
    forcedIssues: Array.from(forcedIssues),
  });

  for (const { issueId, issuePath, issue } of discoveredIssues) {
    const forceMatch = forcedIssues.has(issueId);
    const activeByConfig = activeSet.has(issueId);
    const normalMatch = activeByConfig && issue ? matchesIssue(issue, argv) : false;

    preflightLog("issue_evaluated", {
      issueId,
      issuePath,
      activeByConfig,
      forceMatch,
      normalMatch,
      phase: "preflight",
    });

    if (!forceMatch && !normalMatch) {
      continue;
    }

    if (!issue) {
      preflightLog("issue_skipped", {
        issueId,
        reason: "issue_manifest_missing",
        issuePath,
        phase: "preflight",
      });
      continue;
    }

    const validation = validateIssue(issueId, issue);
    if (!validation.ok) {
      preflightLog("issue_skipped", {
        issueId,
        reason: validation.reason,
        phase: "preflight",
      });
      continue;
    }

    if (issue.capabilities.preflight !== true || !issue.entry?.preflight) {
      continue;
    }

    const issueDir = path.join(paths.issuesRoot, issueId);
    const issueLog = createJsonlLogger(resolveIssueLogPath(paths.logDir, issue, issueId), issueId, {
      locale,
    });
    const messages = loadIssueMessages(issueDir, locale);
    const t = (key, params = {}) => renderMessage(messages, key, params);

    try {
      const preflightEntry = path.join(issueDir, issue.entry.preflight);
      const issueModule = await import(pathToFileURL(preflightEntry).href);
      if (typeof issueModule.runPreflight !== "function") {
        issueLog("issue_skipped", {
          reason: "runPreflight_missing",
          preflightEntry,
        });
        continue;
      }

      issueLog("preflight_start", { argv, issueDir });
      const issueFindings = await issueModule.runPreflight({
        ...paths,
        issueId,
        issueDir,
        issue,
        locale,
        messages,
        t,
        argv,
        log: issueLog,
        preflightLog,
      });

      for (const finding of Array.isArray(issueFindings) ? issueFindings : []) {
        findings.push({ issueId, ...finding });
        printFinding(writer, issueId, finding);
      }

      issueLog("preflight_done", {
        findingCount: Array.isArray(issueFindings) ? issueFindings.length : 0,
      });
    } catch (error) {
      issueLog("preflight_failed", {
        message: error?.message || String(error),
        stack: error?.stack || null,
      });
    }
  }

  return findings;
}
