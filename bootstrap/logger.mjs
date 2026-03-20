import fs from "node:fs";
import path from "node:path";

// 统一的 JSON Lines 日志工具。
//
// 设计目标：
// 1. 所有本地覆盖模块都复用同一套日志写法
// 2. 不把日志格式散落到每个模块里重复实现
// 3. 后续如果要增加公共字段、掩码规则或日志目标，只改这一处

export function appendJsonLine(logPath, record) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // 日志失败不应打断主流程。
  }
}

export function createJsonlLogger(logPath, source, baseFields = {}) {
  return function log(event, data = {}) {
    appendJsonLine(logPath, {
      time: new Date().toISOString(),
      source,
      event,
      ...baseFields,
      ...data,
    });
  };
}

