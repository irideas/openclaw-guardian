# `openai-codex-auth-proxy`

## 背景

在当前环境中，`openclaw models auth login --provider openai-codex` 的 OAuth 登录流程存在一个非常具体的问题：

1. 浏览器里的 OpenAI 授权页可以正常打开
2. `http://localhost:1455/auth/callback` 可以正常收到回调
3. 但 CLI 在执行 `code -> token` 交换时，可能返回：

```text
[openai-codex] code->token failed: 403 {"error":{"code":"unsupported_country_region_territory","message":"Country, region, or territory not supported","param":null,"type":"request_forbidden"}}
```

这不是浏览器授权失败，而是后续 CLI 进程里那次 `POST https://auth.openai.com/oauth/token` 的网络出口不符合预期。

## 已验证的技术结论

结合源码检查和本地对照实验，可以确认：

1. `openclaw` 的这条登录链路最终会调用到 `@mariozechner/pi-ai` 中的裸 `fetch(TOKEN_URL, ...)`
2. 这一步没有显式传入 `dispatcher`
3. `models auth login` 这条 CLI 路径本身也没有提前安装全局 `EnvHttpProxyAgent`
4. 结果是：即使外层 shell 设置了 `HTTP_PROXY` / `HTTPS_PROXY`，这条 `fetch(...)` 也可能没有按预期走代理

本地实验进一步证明：

- 同样是请求 `oauth/token`
- 使用显式代理的 `EnvHttpProxyAgent` 或 `curl -x ...` 时，假 `code` 会得到正常的 `401 token_expired`
- 使用未显式代理的纯 Node `fetch` 路径时，则可能得到 `403 unsupported_country_region_territory`
- 在某些代理链路下，即使已经显式安装 `EnvHttpProxyAgent`，`undici` 访问这个端点仍可能出现 `Connect Timeout Error`
- 同一条代理链路上，如果改用 `curl -x ...` 请求这个端点，则可以稳定拿到 `200` 或 `401`

这说明问题不是“账号一定不支持”或“代理一定不可用”，而是 **目标登录链路没有稳定走到代理感知的 HTTP 客户端**。

## 设计目标

这个本地覆盖方案要同时满足下面几件事：

1. 你仍然直接输入：

```bash
openclaw models auth login --provider openai-codex
```

2. 不修改全局安装的 `openclaw` 包
3. 不依赖 `.debug/` 目录
4. 覆盖逻辑放在 `~/.openclaw/` 下，便于长期维护
5. 升级 `openclaw` 后尽量不受影响
6. 其他普通 `openclaw` 命令默认不受影响
7. 将来如果要扩展到 web 控制台、daemon、其他启动入口，这个目录仍然可以继续承载

## 方案选择

最终选择的是：

1. **Bash 同名轻包装**
   文件：`bash-init.bash`
2. **Node preload 注入**
   文件：`env-proxy-preload.mjs`
3. **`oauth/token` 端点的极窄 `curl fallback`**
   逻辑同样位于：`env-proxy-preload.mjs`

两者配合的工作方式如下：

### 第 1 层：Bash 包装层

在 Bash 启动时，通过 `~/.bash_profile` `source` 本目录下的 `bash-init.bash`。

它会定义一个同名函数 `openclaw()`：

- 如果你执行的是普通 `openclaw` 命令，则直接透传给真实二进制
- 如果你执行的是：
  `openclaw models auth login --provider openai-codex`
  则只对这一次子进程临时注入：

```text
NODE_OPTIONS=--import=$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/env-proxy-preload.mjs
```

这里的关键点是：

- 注入只发生在这一条命令
- 不是把 `NODE_OPTIONS` 全局导出到整个 shell
- 因此不会无差别影响别的 Node 程序

### 第 2 层：Node preload 层

`env-proxy-preload.mjs` 会在 `openclaw` 主程序真正启动前执行。

它会：

1. 判断当前命令是否真的是目标登录命令
2. 读取当前 shell 的 `HTTP_PROXY` / `HTTPS_PROXY`
3. 定位当前 `openclaw` 安装目录
4. 加载当前 `openclaw` 自带的 `undici`
5. 执行：

```js
setGlobalDispatcher(new EnvHttpProxyAgent())
```

这样后续 CLI 里那条裸 `fetch(...)` 就能继承代理设置。

同时，当前版本还会额外安装一个只针对
`https://auth.openai.com/oauth/token` 的极窄回退层：

- 除这个端点外，其他请求仍走原始 `fetch`
- 只有这个端点会切换成 `curl -x <proxy>` 发起请求
- `curl` 的响应会被重新包装成标准 `Response`，因此业务代码无需感知

之所以要多这一层，不是为了替代 `undici`，而是因为本地已经验证过：

- `EnvHttpProxyAgent` 解决了“未显式走代理”的第一层问题
- 但在某些代理链路下，`undici` 访问 `oauth/token` 仍可能超时
- 同路径上的 `curl` 却可以稳定完成 token 交换

因此最终的正式方案实际上是“两层修复”：

1. 用 `EnvHttpProxyAgent` 修正全局 `fetch` 的代理感知
2. 用极窄的 `curl fallback` 兜住 `oauth/token` 这个已知异常端点

## 为什么不用这些方案

### 不采用“直接修改全局安装包”

例如直接修改：

- `.../node_modules/openclaw/...`
- `.../node_modules/@mariozechner/pi-ai/...`

原因：

- 升级后容易被覆盖
- 难以追踪本地改动
- 回滚不够干净

### 不采用“全局 export NODE_OPTIONS”

例如在 `~/.bash_profile` 里长期写：

```bash
export NODE_OPTIONS=--import=...
```

原因：

- 会影响所有 Node 程序
- 影响面过大
- 不符合“只修复这一条登录命令”的最小作用域原则

### 不采用“把正式逻辑放到 .debug”

原因：

- `.debug/` 只应该存放实验脚本、临时数据、调试记录
- 正式交付逻辑应当放在稳定目录

## 目录结构

```text
$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/
  README.md
  bash-init.bash
  env-proxy-preload.mjs
```

日志路径：

```text
$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log
```

## 安装步骤

### 1. 准备目录

将本模块放到：

```text
$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/
```

如果你是通过仓库整体安装，本步骤通常已经完成。

### 2. 在 Bash 启动文件中接入

在 `~/.bash_profile` 中增加：

```bash
[ -f "$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/bash-init.bash"
```

### 3. 重新加载 Shell

重新打开一个 Bash 会话，或执行：

```bash
source ~/.bash_profile
```

### 4. 配置代理环境变量

在运行目标命令前，当前 shell 需要已经设置好 HTTP 代理，例如：

```bash
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
```

### 5. 验证包装层是否生效

执行：

```bash
type -a openclaw
```

如果接入成功，输出中通常会先看到：

```text
openclaw is a function
```

同时原始二进制路径仍应保留在后续输出中。

## 使用方式

命令不变，仍然直接执行：

```bash
openclaw models auth login --provider openai-codex
```

只要当前 shell 已经准备好了正确的代理环境变量，
包装层就会在这条命令上自动注入 `preload`。

在当前实现中，这条命令的完整成功路径是：

1. 浏览器完成 OpenAI 授权
2. CLI 收到 `localhost:1455/auth/callback`
3. preload 已提前安装 `EnvHttpProxyAgent`
4. 当 CLI 交换 `code -> token` 时，`oauth/token` 请求由 `curl fallback` 接管
5. 成功拿到 token，并写回本地 `auth-profiles.json`

## 快速验证

如果你还不想立即做真实 OAuth 登录，可以先执行：

```bash
openclaw models auth login --provider openai-codex --help
```

然后检查日志：

```bash
tail -n 20 "$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log"
```

如果日志里能看到：

- `source = "bash-init"` 且 `event = "inject_preload"`
- `source = "env-proxy-preload"` 且 `event = "preload_activated"`
- `source = "env-proxy-preload"` 且 `event = "curl_fallback_installed"`

说明这套覆盖逻辑已经成功接管目标命令。

## 作用范围

这个方案只影响：

- **加载了 `~/.bash_profile` 的 Bash 会话**
- 且只在执行目标登录命令时

默认不会影响：

- 普通 `openclaw` 命令
- 其他 Node 程序
- 未经过该 Bash 包装层启动的 `openclaw` 进程
- web 控制台 / daemon / gateway 的既有启动方式

## 将来如何扩展到 web 控制台

将来如果要让 web 控制台触发的同类登录路径也应用相同修复，
可以继续在本目录新增对应入口，例如：

- 控制台启动脚本
- 统一的 launcher
- 共享的环境装配逻辑

也就是说，这个目录的定位不是“只放 shell 文件”，而是：

> 存放本机对 `openclaw` 行为所做的、不会随上游升级丢失的本地覆盖层

## 回滚方式

如果要临时禁用本方案，有三种方式：

### 方式 1：单次禁用

```bash
OPENCLAW_PROXY_PRELOAD_DISABLE=1 openclaw models auth login --provider openai-codex
```

如果只想禁用 `curl fallback`，但仍保留 `EnvHttpProxyAgent`，可以使用：

```bash
OPENCLAW_PROXY_CURL_FALLBACK_DISABLE=1 openclaw models auth login --provider openai-codex
```

### 方式 2：当前 shell 禁用

```bash
export OPENCLAW_PROXY_PRELOAD_DISABLE=1
```

### 方式 3：彻底移除

1. 删除 `~/.bash_profile` 中对应的 `source` 行
2. 重新打开 shell
3. 如有需要，再删除本目录

## 日志说明

运行日志会写入：

`$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log`

日志包含两层来源：

- `source = "bash-init"`
- `source = "env-proxy-preload"`

可以用来判断：

- 这次命令是否命中了包装层
- preload 是否被注入
- preload 是否成功激活
- 当时使用的代理值是什么
- 是否安装了 `curl fallback`
- `oauth/token` 是否真的由 `curl` 发出
- `curl fallback` 最终返回的状态码是什么

常见事件包括：

- `inject_preload`
- `preload_loaded`
- `preload_activated`
- `curl_fallback_installed`
- `curl_fallback_spawn`
- `curl_fallback_succeeded`
- `curl_fallback_failed`

## 维护说明

如果未来 `openclaw` 的全局安装目录结构变化较大，
可能需要调整 `env-proxy-preload.mjs` 中的 `resolveOpenClawRoot()` 逻辑。

但即便如此，这种维护仍然局限在本目录内，
不会要求直接改动全局安装包本身。
