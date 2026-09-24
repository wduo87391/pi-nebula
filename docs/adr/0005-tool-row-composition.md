# 工具行用「工厂包装」与其他扩展组合

pi 解析工具渲染的规则是**按槽位合并、最后注册者胜出**（`withBuiltInRenderers`：`renderCall: definition.renderCall ?? builtIn.renderCall`），**扩展之间没有任何渲染器组合机制**。于是任何在 pi-nebula 之后重新注册内置工具的扩展都会**静默抢走槽位**。

具体冲突：SoL-Pi 的 Action Fusion（`~/.pi/agent/sol-pi.json` 里 `actionFusion: true`）给 `edit`/`write` 加 `then_run` 字段并重新注册，且把 `renderCall/renderResult` **硬编码委托回内置工厂**（`baseEdit(cwd).renderCall`）。结果 edit/write 退回 pi 内置渲染器（`edit <路径>` + 高亮 diff、`write <路径>` + 高亮全文），而其余 5 个工具仍是 pi-nebula 的行。

## 决定

在 nebula 加载时用 `Object.defineProperty` 重定义 `@earendil-works/pi-coding-agent` **导出命名空间**上的 7 个 `createXToolDefinition` 工厂，使其返回的定义自带 nebula 的 `renderCall/renderResult`（并设 `renderShell: "self"`）。任何基于这些工厂构建的扩展（SoL-Pi、pi-toolbox…）于是自动继承 nebula 的渲染，且保留各自的 `execute`/schema（`then_run` 不丢）。

pi 自己的内置工具由 bundle 内部引用构建，**不经过导出对象**，所以不受补丁影响；`registerToolRows()` 仍必须保留（用来替换内置渲染）。

## 为什么可行

- 该命名空间对象 `Object.isFrozen() === false`，属性描述符 `configurable: true`（jiti 用 getter 实现 live binding）；普通赋值会被 getter 吞掉，`defineProperty` 才能替换。已实测。
- 加载器把扩展里的 `import { createEditToolDefinition }` 编译为运行时对该共享对象的属性读取，所以补丁对 SoL-Pi 立即生效。已实测（假 session + tmux 抓屏）。

## 边界与兜底

- 整段包在 `try/catch`：若未来 pi 冻结/密封命名空间，只记 debug 日志并退回纯 `registerToolRows()` 行为（冲突重现，但不崩）。
- 用 `__nebulaWrapped` 标记防重入（reload 时不再二次包装）。
- 代价：全局改共享模块，可能影响别的依赖内置渲染器的扩展。当前 7 个工具全包，与 nebula「7 个内置工具都由自己画」的本意一致。

**Considered Options**：
- 只改配置 `actionFusion: false`——被否决，会丢掉 `then_run`（编辑/写入后自动跟命令、省一个模型往返）。
- 在 `resources_discover`（晚于 `session_start`）注册以抢在 SoL-Pi 之后——被否决，会连 `execute` 一起覆盖，`then_run` 失效。
- 与 SoL-Pi 约定共享 registry 并 patch 它——被否决，耦合第三方包且它可能被 pi 更新覆盖。