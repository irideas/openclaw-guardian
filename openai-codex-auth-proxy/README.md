# `openai-codex-auth-proxy` Compatibility Entry

这个目录现在只保留旧版兼容入口：

- [bash-init.bash](./bash-init.bash)
- [env-proxy-preload.mjs](./env-proxy-preload.mjs)

正式实现已经迁移到：

- [modules/openai-codex-auth-proxy/README.md](../modules/openai-codex-auth-proxy/README.md)
- [module.json](../modules/openai-codex-auth-proxy/module.json)
- [preload-hook.mjs](../modules/openai-codex-auth-proxy/preload-hook.mjs)

## 为什么保留这个目录

因为旧版本的接入方式可能已经写进了：

- `~/.bash_profile`
- `NODE_OPTIONS=--import=...`
- 其他个人脚本或文档

为了避免升级到模块化框架后立刻失效，
这里保留一层兼容壳，把旧入口自动转发到新的统一框架。

## 新的推荐接入方式

现在应当统一使用：

```bash
[ -f "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash" ] && \
  source "$HOME/.openclaw/local-overrides/bootstrap/bash-init.bash"
```

然后由统一框架读取：

- [enabled-modules.json](../config/enabled-modules.json)
- [module.json](../modules/openai-codex-auth-proxy/module.json)

来决定是否激活本模块。
