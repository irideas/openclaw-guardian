# AGENTS.md

本文件描述 `openclaw-guardian` 的维护规则。
项目结构、issue 说明和使用方式以 [README.md](./README.md) 为准，不在这里重复。

## 讨论与决策工作流（强制）

- 未定稿的想法、候选问题、能力命名讨论、方案比较和边界澄清，应先走 `GitHub Discussions`，不应直接进入 repo 已跟踪内容。
- `GitHub Discussions` 的正文默认使用简体中文；术语、路径、代码标识符、能力名和字段名保持英文并用反引号包裹。
- 只有在讨论达成共识后，才应把结果沉淀到 `docs/decisions/`。
- 只有在某项共识已经清晰到可以直接实施时，才应创建 `Issue` 进入实现跟踪。
- 新增 proposal、治理草稿或候选方案时，默认不要再向 repo 的 `internal/` 目录新增已跟踪文件；草稿应先放在维护工作区，正式公开后以 `Discussions` 为准。
- 具体流程以 [docs/workflows/discussion-to-decision.md](./docs/workflows/discussion-to-decision.md) 为准。

## 维护原则

- 优先保持 `core/` 与 `bridge/bootstrap/` 稳定，避免把 issue 特定逻辑回灌到公共层
- 新增或修改 issue 时，应同时补齐对应文档与测试
- 不直接修改全局安装的 `openclaw`，本仓库只维护本地覆盖层

## 代码要求

- `bash` 与 `mjs` 文件优先使用 ASCII
- 关键路径推导、环境变量、日志行为、控制流分层应补充简体中文注释
- 注释应解释“为什么这样设计”与“这一层负责什么”，不要只复述代码字面行为

## 测试要求

- 提交前至少执行 `npm test`
- 修改公共运行时时，应优先补单测
- 修改具体 issue 时，应至少覆盖一个对应的集成测试
- 单测不得依赖开发机本机已安装的 `openclaw`、真实 `~/.openclaw`、`PATH` 或其他偶然环境状态
- 如果 runner 已通过 `context` 注入路径、版本或环境信息，测试与 issue 实现都应优先使用注入值

## 文档与版本

- 对外可见的结构变化应更新 `README.md`
- 版本变化和重要工程里程碑应更新 `CHANGELOG.md`
- 新增 issue 时，应补该 issue 自己的 `README.md`
- 达成共识后的方案，应沉淀到 `docs/decisions/`

## 提交约定

- 提交应保持单一主题，避免把无关改动混在一起
- 提交信息默认使用简体中文，直接说明本次变更目的；如确有必要补充英文，应以简体中文为主
- 推送前应确认工作树干净，且测试通过
