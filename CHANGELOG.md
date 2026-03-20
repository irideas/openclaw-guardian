# Changelog

本文档记录 `openclaw-guardian` 从 `1.0.0` 开始的正式版本演进。

## 1.0.1 - 2026-03-20

### Changed

- 修正 `openai-codex` issue 的 title / summary，使其准确描述“浏览器授权后最终认证写入失败”的现象
- 重写仓库与 issue 级 README，统一按“现象 / 归因 / 解决方案 / 验证”组织
- 更新 GitHub Actions workflow，改用 `actions/checkout@v6` 与 `actions/setup-node@v6`

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
