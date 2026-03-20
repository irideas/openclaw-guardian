# Manual E2E Checklist

本文档记录 `openai-codex-auth-proxy` 的人工端到端验证步骤。

这份清单的目标不是替代自动化测试，而是验证：

> 真实浏览器授权、真实本地回调、真实 token 落盘，是否在当前环境中最终成功

## 适用场景

当你修改了以下任一内容时，建议执行一次人工 E2E：

- `runtime/bootstrap/bash-init.bash`
- `runtime/bootstrap/node-preload-entry.mjs`
- `runtime/modules/openai-codex-auth-proxy/module.json`
- `runtime/modules/openai-codex-auth-proxy/preload-hook.mjs`
- 与代理接管、`curl fallback`、日志路径、运行时路由相关的核心逻辑

## 前置条件

1. 已按 README 完成安装

这里不要求 Git 仓库位于固定目录。
只要你已经把仓库 clone 到任意 `<repo-dir>`，
并建立了：

```text
$HOME/.openclaw/local-overrides -> <repo-dir>/runtime
```

即可继续下面步骤。

2. 已按 README 接入统一入口

```bash
source ~/.bash_profile
```

3. 已准备可用的 HTTP 代理

```bash
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
```

4. 当前环境可以打开浏览器并完成 OpenAI 登录

## 验证步骤

### 1. 启动真实登录命令

```bash
openclaw models auth login --provider openai-codex
```

### 2. 在浏览器完成授权

观察命令输出中的 OpenAI 授权链接，
在浏览器里完成登录和授权。

### 3. 验证命令结果

成功时应看到类似结果：

```text
OpenAI OAuth complete
```

以及认证配置被更新。

### 4. 检查运行日志

检查统一运行日志：

```bash
tail -n 20 "$HOME/.openclaw/logs/local-overrides/runtime.log"
```

检查模块日志：

```bash
tail -n 40 "$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log"
```

重点确认存在：

- `module_activate_start`
- `preload_activated`
- `curl_fallback_spawn`
- `curl_fallback_succeeded`

并且 `curl_fallback_succeeded` 的 `status` 为 `200`

### 5. 检查 token 是否落盘

检查：

```text
$HOME/.openclaw/agents/main/agent/auth-profiles.json
```

确认 `openai-codex:default` 的以下字段已更新：

- `access`
- `refresh`
- `expires`
- `accountId`

## 失败时应记录的信息

如果人工 E2E 失败，至少保留：

- 执行命令的完整终端输出
- `runtime.log`
- `openai-codex-auth-proxy.log`
- 当前代理环境变量
- 浏览器是否完成授权
- 是否收到 `localhost:1455/auth/callback`

## 结论标准

只有同时满足下面条件，才可判定人工 E2E 通过：

1. 浏览器授权成功
2. CLI 没有报错退出
3. 模块日志里出现 `curl_fallback_succeeded` 且状态为 `200`
4. `auth-profiles.json` 里对应 profile 已更新
