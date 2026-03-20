# `openclaw-local-overrides`

这个仓库用于存放不会直接修改上游安装包、但又需要长期保留的本地覆盖层。

当前包含：

- [openai-codex-auth-proxy](./openai-codex-auth-proxy/README.md)
  用于修正 `openclaw models auth login --provider openai-codex` 在某些代理环境下
  可能出现的 `oauth/token` 交换异常。
  当前实现采用“两层修复”：
  `EnvHttpProxyAgent` 负责接管全局代理感知，
  `curl fallback` 负责兜住 `https://auth.openai.com/oauth/token` 这一已知异常端点。

## 设计原则

- 不直接修改全局安装的 `openclaw`
- 尽量不依赖临时调试目录
- 尽量把作用范围收窄到具体入口
- 尽量让升级后的维护成本留在本仓库内部

## 安装步骤

以下步骤以 Bash 环境为例。

### 1. 克隆仓库

```bash
git clone git@github.com:irideas/openclaw-local-overrides.git "$HOME/.openclaw/local-overrides"
```

### 2. 选择需要启用的覆盖模块

当前仓库提供的模块有：

- `openai-codex-auth-proxy`

每个模块目录都自带单独的 `README.md`，说明其适用场景、接入方式和回滚方式。

### 3. 在 Shell 启动文件中接入模块

以 `openai-codex-auth-proxy` 为例，可在 `~/.bash_profile` 中增加：

```bash
[ -f "$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/openai-codex-auth-proxy/bash-init.bash"
```

### 4. 重新加载 Shell

```bash
source ~/.bash_profile
```

### 5. 验证接入是否生效

```bash
type -a openclaw
```

如果模块使用了同名 shell 包装，输出里通常会先看到：

```text
openclaw is a function
```

具体的验证命令和预期结果，请参考对应模块文档。
