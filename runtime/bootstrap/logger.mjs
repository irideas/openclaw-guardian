import fs from "node:fs";
import path from "node:path";

// 统一的 JSON Lines 日志工具。
//
// 这一层只解决两件事：
// 1. 把日志安全地追加到目标文件
// 2. 统一所有模块和运行时的日志字段形状
//
// 之所以抽成公共工具，而不是让每个模块自己 `appendFileSync`：
// - 可以保证日志格式长期稳定
// - 后续如果要增加公共字段、掩码规则、分级或多目标输出，只改这里
// - 单测和集成测试也能更稳定地断言日志内容

export function appendJsonLine(logPath, record) {
  try {
    // 日志目录可能尚不存在，这里统一负责懒创建。
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    // 日志失败不应打断主流程。
  }
}

export function createJsonlLogger(logPath, source, baseFields = {}) {
  return function log(event, data = {}) {
    // 每次写日志时统一补齐时间、来源和事件名。
    // 这样上层只需要关心“发生了什么”，不需要重复拼装公共字段。
    appendJsonLine(logPath, {
      time: new Date().toISOString(),
      source,
      event,
      ...baseFields,
      ...data,
    });
  };
}
