# Project Governance

本文档定义 `openclaw-guardian` 的项目治理原则、纳入边界、决策边界与协作落地方式。

## 1. Governance Goal

`openclaw-guardian` 的目标不是替代上游 `OpenClaw`，也不是成为一个广义“增强功能包”。

它的治理目标是：

- 识别真实环境中的稳定问题现象
- 判断哪些问题值得被本地治理
- 用可审计、可维护、可下线的方式沉淀经验
- 避免项目变成无边界的临时修补集合

## 2. What belongs in guardian

以下问题更适合纳入 guardian：

- 在真实本地环境中反复出现的问题
- 对用户可见、可描述的稳定故障现象
- 适合通过 `preflight`、`mitigation`、`repair` 或结构化文档来治理的问题
- 暂时未被上游妥善覆盖，但本地存在明确治理空间的问题
- 能够形成可持续维护价值的问题，而不是一次性临时排障记录

## 3. What does not belong in guardian

以下内容默认不应直接纳入 guardian：

- 单次偶发、证据不足的个案
- 本质属于上游正常功能演进而非本地治理的问题
- 需要大范围侵入式改写 `OpenClaw` 才能工作的方案
- 高风险、难审计、不可回退的自动修复逻辑
- 更适合只写排障笔记而非形成 issue 的内容

## 4. Decision levels

### Level A — Agent may analyze and draft

`guardian-chief` 可自行完成：

- 收集线索
- 提炼候选问题
- 起草 issue、文档、周报与建议
- 分析是否适合纳入 guardian
- 提出版本范围、缓存策略与执行层优化建议

### Level B — Owner decision required

以下事项必须由 Owner 决策：

- 是否正式纳入新 issue
- 是否采用重要 `mitigation` / `repair` 方案
- 是否发布版本
- 是否调整项目边界
- 是否建立新的对外身份、部署形态或公共自动化入口

## 5. Carriers

项目的主要工作载体优先落在 GitHub repo 内：

- `docs/`：对外公开文档、公开架构与公开维护说明
- `internal/`：项目组内部治理、Agent 角色、工作台规则与内部流程
- `issues`：候选问题、维护任务、上游跟踪与后续正式 issue 工作
- `CHANGELOG.md`：正式演进记录
- 后续可启用 `Discussions`：用于结构化讨论与长期协作话题

前期不强制建立 labels/project；待工作流稳定后再逐步引入。

## 6. Discussion and identity policy

前期不建立独立 GitHub 机器人账号。

原因：

- 先验证项目工作流是否稳定
- 避免过早增加身份与权限治理复杂度
- 先把岗位、流程与边界固化清楚

中期如果需要区分“谁执行了操作”，优先考虑 GitHub App，而不是专门 bot 用户账号。

## 7. Interaction model

- 人机主入口优先为 weixin
- GitHub repo 承担项目工作台与知识沉淀角色
- `guardian-chief` 负责将外部线索收束为仓库内可追踪对象
- subagents 与多模型分析服务于项目推进，而不是替代最终治理判断

## 8. Long-term principle

所有新能力都应优先回答这几个问题：

1. 它解决的是一个稳定问题现象吗？
2. 它真的属于 guardian 的治理边界吗？
3. 它是可审计、可回退、可维护的吗？
4. 它会不会把项目推向高侵入、难下线的方向？
5. 它是否能随着上游演进而收缩、降级或退场？
