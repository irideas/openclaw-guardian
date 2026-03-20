# `OpenClaw Guardian` 架构文档

## 文档状态

- 状态：当前实现
- 目的：描述 `openclaw-guardian` 的当前架构、边界与后续扩展方向

## 1. 项目定位

`openclaw-guardian` 是一个面向 `OpenClaw` 的本地问题治理框架。

它解决的不是“如何扩展 `OpenClaw` 功能”，而是：

- 如何更早发现本地环境中的高风险问题
- 如何在不修改全局安装包的前提下，对特定运行时异常做窄修复
- 如何把一次性的排障经验沉淀成可持续维护的问题现象库

项目的核心目标是：

> 以问题现象为中心，为 `OpenClaw` 提供可预警、可缓解、可修复、可验证的本地治理能力。

## 2. 设计原则

项目遵循以下原则：

- 不直接修改全局安装的 `openclaw`
- 以 issue 为中心，而不是以某一种实现手段为中心
- 用户可见输出应支持多语言，至少包含 `zh-CN` 与 `en`
- 运行时修复应尽量窄，避免扩大影响范围
- 持久化修复动作应显式执行，并支持 `dry-run`
- 能交给上游 `openclaw doctor` 处理的，不在本项目重复实现

## 3. 核心模型

### 3.1 `issues` 是中心

项目的第一层对象是 issue。

一个 issue 表示一种稳定的问题现象，例如：

- `openai-codex-oauth-proxy-failure`
- `plugins-feishu-duplicate-id`

每个 issue 都应当回答：

- 这是什么问题
- 典型症状是什么
- 何时触发
- 当前具备哪些治理能力
- 如何验证

### 3.2 `preflight`、`runtime`、`repair` 是能力面

issue 可以按需具备三种能力面：

- `preflight`
  在命令执行前发现风险并给出提示
- `runtime`
  在命中的执行链路中做进程内缓解
- `repair`
  以显式命令执行本地修复动作

并不是每个 issue 都必须同时具备这三种能力。

## 4. 当前目录结构

```text
openclaw-guardian/
  README.md
  CHANGELOG.md
  AGENTS.md
  LICENSE
  docs/
    ARCHITECTURE.md
    MANUAL-E2E.md
    TESTING.md
  cli/
    guardian.mjs
  core/
    i18n-renderer.mjs
    issue-loader.mjs
    locale.mjs
    logger.mjs
    preflight-runner.mjs
    repair-runner.mjs
    runtime-runner.mjs
  issues/
    openai-codex-oauth-proxy-failure/
      issue.json
      runtime.mjs
      README.md
      i18n/
        en.json
        zh-CN.json
    plugins-feishu-duplicate-id/
      issue.json
      preflight.mjs
      repair.mjs
      README.md
      i18n/
        en.json
        zh-CN.json
  runtime/
    bootstrap/
      bash-init.bash
      logger.mjs
      node-entry.mjs
    config/
      enabled-issues.json
  test/
```

## 5. 分层职责

### 5.1 `issues/`

`issues/` 是问题知识层。

每个 issue 目录负责承载：

- `issue.json`
  issue 元数据
- `README.md`
  issue 文档
- `preflight.mjs` / `runtime.mjs` / `repair.mjs`
  对应能力面的实现
- `i18n/*.json`
  该 issue 的本地化文案

### 5.2 `core/`

`core/` 是执行层。

它负责：

- issue 发现与校验
- 运行时路径求值
- 语言解析与文案渲染
- `preflight` / `runtime` / `repair` runner
- 结构化日志输出

`core/` 不应承载任何 issue 特定业务逻辑。

### 5.3 `runtime/`

`runtime/` 是部署层。

它存在的原因是：

- 当前 `~/.openclaw/local-overrides` 的运行时挂载方式已经验证可行
- shell 与 Node 的统一接入入口需要一个稳定的导出目录

因此：

- `runtime/` 只负责接入与分发
- 具体 issue 逻辑应落在 `issues/`
- 共享机制应落在 `core/`

## 6. 运行时接入模型

### 6.1 Shell 入口

当前 shell 统一入口是：

- `runtime/bootstrap/bash-init.bash`

它负责：

- 在 shell 中接管 `openclaw`
- 给目标进程注入 `NODE_OPTIONS=--import=.../node-entry.mjs`
- 透传仓库根、运行时根、日志目录等上下文

它不负责：

- issue 匹配
- issue 业务逻辑

### 6.2 Node 入口

当前 Node 统一入口是：

- `runtime/bootstrap/node-entry.mjs`

它负责把控制权交给：

- `core/runtime-runner.mjs`

### 6.3 运行时挂载路径

当前约定仍保留：

```text
$HOME/.openclaw/local-overrides
```

但这个目录只是运行时软链接入口，不要求 Git 仓库本身必须位于 `~/.openclaw/` 下。

## 7. 配置模型

当前运行时启停覆盖文件是：

- `runtime/config/enabled-issues.json`

格式为：

```json
{
  "enabledIssues": [],
  "disabledIssues": []
}
```

求值顺序是：

1. 发现 `issues/` 下所有 issue
2. 先取 `enabledByDefault: true` 的 issue
3. 再叠加 `enabledIssues`
4. 最后减去 `disabledIssues`

## 8. issue 元数据模型

每个 issue 至少应包含一个 `issue.json`。

当前建议字段包括：

- `id`
- `title`
- `category`
- `severity`
- `summary`
- `enabledByDefault`
- `capabilities`
- `triggers`
- `entry`
- `env.variables`
- `logging.file`
- `upstream`

其中：

- `capabilities`
  描述 issue 当前启用哪些能力面
- `triggers`
  描述 issue 命中的基本条件
- `entry`
  描述对应能力面的实现文件

## 9. 多语言设计

### 9.1 目标

所有面向用户的文本输出都应尽量跟随当前运行时语言。

当前最低要求：

- 支持 `zh-CN`
- 支持 `en`
- 无法识别时兜底 `en`

### 9.2 语言优先级

当前语言解析顺序为：

1. `OPENCLAW_GUARDIAN_LANG`
2. `LC_ALL`
3. `LC_MESSAGES`
4. `LANG`
5. 默认 `en`

### 9.3 文案分层

建议保持两层输出：

1. 结构化日志
   面向程序，不依赖自然语言
2. 用户可见文本
   通过 issue 的 `i18n/*.json` 渲染

## 10. 与上游 `OpenClaw` 的关系

`openclaw-guardian` 是上游的补充层，不是替代层。

边界原则：

- 能交给 `openclaw doctor` 或 `openclaw plugins doctor` 的，不重复实现
- 上游未覆盖、覆盖不够细、或环境特有的问题，由 guardian 补齐

理想体验应是：

1. 用户照常运行 `openclaw`
2. guardian 在必要时给出高信号提示
3. 用户获得明确下一步：
   - 上游命令
   - guardian 的 `repair`
   - 或继续运行时缓解

## 11. 当前内置 issue

### `openai-codex-oauth-proxy-failure`

类型：

- `auth`

当前能力面：

- `runtime`

目标问题：

- `openclaw models auth login --provider openai-codex`
  在某些 HTTP 代理环境下，浏览器授权已经成功，但 `oauth/token` 交换失败

当前做法：

- 为进程安装 `EnvHttpProxyAgent`
- 仅对 `https://auth.openai.com/oauth/token` 增加窄范围 `curl fallback`

### `plugins-feishu-duplicate-id`

类型：

- `plugins`

当前能力面：

- `preflight`
- `repair`

目标问题：

- 本地额外存在 `feishu` 扩展或显式安装引用
- 与内置 `feishu` 插件使用相同 plugin id
- 在 `gateway restart`、`plugins list` 等命令前后触发重复插件告警

当前做法：

- 在相关命令执行前做 `preflight`
- 给出 `openclaw plugins doctor` 与 `guardian repair ...` 的建议
- 在显式 `repair --apply` 时备份本地扩展并清理显式安装引用

## 12. 后续扩展方向

当前框架已经具备继续扩展的基础，下一批适合进入的问题类型包括：

- 插件冲突类问题
  例如 `plugins-feishu-duplicate-id`
- 配置缺失或残留类问题
- gateway / models / auth 相关的本地状态问题

优先顺序建议是：

1. 扩展更多 `preflight + repair` issue
2. 完善显式 `guardian` CLI
3. 扩展更多语言，但保持 `zh-CN + en` 为最低稳定基线

## 13. 非目标

当前项目不追求：

- 取代上游 `OpenClaw` 官方诊断体系
- 一次性覆盖所有本地问题
- 一开始就支持所有语言
- 为所有 issue 自动执行持久化修复

## 14. 总结

`openclaw-guardian` 当前已经从“本地覆盖脚本集合”转为：

> 以 issue 为中心、以 `preflight` / `runtime` / `repair` 为能力面的 `OpenClaw` 本地问题治理框架。

后续新增问题时，应优先思考：

1. 这是一个什么 issue
2. 它需要哪些能力面
3. 它和上游 `doctor` 的边界在哪里
4. 用户在什么时机最应该看到提示
