# Changelog

本文档记录 `openclaw-guardian` 从 `1.0.0` 开始的正式版本演进。

## 1.0.0 - 2026-03-20

### Added

- 以 `issues` 为中心的 guardian 架构
- 公共 `core/` 执行层：
  - `issue-loader`
  - `runtime-runner`
  - `preflight-runner`
  - `repair-runner`
  - `locale`
  - `i18n-renderer`
  - `logger`
- `openai-codex-oauth-proxy-failure` issue
- `plugins-feishu-duplicate-id` issue
- `guardian` CLI 与 shell 函数入口
- `zh-CN` 与 `en` 双语基础支持
- 对应的 unit / integration 测试

### Changed

- 项目正式版本从 `1.0.0` 开始
- 不再保留旧命名、旧环境变量与旧兼容入口
