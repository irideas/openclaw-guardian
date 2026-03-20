# `openai-codex-auth-proxy`

## 模块定位

这是 `openclaw-local-overrides` 的一个具体模块，
用于修复：

```bash
openclaw models auth login --provider openai-codex
```

在某些 HTTP 代理环境下，
浏览器授权成功后，
CLI 阶段的 `code -> token` 交换失败的问题。

## 工作方式

本模块不再自己负责 shell 接入。

当前版本采用统一框架：

1. `bootstrap/bash-init.bash`
   负责统一接管 `openclaw` 命令
2. `bootstrap/node-preload-entry.mjs`
   负责读取配置并路由模块
3. 本模块的 [module.json](./module.json)
   负责声明匹配规则
4. 本模块的 [preload-hook.mjs](./preload-hook.mjs)
   负责真正的修复逻辑

## 模块匹配条件

当命令参数同时满足下面条件时，本模块会被自动激活：

- 包含 `models`
- 包含 `auth`
- 包含 `login`
- `--provider` 明确等于 `openai-codex`

声明位置见：
[module.json](./module.json)

其中当前用到的关键字段是：

- `kind`
- `enabledByDefault`
- `match.argvAll`
- `match.provider`
- `entry.preload`
- `env.variables`
- `logging.file`

当前模块的策略是：

- `kind = "node-preload"`
- `enabledByDefault = true`

这表示它属于统一运行时中的 Node preload 模块，
并且在没有被 `disabledModules` 显式关闭时默认生效。

## 修复逻辑

本模块当前做两层修复：

1. 安装 `EnvHttpProxyAgent`
   让 `openclaw` 进程中的裸 `fetch(...)` 能继承 `HTTP_PROXY` / `HTTPS_PROXY`
2. 只对 `https://auth.openai.com/oauth/token`
   增加极窄的 `curl fallback`

这样可以兼顾：

- 尽量不扩大影响范围
- 只修复这条 OAuth 登录链路上的已知异常端点

## 启用方式

只需要：

1. 在 `~/.bash_profile` 中接入统一入口
2. 保证本模块出现在 `config/enabled-modules.json`

统一入口示例：

```bash
[ -f "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash"
```

启用配置位置：
[enabled-modules.json](../../config/enabled-modules.json)

## 日志

本模块日志写入：

```text
$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log
```

常见事件包括：

- `module_activate_start`
- `preload_loaded`
- `preload_activated`
- `curl_fallback_installed`
- `curl_fallback_spawn`
- `curl_fallback_succeeded`
- `curl_fallback_failed`

## 调试与开关

全局禁用整个本地覆盖框架：

```bash
OPENCLAW_LOCAL_OVERRIDES_DISABLE=1 openclaw models auth login --provider openai-codex
```

禁用本模块自身逻辑的调试开关：

```bash
OPENCLAW_PROXY_PRELOAD_DISABLE=1 openclaw models auth login --provider openai-codex
```

仅禁用 `curl fallback`：

```bash
OPENCLAW_PROXY_CURL_FALLBACK_DISABLE=1 openclaw models auth login --provider openai-codex
```

强制在非匹配命令上激活本模块，便于单独调试：

```bash
OPENCLAW_LOCAL_OVERRIDES_FORCE_MODULES=openai-codex-auth-proxy node ...
```

## 测试

本模块当前已有两类测试：

1. 单测
   由公共运行时测试覆盖模块匹配、配置解析和 schema 约定
2. 集成测试
   真实拉起统一 preload 路由，并对假 `oauth/token` 请求断言 `401 token_expired`
3. 人工 E2E
   验证真实浏览器授权、真实 token 交换和真实落盘

在本仓库根目录执行：

```bash
npm test
```

这会只执行 `unit`。

如果要执行集成测试：

```bash
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
npm run test:integration
```

如果你希望测试显式使用某个代理，而不是继承当前 shell 的 `HTTP_PROXY` / `HTTPS_PROXY`，
可以额外设置：

```bash
export OPENCLAW_PROXY_TEST_PROXY_URL=http://<your-http-proxy-host>:<port>
```

人工 E2E 清单见：

- [MANUAL-E2E.md](../../MANUAL-E2E.md)

这里保留 `OPENCLAW_PROXY_PRELOAD_DISABLE`，
主要是为了兼容既有调试习惯。

## 版本与维护

本模块随仓库统一版本演进。

相关信息见：

- [CHANGELOG.md](../../CHANGELOG.md)
- [AGENTS.md](../../AGENTS.md)
