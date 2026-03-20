import { runPreflights } from "../../core/preflight-runner.mjs";
import { runRuntime } from "../../core/runtime-runner.mjs";

// `runtime/bootstrap` 这一层只负责把 `OpenClaw` 进程导向 guardian 的核心执行层。
// 当前执行顺序是：
// 1. 先跑 `preflight`
// 2. 再跑 `runtime`
//
// 这样可以在真正进入业务命令前，先给出高信号的问题提示。

await runPreflights();
await runRuntime();
