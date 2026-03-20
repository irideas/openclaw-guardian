# Testing Strategy

本文档描述 `openclaw-local-overrides` 的测试分层策略。

目标不是追求“所有东西都自动化”，而是把不同性质的验证拆开：

- 纯逻辑问题，用稳定可重复的自动化测试覆盖
- 真实网络链路问题，用明确标注的集成测试覆盖
- 依赖浏览器、账户状态和外部风控的流程，用手工验证覆盖

这样做的原因是：

- 本仓库的部分模块本质上是在修复真实环境中的网络行为
- 这类行为很难用纯单测充分证明
- 如果强行把外部依赖塞进 `unit test`，会让测试不稳定、不可重复，也会让 CI 失真

## 总体原则

测试按 4 层划分：

1. `unit`
2. `integration-local`
3. `integration-remote`
4. `manual-e2e`

这 4 层不是互相替代，而是职责不同。

## 1. Unit

### 定义

`unit` 只验证纯逻辑，不依赖：

- 真实网络
- 真实代理
- 浏览器
- 本地 `openclaw` 登录状态
- OpenAI 账号状态

### 适合覆盖的内容

- manifest schema 校验
- 模块发现
- 默认启用 / 显式启用 / 显式禁用规则
- CLI 参数匹配规则
- provider 提取逻辑
- 日志路径推导
- 运行时路径推导
- `curl` 响应头解析
- 环境变量解析与优先级

### 要求

- 必须可离线运行
- 必须在 CI 中自动执行
- 必须不要求任何 secret 或代理地址

### 当前对应

- [module-runtime.test.mjs](../test/module-runtime.test.mjs)

## 2. Integration-Local

### 定义

`integration-local` 验证：

- 真实代码路径
- 真实运行时装配
- 真实代理链路
- 但仍使用“假业务输入”或“可控输入”

它的目标不是证明整个 OAuth 流程完成，而是证明：

> 模块的接管机制、代理注入和回退逻辑，确实在真实环境里被执行了

### 适合覆盖的内容

- 统一 preload 路由是否能命中模块
- Bash 入口是否能正确注入统一 preload
- `curl fallback` 是否真的生效
- 对假 `oauth/token` 请求是否返回预期的 `401 token_expired`
- 日志中是否出现关键事件

### 特点

- 依赖真实代理
- 依赖真实外部网络
- 不依赖真实浏览器授权成功
- 不依赖真实 token 落盘

### 当前对应

- [openai-codex-auth-proxy.integration.test.mjs](../test/openai-codex-auth-proxy.integration.test.mjs)

### 结论

这类测试不应归类为 `unit`。

## 3. Integration-Remote

### 定义

`integration-remote` 指在远端 CI 环境中运行的真实网络集成测试。

它与 `integration-local` 的差异不在测试目标，而在运行位置：

- `integration-local` 通常在开发者本机执行
- `integration-remote` 在 GitHub Actions 或其他 CI 中执行

### 使用前提

必须具备可用的远端代理配置，例如：

- GitHub repository secret：
  `OPENCLAW_PROXY_TEST_PROXY_URL`

### 适合覆盖的内容

- 假 `oauth/token` 请求的真实远端代理行为
- 统一 preload 路由在 CI 环境里的行为是否与本地一致

### 不适合覆盖的内容

- 真实浏览器授权
- 真实 `localhost` 回调
- 真实账户 OAuth 完整闭环

### CI 建议

- 不应在每次 `push` 都自动执行
- 更适合：
  - `workflow_dispatch`
  - 或专门的手动 job

## 4. Manual-E2E

### 定义

`manual-e2e` 用于验证完整真实业务链路，例如：

```bash
openclaw models auth login --provider openai-codex
```

然后由人工完成：

- 浏览器登录
- 授权确认
- 回调接收
- 最终 token 落盘验证

### 这层为什么必须保留

因为 `openai-codex-auth-proxy` 的根本目标不是“假 token 返回 401”，
而是：

> 真实 OAuth 在真实环境中最终成功

这个目标天然受以下因素影响：

- 浏览器行为
- 本地回调端口
- OpenAI 风控
- 账户状态
- 代理出口状态
- 地区识别

这些都不适合硬塞进自动化 CI。

### 结论

对这类模块来说，`manual-e2e` 不是失败，而是必要层。

## 为什么 `openai-codex-auth-proxy` 不能只靠 Unit Test 证明

因为这个模块的真正价值不是一个纯函数结果，而是一个真实网络行为：

- `openclaw` CLI 的真实执行路径
- `EnvHttpProxyAgent` 的真实代理接管
- `curl fallback` 的真实外部请求行为
- OpenAI `oauth/token` 的真实响应

单测最多只能证明：

- 逻辑没写错
- 条件判断没写错
- 数据解析没写错

但它无法证明：

- 当前代理真的可用
- `undici` 与 `curl` 在当前网络下真的表现不同
- 真实 OAuth 最终真的能成功

因此，对这个模块的正确策略不是：

> 把所有验证都做成 unit test

而是：

> 把能稳定自动化的部分做成 unit，
> 把真实网络行为放进 integration，
> 把完整授权闭环留给 manual-e2e

## 对当前仓库的建议

当前推荐的测试划分如下：

### 自动执行

- `npm test`

用途：

- CI 默认门禁
- PR 基本回归保护

说明：

- `npm test` 当前等价于 `npm run test:unit`

### 本地或手动执行

- `npm run test:integration`

用途：

- 验证真实代理链路
- 验证模块接管机制

### 手工验证

- 真实执行：
  `openclaw models auth login --provider openai-codex`

用途：

- 验证完整 OAuth 成功
- 验证真实 token 落盘

具体检查清单见：

- [MANUAL-E2E.md](./MANUAL-E2E.md)

## 后续建议的工程动作

在你确认这份策略后，下一步建议做这些调整：

1. 把 README / CI / package scripts 中的测试术语统一
   不再把需要代理的测试混称为 `unit`

2. 保持 `unit` 默认自动执行

3. 把 `integration` 明确标成：
   - 需要代理
   - 可选执行
   - 不作为每次 push 的硬门禁

4. 为 `manual-e2e` 补一份明确的人工验证清单

这样仓库的测试模型会更诚实，也更稳定。
