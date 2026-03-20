# `plugins-feishu-duplicate-id`

## 一句话说明

这个 issue 处理的是：

- 内置 `feishu` 插件已经存在
- 本地又额外存在一个 `feishu` 扩展或显式安装引用
- 两者使用了相同的 plugin id

当前 alias：

- `feishu-dup`

## 现象

当你执行下面这些命令时：

- `openclaw gateway restart`
- `openclaw gateway start`
- `openclaw plugins list`
- `openclaw plugins doctor`

可能看到类似告警：

- `plugin feishu: duplicate plugin id detected`
- `plugins.allow is empty; discovered non-bundled plugins may auto-load`

从用户视角看，这个问题的核心不是“feishu 不能用”，而是：

- 同一个 plugin id 被加载了两次
- 插件加载顺序可能互相覆盖
- 非内置插件还可能被自动发现

## 归因分析

这个 issue 关注的是一类很典型的本地状态冲突：

1. `OpenClaw` 已内置 `feishu`
2. 本地目录下又存在 `~/.openclaw/extensions/feishu`
   或者 `openclaw.json` 里还有 `plugins.installs.feishu`
3. 两者都叫 `feishu`
4. 最终触发 duplicate plugin id 告警

也就是说，这不是纯运行时网络问题，而是：

- 本地目录状态
- 本地配置状态
- 插件发现机制

共同叠加后的结果。

## guardian 的解决方案

这个 issue 当前启用了两种能力面：

- `preflight`
- `repair`

其中：

- `preflight`
  在命令真正执行前先检查本地是否已经存在冲突状态
- `repair`
  提供显式、可审计的修复动作

当前修复动作非常克制，只做两类明确操作：

1. 如果 `~/.openclaw/extensions/feishu` 存在，则把它移动到 `.extensions-backup/`
2. 如果 `openclaw.json` 中存在 `plugins.installs.feishu`，则删除这条显式安装引用

当前不会自动改写 `plugins.allow`。  
因为 allowlist 往往带有明显的本地策略含义，自动改写风险较高。

## 触发条件

当前会在这些命令前触发：

- `openclaw gateway restart`
- `openclaw gateway start`
- `openclaw plugins list`
- `openclaw plugins doctor`

## 适用版本

当前 `issue.json` 约定的 `OpenClaw` 版本范围是：

- `>=2026.3.13 <2026.4.0`

如果当前 `OpenClaw` 版本不在这个范围内，guardian 不会激活本 issue 的 `preflight` 或 `repair`。

## 使用方式

如果只是让 guardian 在命令前自动提示，正常执行相关 `openclaw` 命令即可。  
如果你想主动查看或执行修复，可以直接用 alias：

查看修复计划：

```bash
guardian repair feishu-dup --dry-run
```

执行修复：

```bash
guardian repair feishu-dup --apply
```

## 日志与验证

默认日志文件：

```text
$HOME/.openclaw/logs/guardian/plugins-feishu-duplicate-id.log
```

常见事件包括：

- `preflight_state`
- `preflight_start`
- `preflight_done`
- `repair_plan`
- `repair_apply_done`

修复后建议立刻执行一次：

```bash
openclaw plugins doctor
openclaw gateway restart
```

确认是否还会继续出现 duplicate plugin id 相关告警。

## 相关建议

如果 preflight 命中，建议按这个顺序处理：

1. 先运行 `openclaw plugins doctor`
2. 再运行 `guardian repair feishu-dup --dry-run`
3. 确认计划后，再执行 `--apply`

## 相关文档

- [README.md](/Users/irideas/.openclaw/openclaw-guardian/README.md)
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
