# Changelog

本文档记录 `openclaw-local-overrides` 的版本演进。

版本号当前采用语义化版本风格：

- 主版本：出现不兼容的结构调整
- 次版本：增加新能力、扩展模块框架
- 修订版本：修复问题、补充测试或文档

## 0.7.1 - 2026-03-20

### Changed

- 清理 `README`、模块说明与测试策略文档中的历史性描述
- 安装与使用说明统一为 `<repo-dir> + ~/.openclaw/local-overrides` 软链接的表述
- 仓库版本提升到 `0.7.1`

## 0.7.0 - 2026-03-20

### Added

- 增加 `runtime/` 作为运行时根目录
- 增加 `docs/` 目录，用于收纳测试策略与人工 E2E 文档
- 增加“仓库工程目录 + 运行时软链接目录”的安装方式说明

### Changed

- Git 仓库建议安装路径调整为 `$HOME/.openclaw/openclaw-local-overrides`
- 运行时目录固定为 `$HOME/.openclaw/local-overrides`，并通过软链接指向仓库内的 `runtime/`
- `README`、模块说明、测试夹具与集成测试全部切换到新目录结构
- 仓库版本提升到 `0.7.0`

## 0.6.0 - 2026-03-20

### Added

- 增加人工端到端验证清单 [MANUAL-E2E.md](./docs/MANUAL-E2E.md)

### Changed

- `npm test` 现在只执行 `unit`
- 新增 `npm run test:all` 用于本地一次性执行全部自动化测试
- README、TESTING 与模块文档统一测试术语
- 仓库版本提升到 `0.6.0`

## 0.5.0 - 2026-03-20

### Added

- 增加更完整的 GitHub Actions CI：
  - `push` / `pull_request` 自动执行 `unit`
  - `workflow_dispatch` 可手动执行 `integration`
- 增加仓库侧代理 secret 约定：
  `OPENCLAW_PROXY_TEST_PROXY_URL`

### Changed

- 仓库版本提升到 `0.5.0`
- README 补充 GitHub 仓库 Actions 与 CI 配置说明

## 0.4.0 - 2026-03-20

### Added

- 增加仓库级 `version` 元数据
- 增加仓库级 [AGENTS.md](./AGENTS.md)
- 增加本文件 `CHANGELOG.md`
- 为 `bootstrap/*.mjs`、`bootstrap/*.bash`、模块 `preload-hook.mjs` 增补更完整的简体中文注释

### Changed

- 移除历史兼容目录 `openai-codex-auth-proxy/`
- 模块 manifest 不再保留 `compat.*` 字段
- 仓库文档改为只描述统一 `bootstrap + modules` 结构

### Removed

- 删除旧版兼容入口：
  - `openai-codex-auth-proxy/bash-init.bash`
  - `openai-codex-auth-proxy/env-proxy-preload.mjs`
  - `openai-codex-auth-proxy/README.md`

## 0.3.0 - 2026-03-20

### Added

- 标准化模块 manifest：
  - `kind`
  - `enabledByDefault`
  - `env.variables`
- 增加模块发现与默认启用策略
- 增加相关单测和集成测试

### Changed

- `config/enabled-modules.json` 从“唯一启用列表”调整为“覆盖默认行为的配置层”

## 0.2.0 - 2026-03-20

### Added

- 增加共享运行时模块 [module-runtime.mjs](./runtime/bootstrap/module-runtime.mjs)
- 增加公共单测与集成测试
- 增加 [package.json](./package.json) 与统一 `npm test` 测试入口

## 0.1.0 - 2026-03-20

### Added

- 初始版 `bootstrap + modules + config` 结构
- `openai-codex-auth-proxy` 模块
- 统一 Bash 入口与统一 Node preload 路由
- `EnvHttpProxyAgent + curl fallback` 方案
