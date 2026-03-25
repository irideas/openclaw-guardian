# Maintenance Guide

本文档描述 `openclaw-guardian` 的日常维护方式。

目标是让维护者或 AI Agent 在接手仓库时，知道：

- 平时怎么改
- 上游升级后怎么看
- CI 红了先查什么
- 发布前要检查什么

## 0. 讨论到决策的工作流

新增问题想法、能力层命名、平台增强方向与治理规则时，应先走：

1. 在维护工作区起草草稿
2. 发到 `GitHub Discussions`
3. 讨论达成共识
4. 将共识沉淀到 `docs/decisions/`
5. 如需实际落地，再创建 `Issue` 进入实现

详细规则见：

- [discussion-to-decision.md](./workflows/discussion-to-decision.md)
- [decisions/README.md](./decisions/README.md)

额外约定：

- `Discussions` 正文默认使用简体中文
- 术语、路径、代码标识符、能力名与字段名保持英文
- 未定稿 proposal 默认不进入 repo 已跟踪内容
- 新增 proposal 时，不要再向 repo 的 `internal/` 目录新增已跟踪文件

## 1. 日常修改 checklist

### 修改公共层时

公共层包括：

- `bridge/bootstrap/*`
- `core/*`
- `cli/guardian.mjs`

至少应检查：

1. `npm test`
2. 是否影响现有 issue 的 context 注入
3. 是否影响默认日志路径
4. 是否影响 i18n 输出
5. 是否需要更新：
   - `ARCHITECTURE.md`
   - `RUNTIME-CONTRACT.md`
   - `TESTING.md`

### 修改 issue 时

至少应检查：

1. issue `README.md`
2. `issue.json`
3. `i18n/en.json`
4. `i18n/zh-CN.json`
5. 至少一条对应测试

## 2. 上游 `OpenClaw` 升级后的检查方法

每次上游 `OpenClaw` 升级后，应重点检查：

1. 某个 issue 对应问题是否仍存在
2. 某个 issue 的版本范围是否仍然正确
3. 上游是否新增了 `doctor` / `plugins doctor` 能力，已经覆盖本 issue
4. issue 的接入方式是否仍然兼容当前 `OpenClaw` 目录结构

建议顺序：

1. 先看上游 release note / changelog
2. 再执行 issue 对应的典型命令
3. 再判断要不要调整 `appliesTo.openclaw.versionRange`

## 3. 版本发布前 checklist

发布前至少检查：

1. 工作树干净
2. `npm test` 通过
3. 如涉及网络 issue，必要时补一次手工验证
4. `README.md` 是否反映当前事实
5. `CHANGELOG.md` 是否更新
6. 新 issue 是否已加入根 README
7. 文档中是否存在本机绝对路径残留

## 4. CI 红了先看什么

### 4.1 `unit` 失败

先检查：

1. 是否有测试依赖了本机环境
2. 是否有 issue 实现绕过了 runner 注入值
3. 是否修改了 schema / runner 但没有同步测试

常见根因：

- 直接读取 `process.env`
- 依赖本机已安装 `openclaw`
- 路径推导在 CI 与本机不一致

### 4.2 `integration` 失败

先检查：

1. GitHub secret 是否还有效
2. 代理是否可用
3. 外部网络响应是否变化
4. 是否误把网络行为当成 unit 契约

## 5. 什么时候必须做手工验证

下面情况建议补一次 `MANUAL-E2E`：

- 修改 `openai-codex-oauth-proxy-failure`
- 修改 shell 接入链路
- 修改 `node-entry.mjs`
- 修改 `OpenClaw` 版本门控逻辑
- 你怀疑真实行为与假输入行为已经出现偏差

## 6. 文档同步规则

修改下列内容时，必须同步文档：

- 新增 issue
  - 更新根 `README.md`
  - 更新 `CHANGELOG.md`
- 修改 schema
  - 更新 `ISSUE-SCHEMA.md`
- 修改运行时契约
  - 更新 `RUNTIME-CONTRACT.md`
- 修改维护流程
  - 更新本文件

## 7. 推荐维护顺序

当你准备做一项变更时，建议顺序是：

1. 明确问题边界
2. 判断它属于公共层还是 issue 层
3. 先补或更新文档
4. 再写实现
5. 再补测试
6. 最后更新 `CHANGELOG.md`

这样能降低“代码先行、语义后补”带来的架构漂移。

## 8. proposal 与决策的落点

维护过程中应区分三类材料：

1. 工作区草稿
   用于起草 `Discussions` 文本、收集证据、整理备选方案；不进入 repo 已跟踪内容
2. `GitHub Discussions`
   用于公开讨论候选问题、增强方向、能力命名与边界设计
3. `docs/decisions/`
   用于沉淀已经达成共识、可以作为后续实现依据的决策

不要把未定稿 proposal 直接当作文档长期保留在 repo 中。
