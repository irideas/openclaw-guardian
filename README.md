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

### 4. 配置启用模块

编辑：

```text
$HOME/.openclaw/local-overrides/config/enabled-modules.json
```

当前默认启用：

```json
{
  "enabledModules": ["openai-codex-auth-proxy"]
}
```

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
- 在 `enabled-modules.json` 中启用

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
