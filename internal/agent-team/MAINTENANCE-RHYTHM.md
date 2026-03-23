# Maintenance Rhythm

本文档定义 `guardian-chief` 在不同阶段的工作节奏、例行检查项与后续演化方向。

## 1. Phase 1 — Summon-driven maintenance

当前阶段采用“召唤制”。

特点：

- 由 Owner 主动触发主要任务
- 以整理、分析、建议、草案与知识沉淀为主
- 暂不要求固定自动巡检
- 暂不要求独立 GitHub 机器人身份

### Typical tasks in this phase

- 基于新线索判断是否值得形成候选 issue
- 归并聊天、日志、社区案例与上游 issue 中的信息
- 更新项目治理文档与 issue 描述建议
- 识别执行层性能负担与可缓存判定点
- 起草周报、维护记录或决策建议

## 2. Phase 2 — Weekly review

当项目工作流稳定后，可进入每周巡检阶段。

建议节奏：

- 每周固定一次 review
- 汇总过去一周的：
  - 新问题线索
  - 上游变化
  - 社区案例
  - guardian 内部文档/测试/版本范围调整建议
- 输出一份结构化周报

### Weekly review output

建议优先落在 GitHub repo 内，例如：

- 一个 weekly review issue
- 或一个 `internal/` 下的报告条目
- 或后续 GitHub Discussions 帖子

## 3. Phase 3 — Cloud-hosted ongoing maintenance

成熟后可迁移到云端独立运行。

此阶段的目标：

- 将固定巡检变成常规工作安排
- 增强跨实例输入的统一分析能力
- 逐步引入更稳定的 GitHub 自动化身份
- 与 repo 内工作台形成更顺滑的闭环

## 4. Model use policy

前期主力模型：

- `kimi-coding/k2p5`
- `openai-codex/gpt-5.4`

建议分工：

### `kimi-coding/k2p5`

适合：

- 低复杂、大量扫描
- 粗筛与归并
- 候选列表整理
- 初步社区案例汇总

### `openai-codex/gpt-5.4`

适合：

- 关键问题的最终分析
- 多来源交叉验证后的收口
- 边界判断与治理建议确认
- 关键文档与策略的最终定稿

## 5. Candidate pipeline rhythm

一条线索进入后，建议按如下顺序推进：

1. 记录来源
2. 判断是否为稳定问题现象
3. 判断是否属于 guardian 边界
4. 判断更适合 issue / docs / 观察项 / 放弃
5. 若值得继续，形成候选对象与建议
6. 升级给 Owner 做关键决策

## 6. Future GitHub operations

前期：

- 以本地协助和草案输出为主
- 项目事实优先落在 GitHub repo

中期：

- 启用 GitHub Discussions
- 评估 weekly issue 模式
- 评估 GitHub App 身份

后期：

- 将固定节奏与自动化身份结合
- 让项目维护记录更稳定地区分“Owner 决策”与“Agent 执行”

## 7. Guardrails

不论处于哪个阶段，以下原则保持不变：

- 不为了自动化而牺牲边界清晰度
- 不为了速度而跳过治理判断
- 不为了“像团队”而制造过度流程
- 优先把事实沉淀到 repo，而不是散落在聊天记录里
- 高风险或高副作用决策始终升级给 Owner
