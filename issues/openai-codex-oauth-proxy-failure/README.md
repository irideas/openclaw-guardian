# `openai-codex-oauth-proxy-failure`

## Issue 定位

这是 `openclaw-guardian` 当前内置的一个 `auth` 类 issue。

它描述的问题现象是：

```bash
openclaw models auth login --provider openai-codex
```

在某些 HTTP 代理环境下：

- 浏览器授权已经成功
- `localhost` 回调也已经成功
- 但 CLI 阶段的 `oauth/token` 交换仍然失败

常见表现包括：

- `unsupported_country_region_territory`
- `fetch failed`
- 代理链路明明可用，但 `openai-codex` OAuth 仍不能落 token

## 当前能力面

本 issue 当前启用的能力面是：

- `runtime`

也就是说，它当前不是通过前置检查或显式修复命令解决，
而是在命中的运行时链路里做非常窄的修复。

在 [issue.json](./issue.json) 中，这一点体现在：

- `capabilities.runtime = true`
- `entry.runtime = "./runtime.mjs"`

## 触发条件

当命令参数同时满足下面条件时，这个 issue 会被自动命中：

- 参数中包含 `models`
- 参数中包含 `auth`
- 参数中包含 `login`
- `--provider` 明确等于 `openai-codex`

声明位置见 [issue.json](./issue.json) 的：

- `triggers.argvAll`
- `triggers.provider`

## 当前修复思路

这个 issue 的 `runtime` 实现位于 [runtime.mjs](./runtime.mjs)。

当前修复分两层：

1. 安装 `EnvHttpProxyAgent`
   让当前 `openclaw` 进程中的裸 `fetch(...)` 能继承 `HTTP_PROXY` / `HTTPS_PROXY`
2. 只对 `https://auth.openai.com/oauth/token`
   增加非常窄的 `curl fallback`

这样做的目的有两个：

- 尽量不扩大影响范围
- 只修复这条已确认异常的 OAuth token 交换链路

## 接入方式

统一接入入口是：

- `runtime/bootstrap/bash-init.bash`
- `runtime/bootstrap/node-entry.mjs`

它们负责：

1. 接管 `openclaw` 命令
2. 发现可用 issue
3. 读取 `enabled-issues.json`
4. 在命中时加载本 issue 的 [runtime.mjs](./runtime.mjs)

运行时启停覆盖文件是：

- `runtime/config/enabled-issues.json`

## 日志

这个 issue 的日志默认写入：

```text
$HOME/.openclaw/logs/local-overrides/openai-codex-oauth-proxy-failure.log
```

常见事件包括：

- `issue_activate_start`
- `preload_loaded`
- `preload_activated`
- `curl_fallback_installed`
- `curl_fallback_spawn`
- `curl_fallback_succeeded`
- `curl_fallback_failed`

统一运行时日志仍写入：

```text
$HOME/.openclaw/logs/local-overrides/runtime.log
```

## 开关与调试

全局关闭整个 guardian：

```bash
OPENCLAW_GUARDIAN_DISABLE=1 openclaw models auth login --provider openai-codex
```

关闭本 issue 的 runtime 修复：

```bash
OPENCLAW_GUARDIAN_ISSUE_OPENAI_CODEX_OAUTH_PROXY_FAILURE_DISABLE=1 openclaw models auth login --provider openai-codex
```

仅关闭 `curl fallback`：

```bash
OPENCLAW_GUARDIAN_ISSUE_OPENAI_CODEX_OAUTH_PROXY_FAILURE_CURL_FALLBACK_DISABLE=1 openclaw models auth login --provider openai-codex
```

强制在非匹配命令上激活本 issue，便于调试：

```bash
OPENCLAW_GUARDIAN_FORCE_ISSUES=openai-codex-oauth-proxy-failure node ...
```

## 多语言

本 issue 的用户可见文案位于：

- [i18n/zh-CN.json](./i18n/zh-CN.json)
- [i18n/en.json](./i18n/en.json)

当前运行时会优先跟随：

- `OPENCLAW_GUARDIAN_LANG`
- `LC_ALL`
- `LC_MESSAGES`
- `LANG`

无法识别时兜底为 `en`。

## 测试

自动化测试分三层：

1. 单测
   覆盖公共 issue 发现、匹配、启停与路径求值逻辑
2. 集成测试
   验证统一 runtime 路由与本 issue 的假 `oauth/token` 交换
3. 人工 E2E
   验证真实浏览器授权、真实 token 交换与真实落盘

在仓库根目录执行：

```bash
npm test
```

执行需要真实 HTTP 代理的集成测试：

```bash
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
npm run test:integration
```

进一步说明见：

- [TESTING.md](../../docs/TESTING.md)
- [MANUAL-E2E.md](../../docs/MANUAL-E2E.md)
