# Changelog

本文档记录 `openclaw-guardian` 从 `1.0.0` 开始的正式版本演进。

## Unreleased

### Added

- 新增 `internal/README.md`，定义公开文档与内部文档的目录边界
- 新增 `internal/agent-team/GUARDIAN-CHIEF.md`，定义 `guardian-chief` 作为项目长期维护负责人的角色、职责、边界与载体策略
- 新增 `internal/agent-team/PROJECT-GOVERNANCE.md`，固化 guardian 的纳入边界、决策分层、GitHub 工作台承载方式与身份策略
- 新增 `internal/agent-team/MAINTENANCE-RHYTHM.md`，定义召唤制到周期巡检制的维护节奏、模型分工与后续 GitHub 运作方向
- 新增 `internal/agent-team/DISCUSSIONS-WORKBENCH.md`，明确四个核心 Discussions 的分工边界、使用顺序与记录风格
- 新增 `internal/agent-team/DISCUSSIONS-TEMPLATES.md`，提供四个核心 Discussions 的推荐帖头模板与最小写法

### Changed

- 在 `AGENTS.md` 中新增公开文档与内部文档的强制边界规则，明确 `docs/` 只用于对外公开内容，`internal/agent-team/` 用于项目组内 Agent 与治理文档
- 新增项目操作约定：提交信息默认使用简体中文；与项目维护相关的阶段性记录优先使用 GitHub Discussions 承载，记录语言默认使用简体中文

## 1.5.0 - 2026-03-24

### Added

- 新增 `test/openai-codex-oauth-proxy-failure.unit.test.mjs`，覆盖 `curl fallback` 传输层失败时自动退回原始 `fetch` 的行为

### Changed

- 修正 `openai-codex-oauth-proxy-failure` 的 `mitigation` 策略：`curl fallback` 仅作为兜底手段，若 `curl` 自身出现 `SSL_ERROR_SYSCALL` 等传输层失败，将自动退回 `fetch + EnvHttpProxyAgent`，不再把整次 OAuth 登录直接打死
- 在 issue README 中补充 `curl fallback` 的降级行为与新日志事件说明

## 1.4.0 - 2026-03-23

### Added

- 新增 `templates/issue/` 最小模板集，覆盖 `issue.json`、`README.md`、`i18n` 与三种能力面文件
- 新增 `scripts/new-issue.mjs`，用于快速生成最小合法 issue 骨架
- 新增 `test/new-issue.test.mjs`，验证脚手架生成结果与参数校验

### Changed

- 在 `docs/ISSUE-AUTHORING.md` 中补充脚手架说明
- 在根 `README.md` 中补充模板与脚手架入口

## 1.3.0 - 2026-03-23

### Added

- 新增 `docs/ISSUE-AUTHORING.md`，沉淀新增 issue 的判断标准、能力面选择与最小交付要求
- 新增 `docs/ISSUE-SCHEMA.md`，显式化 `issue.json` 的字段、约束、示例与常见错误
- 新增 `docs/RUNTIME-CONTRACT.md`，说明 `bridge/bootstrap`、runner 与 issue context 的运行时契约
- 新增 `docs/MAINTENANCE.md`，沉淀升级、回归、发布与 CI 排障 checklist

### Changed

- 在根 `README.md` 中补充“维护与扩展”入口，串起面向 AI Agent 和维护者的关键文档

## 1.2.0 - 2026-03-20

### Changed

- 在 `docs/TESTING.md` 中补充单测环境独立性约束，明确禁止依赖开发机本地 `openclaw`、`PATH`、`HOME` 或用户目录状态
- 在 `AGENTS.md` 中补充同类维护规则，要求 issue 与测试优先使用 runner 注入的 `context` 值

## 1.1.0 - 2026-03-20

### Changed

- 修正 `openai-codex` issue 的 title / summary，使其准确描述“浏览器授权后最终认证写入失败”的现象
- 重写仓库与 issue 级 README，统一按“现象 / 归因 / 解决方案 / 验证”组织
- 更新 GitHub Actions workflow，改用 `actions/checkout@v6` 与 `actions/setup-node@v6`
- 修复 `plugins-feishu-duplicate-id` 的 `preflight` 检测逻辑，使其优先使用 runner 传入的 `context.openclawRoot`，避免本地通过但 GitHub CI 失败

## 1.0.0 - 2026-03-20

### Added

- 以 `issues` 为中心的 guardian 架构
- 公共 `core/` 执行层：
  - `issue-loader`
  - `mitigation-runner`
  - `preflight-runner`
  - `repair-runner`
  - `locale`
  - `i18n-renderer`
  - `logger`
- `openai-codex-oauth-proxy-failure` issue
- `plugins-feishu-duplicate-id` issue
- `guardian` CLI 与 shell 函数入口
- issue `alias` 与短环境变量前缀
- `OpenClaw` 版本范围门控
- `zh-CN` 与 `en` 双语基础支持
- 对应的 unit / integration 测试

### Changed

- 项目正式版本从 `1.0.0` 开始
- `runtime/` 目录与 `runtime` 能力面分别收敛为 `bridge/` 与 `mitigation`
- 本地接入路径改为 `~/.openclaw/guardian`
- 不再保留旧命名、旧环境变量与旧兼容入口
