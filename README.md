# `openclaw-guardian`

`openclaw-guardian` 是一个面向 `OpenClaw` 的本地问题治理仓库。
它不替代上游，不重打包 `OpenClaw`，而是围绕真实环境里的运行时异常、配置冲突与可复现故障，
提供一套可本地接入、可逐步下线、可独立维护的问题发现与修复机制。

当前版本：`1.0.0`

## 这是什么

这个项目关注的不是“怎么扩展 `OpenClaw` 功能”，而是：

- 当 `OpenClaw` 在某些网络、代理、插件或系统环境里出现异常时，如何更早发现问题
- 当问题已经出现时，如何用最小侵入的方式临时缓解或修复
- 当上游还没有合适修复时，如何把本地经验沉淀成可共享、可维护的方案

项目以 **issue** 为中心组织内容。  
一个 issue 表示一种明确的问题现象，例如：

- 某条 OAuth 登录链路在 HTTP 代理环境下失败
- 某个插件因为本地状态冲突而重复注册
- 某类命令在特定环境变量或本地配置下会稳定触发告警

围绕一个 issue，可以逐步补齐三种能力：

- `preflight`
  在命令真正执行前检查风险，并输出提示
- `runtime`
  在命中场景下做进程内窄修复
- `repair`
  以显式、可审计的方式执行本地修复动作

## 当前解决的问题

当前仓库已经内置两个 issue：

- [openai-codex-oauth-proxy-failure](./issues/openai-codex-oauth-proxy-failure/README.md)
- [plugins-feishu-duplicate-id](./issues/plugins-feishu-duplicate-id/README.md)

当前两个代表问题分别是：

```bash
openclaw models auth login --provider openai-codex
```

在某些 HTTP 代理环境下：

- 浏览器授权已经成功
- 本地回调也已经成功
- 但 CLI 阶段的 `oauth/token` 交换仍然失败

典型症状包括：

- `unsupported_country_region_territory`
- `fetch failed`
- 明明代理可用，但 `OpenClaw` 的 `openai-codex` OAuth 流程仍无法完成

这个 issue 当前主要通过 `runtime` 能力面落地，
即在命中的运行时链路上做非常窄的代理接管与 `curl fallback`。

以及：

```bash
openclaw gateway restart
openclaw plugins list
```

在本地额外存在 `feishu` 扩展时，可能出现：

- `plugin feishu: duplicate plugin id detected`
- `plugins.allow is empty; discovered non-bundled plugins may auto-load`

这个 issue 当前通过 `preflight + repair` 能力面落地，
即先做命令前检测，再提供显式修复动作。

## 为什么需要它

这类问题如果直接去改全局安装包，通常会有几个问题：

- 升级后容易被覆盖
- 本地改动不易审计
- 不方便分享给其他使用者
- 难以沉淀成一套长期维护的经验库

而把方案沉淀到独立仓库，有几个直接好处：

- 不修改上游安装包
- 本地接入与撤销都很轻
- 每个 issue 可以独立演进
- 可以逐步从单一修复脚本收敛为问题现象库

## 核心思路

`openclaw-guardian` 的中心不是“运行时模块”，而是“问题现象”。

也就是说，项目思路是：

1. 先识别一个真实问题现象
2. 给它分配稳定的 issue id
3. 为这个 issue 补充：
   - 现象描述
   - 触发条件
   - 用户可见提示
   - `preflight` / `runtime` / `repair` 中合适的能力
4. 再把可重复的执行套路沉淀到公共 `core/`

这让项目可以同时承载：

- 运行时链路修复
- 命令前置检查
- 显式本地修复

而不会把所有能力都挤进一种技术手段里。

## 目录结构

```text
openclaw-guardian/
  cli/
    guardian.mjs
  .github/
    workflows/
      test.yml
  AGENTS.md
  CHANGELOG.md
  LICENSE
  docs/
    ARCHITECTURE.md
    MANUAL-E2E.md
    TESTING.md
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
    issue-loader.test.mjs
    preflight-runner.test.mjs
    repair-runner.test.mjs
    openai-codex-oauth-proxy-failure.integration.test.mjs
    test-helpers.mjs
  package.json
```

其中：

- `issues/`
  负责承载具体问题现象
- `core/`
  负责承载公共执行机制
- `runtime/`
  负责导出真正接入 `OpenClaw` 运行时的薄入口

## 多语言输出

所有用户可见输出都应尽量跟随当前运行时语言。

当前约定是：

- 至少支持 `zh-CN` 与 `en`
- 当无法识别当前语言时，兜底为 `en`
- issue 自己维护各自的 `i18n/` 文案
- 公共层只负责语言解析与文案渲染

这样后续新增 issue 时，就可以在不改公共框架的前提下补齐对应语言。

接入 `bash-init.bash` 后，当前 shell 还会提供一个显式命令：

```bash
guardian
```

它可用于：

- `guardian issue list`
- `guardian issue show <issue-id>`
- `guardian repair <issue-id> --dry-run`
- `guardian repair <issue-id> --apply`

## 安装

下面示例中的：

- `<repo-url>`
  表示你自己的仓库地址
- `<repo-dir>`
  表示你自己选择的本地工程目录

### 1. 克隆仓库

```bash
git clone "<repo-url>" "<repo-dir>"
```

### 2. 建立运行时软链接

运行时固定使用：

```text
$HOME/.openclaw/local-overrides
```

但这个目录不直接承载整个仓库，而是软链接到仓库内的 `runtime/`：

```bash
ln -sfn "<repo-dir>/runtime" "$HOME/.openclaw/local-overrides"
```

### 3. 在 `~/.bash_profile` 中接入统一入口

```bash
[ -f "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash"
```

### 4. 重新加载 shell

```bash
source ~/.bash_profile
```

### 5. 配置 issue 启停覆盖

编辑：

```text
$HOME/.openclaw/local-overrides/config/enabled-issues.json
```

示例：

```json
{
  "enabledIssues": [],
  "disabledIssues": []
}
```

求值顺序是：

1. 先发现 `issues/` 下所有 issue
2. 先取所有 `enabledByDefault: true` 的 issue
3. 再合并 `enabledIssues`
4. 最后减去 `disabledIssues`

### 6. 验证接入

```bash
type -a openclaw
```

如果接入成功，输出中通常会先看到：

```text
openclaw is a function
```

然后可继续查看日志：

```bash
tail -n 20 "$HOME/.openclaw/logs/local-overrides/runtime.log"
```

也可以验证 `guardian` 是否已接入：

```bash
type -a guardian
```

## 测试

默认自动化门禁：

```bash
npm test
```

本地完整自动化测试：

```bash
npm run test:all
```

需要真实 HTTP 代理的集成测试：

```bash
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
npm run test:integration
```

更多说明见：

- [TESTING.md](./docs/TESTING.md)
- [MANUAL-E2E.md](./docs/MANUAL-E2E.md)

## 相关文档

- [CHANGELOG.md](./CHANGELOG.md)
- [AGENTS.md](./AGENTS.md)
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md)

仓库采用 [MIT License](./LICENSE)。
