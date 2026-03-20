# `openclaw-local-overrides`

这个仓库用于存放不会直接修改上游安装包、但又需要长期保留的本地覆盖层。

当前版本已经从“每个方案单独接入”收敛为：

- 一个统一 `bootstrap` 入口
- 一组可启停的 `modules`
- 一份集中配置 `config/enabled-modules.json`

## 目录结构

```text
local-overrides/
  bootstrap/
    bash-init.bash
    logger.mjs
    node-preload-entry.mjs
  config/
    enabled-modules.json
  modules/
    openai-codex-auth-proxy/
      module.json
      preload-hook.mjs
      README.md
```

## 设计原则

- 不直接修改全局安装的 `openclaw`
- 尽量不依赖临时调试目录
- 统一接入方式，不为每个方案各写一条 `source`
- 让“命令匹配、模块启停、日志套路”变成公共能力
- 把升级后的维护成本尽量留在本仓库内部

## 当前模块

- [openai-codex-auth-proxy](./modules/openai-codex-auth-proxy/README.md)
  用于修正 `openclaw models auth login --provider openai-codex`
  在某些代理环境下的 `oauth/token` 交换异常。

## 模块约定

每个模块目前遵循这一组公共约定：

- `modules/<module-id>/module.json`
  声明模块 id、匹配规则、入口文件和日志文件
- `modules/<module-id>/preload-hook.mjs`
  实现模块自己的 Node preload 行为
- `config/enabled-modules.json`
  负责决定哪些模块被统一运行时启用

当前 `module.json` 已支持的字段有：

- `id`
- `kind`
- `enabledByDefault`
- `match.argvAll`
- `match.provider`
- `entry.preload`
- `compat.legacyShellInit`
- `compat.legacyPreload`
- `env.variables`
- `logging.file`

## 安装步骤

### 1. 克隆仓库

```bash
git clone git@github.com:irideas/openclaw-local-overrides.git "$HOME/.openclaw/local-overrides"
```

### 2. 在 Shell 启动文件中接入统一入口

在 `~/.bash_profile` 中增加：

```bash
[ -f "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash"
```

### 3. 重新加载 Shell

```bash
source ~/.bash_profile
```

### 4. 配置模块启停覆盖

编辑：

```text
$HOME/.openclaw/local-overrides/config/enabled-modules.json
```

当前配置文件的职责是“覆盖默认行为”，例如：

```json
{
  "enabledModules": [],
  "disabledModules": []
}
```

实际的默认启用状态由各模块自己的 `module.json` 决定：

- `enabledByDefault: true`
  表示模块在未被显式禁用时默认生效
- `enabledByDefault: false`
  表示模块必须显式加入 `enabledModules`

因此配置求值顺序是：

1. 先发现 `modules/` 下所有模块
2. 先取所有 `enabledByDefault: true` 的模块
3. 再合并 `enabledModules`
4. 最后减去 `disabledModules`

### 5. 验证统一接入是否生效

```bash
type -a openclaw
```

如果接入成功，输出中通常会先看到：

```text
openclaw is a function
```

然后可继续检查运行日志：

```bash
tail -n 20 "$HOME/.openclaw/logs/local-overrides/runtime.log"
```

## 运行原理

1. `bootstrap/bash-init.bash`
   在 shell 中接管 `openclaw`
2. 每次执行 `openclaw ...` 时，
   统一注入 `bootstrap/node-preload-entry.mjs`
3. `node-preload-entry.mjs`
   读取 `config/enabled-modules.json`
4. 它根据当前 `process.argv`
   匹配各模块的 `module.json`
5. 命中的模块再加载自己的 `preload-hook.mjs`

因此后续新增模块时，只需要：

- 增加 `modules/<module-id>/module.json`
- 增加 `modules/<module-id>/preload-hook.mjs`
- 按需设置 `enabledByDefault`
- 如有需要，再在 `enabled-modules.json` 中显式启用或禁用

不需要再修改 `~/.bash_profile`

## 日志

统一运行日志：

```text
$HOME/.openclaw/logs/local-overrides/runtime.log
```

模块日志：

```text
$HOME/.openclaw/logs/local-overrides/<module-log-file>
```

例如当前模块会写入：

```text
$HOME/.openclaw/logs/local-overrides/openai-codex-auth-proxy.log
```

如果需要在测试或调试中隔离日志目录，可以临时覆盖：

```bash
export OPENCLAW_LOCAL_OVERRIDES_LOG_DIR=/tmp/openclaw-local-overrides-logs
```

## 测试

当前仓库已经包含：

- 公共运行时单测
- `openai-codex-auth-proxy` 的集成测试

运行方式：

```bash
cd "$HOME/.openclaw/local-overrides"
export HTTP_PROXY=http://<your-http-proxy-host>:<port>
export HTTPS_PROXY=http://<your-http-proxy-host>:<port>
unset ALL_PROXY
unset all_proxy
npm test
```

如果要显式指定集成测试使用的代理，可以设置：

```bash
export OPENCLAW_PROXY_TEST_PROXY_URL=http://<your-http-proxy-host>:<port>
```

测试当前覆盖：

- 模块 manifest 校验
- 模块发现与默认启用策略
- 统一 preload 路由
- 统一 bash 入口到 `openai-codex-auth-proxy` 的集成路径
