# `openai-codex-oauth-proxy-failure`

## 一句话说明

这个 issue 处理的是：

```bash
openclaw models auth login --provider openai-codex
```

浏览器授权看起来已经完成，但 `OpenClaw` 最终没有成功把 `openai-codex` 的认证信息写入本地。

当前 alias：

- `codex-auth`

## 现象

典型执行路径是：

1. 终端拉起浏览器授权
2. 浏览器完成登录与授权
3. `localhost` 回调成功
4. CLI 最后一步仍失败，没有写入认证信息

常见报错包括：

- `API Error: Status Code 403`
- `unsupported_country_region_territory`
- `Country, region, or territory not supported`
- `fetch failed`

从用户视角看，真正的问题不是“浏览器没打开”，而是：

- 浏览器授权成功了
- 但最终 token 没换下来
- 所以本地认证配置没有更新

## 归因分析

这个 issue 关注的是一类已经验证过的失败路径：

- 浏览器阶段没问题
- 本地回调阶段没问题
- 失败发生在 CLI 侧对 `https://auth.openai.com/oauth/token` 的最终交换

在我们已经复现和验证过的场景里，常见归因包括：

1. `OpenClaw` 的这条登录链路没有按预期走到可用的 HTTP 代理出口
2. 裸 `fetch(...)` 与 `curl` 在同一代理环境下行为不同
3. 目标端点返回 `403 unsupported_country_region_territory`
4. 因为最终 token 交换失败，导致认证信息无法写入本地

也就是说，这个 issue 的核心现象是“认证写入失败”，而当前缓解手段聚焦在其中一条高概率根因：

- 最终 token 交换阶段的网络链路不稳定或不正确

## guardian 的解决方案

这个 issue 当前启用的能力面是：

- `mitigation`

也就是说，它不会提前修改本地文件，也不会提供显式 `repair`，而是在命中的执行链路里做一层非常窄的运行中缓解。

在 [mitigation.mjs](./mitigation.mjs) 里，当前方案分两层：

1. 为当前 `openclaw` 进程安装 `EnvHttpProxyAgent`
   让裸 `fetch(...)` 更可靠地继承 `HTTP_PROXY` / `HTTPS_PROXY`
2. 只对 `https://auth.openai.com/oauth/token`
   增加极小范围的 `curl fallback`

需要特别说明的是：

- `curl fallback` 只是兜底，不是强制接管
- 如果 `curl` 自己因为瞬时 TLS / 代理链路波动失败，guardian 会自动退回原始
  `fetch + EnvHttpProxyAgent`
- 不再因为一次 `curl` 传输层失败就直接把整次 OAuth 登录打死

这个方案的目标不是改写整个 `OpenClaw` 网络栈，而是只修复这条已经明确定位的问题链路：

- 浏览器授权后
- 最终 token 交换
- 本地认证信息写入

## 触发条件

当命令参数同时满足下面条件时，这个 issue 会被自动命中：

- 参数中包含 `models`
- 参数中包含 `auth`
- 参数中包含 `login`
- `--provider` 明确等于 `openai-codex`

声明位置见 [issue.json](./issue.json) 的：

- `triggers.argvAll`
- `triggers.provider`

## 适用版本

当前 `issue.json` 约定的 `OpenClaw` 版本范围是：

- `>=2026.3.13 <2026.4.0`

如果当前 `OpenClaw` 版本不在这个范围内，guardian 不会激活本 issue 的 `mitigation`。

## 使用方式

日常使用时，不需要单独执行 guardian 命令。  
只要你已经接入：

- `bridge/bootstrap/bash-init.bash`

那么正常运行：

```bash
openclaw models auth login --provider openai-codex
```

guardian 就会在后台自动决定是否对这次命令启用 `mitigation`。

如果只是想查看当前 issue 状态，可以执行：

```bash
guardian issue show codex-auth
```

## 日志与验证

这个 issue 的日志默认写入：

```text
$HOME/.openclaw/logs/guardian/openai-codex-oauth-proxy-failure.log
```

统一入口日志写入：

```text
$HOME/.openclaw/logs/guardian/guardian.log
```

重点事件包括：

- `issue_activate_start`
- `preload_loaded`
- `preload_activated`
- `curl_fallback_installed`
- `curl_fallback_spawn`
- `curl_fallback_succeeded`
- `curl_fallback_failed`
- `curl_fallback_degraded_to_fetch`
- `curl_fallback_then_fetch_failed`

如果要验证这个 issue 是否真正解决了问题，应重点看：

1. `openclaw models auth login --provider openai-codex` 是否最终成功退出
2. issue 日志里是否出现 `curl_fallback_succeeded`
3. `auth-profiles.json` 是否真的写入了新的认证信息

更完整的人工闭环见：

- [MANUAL-E2E.md](../../docs/MANUAL-E2E.md)

## 开关与调试

全局关闭整个 guardian：

```bash
OPENCLAW_GUARDIAN_DISABLE=1 openclaw models auth login --provider openai-codex
```

关闭本 issue 的缓解逻辑：

```bash
OPENCLAW_GUARDIAN_CODEX_AUTH_DISABLE=1 openclaw models auth login --provider openai-codex
```

仅关闭 `curl fallback`：

```bash
OPENCLAW_GUARDIAN_CODEX_AUTH_CURL_FALLBACK_DISABLE=1 openclaw models auth login --provider openai-codex
```

强制在非匹配命令上激活本 issue，便于调试：

```bash
OPENCLAW_GUARDIAN_FORCE_ISSUES=codex-auth node ...
```

## 相关文档

- [README.md](../../README.md)
- [TESTING.md](../../docs/TESTING.md)
- [MANUAL-E2E.md](../../docs/MANUAL-E2E.md)
