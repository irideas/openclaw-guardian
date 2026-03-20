import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJsonlLogger } from "./logger.mjs";
import { resolveLocale } from "./locale.mjs";
import { loadIssueMessages, renderMessage } from "./i18n-renderer.mjs";
import { resolveIssueContext, resolveIssueLogPath, validateIssue } from "./issue-loader.mjs";

function writeLine(writer, text = "") {
  writer(`${text}\n`);
}

function printRepairResult(writer, result) {
  writeLine(writer, result.summary || result.status || "ok");

  for (const action of result.actions || []) {
    writeLine(writer, `- ${action}`);
  }

  for (const warning of result.warnings || []) {
    writeLine(writer, `! ${warning}`);
  }
}

export async function runRepair(options = {}) {
  const env = options.env || process.env;
  const issueId = options.issueId;
  if (!issueId) {
    throw new Error("issueId is required");
  }

  const apply = options.apply === true;
  const writer = options.write || ((text) => process.stdout.write(text));
  const locale = resolveLocale(env, options.locale || null);
  const context = resolveIssueContext(issueId, env);
  const validation = validateIssue(issueId, context.issue);
  const repairLog = createJsonlLogger(path.join(context.logDir, "repair.log"), "guardian.repair", {
    locale,
  });

  if (!validation.ok) {
    throw new Error(`invalid issue: ${validation.reason}`);
  }

  if (context.issue.capabilities.repair !== true || !context.issue.entry?.repair) {
    throw new Error(`issue does not expose repair capability: ${issueId}`);
  }

  const issueLog = createJsonlLogger(resolveIssueLogPath(context.logDir, context.issue, issueId), issueId, {
    locale,
  });
  const messages = loadIssueMessages(context.issueDir, locale);
  const t = (key, params = {}) => renderMessage(messages, key, params);

  repairLog("repair_start", {
    issueId,
    apply,
  });

  const repairEntry = path.join(context.issueDir, context.issue.entry.repair);
  const issueModule = await import(pathToFileURL(repairEntry).href);
  if (typeof issueModule.runRepair !== "function") {
    throw new Error(`repair entry missing runRepair(): ${repairEntry}`);
  }

  const result = await issueModule.runRepair({
    ...context,
    apply,
    locale,
    messages,
    t,
    log: issueLog,
    repairLog,
  });

  printRepairResult(writer, result || {});
  repairLog("repair_done", {
    issueId,
    apply,
    status: result?.status || null,
  });

  return result;
}
