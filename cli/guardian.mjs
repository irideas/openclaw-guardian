#!/usr/bin/env node

import process from "node:process";
import { resolveLocale } from "../core/locale.mjs";
import { discoverIssues, resolveRuntimePaths } from "../core/issue-loader.mjs";
import { runRepair } from "../core/repair-runner.mjs";

const CLI_MESSAGES = {
  en: {
    usage: "Usage: guardian <issue|repair> ...",
    issueListHeader: "Issues",
    issueShowUsage: "Usage: guardian issue show <issue-id>",
    repairUsage: "Usage: guardian repair <issue-id> [--dry-run|--apply]",
    unknownCommand: "Unknown command.",
    issueNotFound: "Issue not found: {issueId}",
    capabilities: "Capabilities",
    category: "Category",
    severity: "Severity",
    enabledByDefault: "Enabled by default",
  },
  "zh-CN": {
    usage: "用法：guardian <issue|repair> ...",
    issueListHeader: "Issues 列表",
    issueShowUsage: "用法：guardian issue show <issue-id>",
    repairUsage: "用法：guardian repair <issue-id> [--dry-run|--apply]",
    unknownCommand: "未知命令。",
    issueNotFound: "未找到 issue：{issueId}",
    capabilities: "能力面",
    category: "类别",
    severity: "严重级别",
    enabledByDefault: "默认启用",
  },
};

function t(locale, key, params = {}) {
  const bundle = CLI_MESSAGES[locale] || CLI_MESSAGES.en;
  const template = bundle[key] || CLI_MESSAGES.en[key] || key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
    const value = params[name];
    return value === undefined || value === null ? `{${name}}` : String(value);
  });
}

function printUsage(locale) {
  process.stderr.write(`${t(locale, "usage")}\n`);
}

function printIssue(issueId, issue, locale) {
  process.stdout.write(`${issueId}\n`);
  process.stdout.write(`  ${t(locale, "category")}: ${issue.category}\n`);
  process.stdout.write(`  ${t(locale, "severity")}: ${issue.severity}\n`);
  process.stdout.write(
    `  ${t(locale, "enabledByDefault")}: ${issue.enabledByDefault === true ? "true" : "false"}\n`,
  );
  process.stdout.write(
    `  ${t(locale, "capabilities")}: ${Object.entries(issue.capabilities || {})
      .filter(([, enabled]) => enabled === true)
      .map(([name]) => name)
      .join(", ") || "-"}\n`,
  );
}

async function main() {
  const locale = resolveLocale();
  const args = process.argv.slice(2);
  const [command, subcommand, value] = args;

  if (!command) {
    printUsage(locale);
    process.exitCode = 1;
    return;
  }

  if (command === "issue" && subcommand === "list") {
    const { issuesRoot } = resolveRuntimePaths();
    const issues = discoverIssues(issuesRoot).filter(({ issue }) => issue);
    process.stdout.write(`${t(locale, "issueListHeader")}\n`);
    for (const { issueId, issue } of issues) {
      process.stdout.write(`- ${issueId}: ${issue.title}\n`);
    }
    return;
  }

  if (command === "issue" && subcommand === "show") {
    if (!value) {
      process.stderr.write(`${t(locale, "issueShowUsage")}\n`);
      process.exitCode = 1;
      return;
    }

    const { issuesRoot } = resolveRuntimePaths();
    const issues = discoverIssues(issuesRoot);
    const entry = issues.find(({ issueId }) => issueId === value);
    if (!entry || !entry.issue) {
      process.stderr.write(`${t(locale, "issueNotFound", { issueId: value })}\n`);
      process.exitCode = 1;
      return;
    }

    printIssue(entry.issueId, entry.issue, locale);
    return;
  }

  if (command === "repair") {
    const issueId = subcommand;
    const mode = value;
    const apply = mode === "--apply";
    const dryRun = mode === undefined || mode === "--dry-run";

    if (!issueId || (!apply && !dryRun)) {
      process.stderr.write(`${t(locale, "repairUsage")}\n`);
      process.exitCode = 1;
      return;
    }

    await runRepair({
      issueId,
      apply,
    });
    return;
  }

  process.stderr.write(`${t(locale, "unknownCommand")}\n`);
  printUsage(locale);
  process.exitCode = 1;
}

await main();
