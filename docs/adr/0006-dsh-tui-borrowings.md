# 从 dsh-TUI 借鉴四个功能，其余记档缓做或拒绝

> **2026-10-01 修订**：升级调查发现 pi **0.84.0 已内置 Mermaid/LaTeX 的 Unicode 渲染**（引擎 `grok-mermaid`；`markdown.mermaid` 设置，默认 `"streaming"`；LaTeX 内置无开关），即原采纳项 A、B 已被宿主取代——不做。四项全部落定：A/B 宿主取代，C（活动动画）与 D（更新自检）已实施，均待目视验收（见下「实施记录 C/D」）。

调研记录在 `docs/research-dsh-tui.md`（对照 pi-nebula 的完整 20 条清单）。本 ADR 记取舍结论、待实施功能的要点、以及 pi 升级的必回归项。

## 决定

**采纳两项待实施**（均不越 pi 边界、不违 chrome 包职责）：

1. **活动动画** —— `setWorkingIndicator`，pi 自己驱动动画
2. **非阻塞更新自检** —— `session_start` 后台 `git ls-remote` → `ctx.ui.setStatus()`

**已被宿主取代**：Mermaid → Unicode（内置，`markdown.mermaid`）、LaTeX → Unicode（内置）——见实施清单 A/B 的说明。

**缓做**：metrics bar 的 TPS + `▰▱` 进度条——与 footer/editor 重新设计耦合（用户明确「重新设计 footer 和 editor 的时候再说」），单独做会返工。

**拒绝**：`#L12-14` 行号补全——属输入辅助功能，不是 chrome 包职责（`CONTEXT.md` 对 chrome 包的定义：只负责界面外观、不提供功能）。

**未来可选**：`?` 键位速查浮层（现有启动面板 Tips 尚可，等面板减负时一并考虑）。

**弃**：zh/en 双语文案表——自用无英文需求，纯债。

## 实施清单

### A. Mermaid → Unicode —— 已被 pi 内置取代（取消）

pi 0.84.0（2026-08-06）官方 New Feature：「Mermaid and LaTeX rendering — Render Mermaid diagrams and terminal-friendly Unicode math in interactive transcripts」。引擎 `grok-mermaid`（pi-coding-agent 依赖，主线 0.2.3），主题化 Unicode 渲染、支持流式；`markdown.mermaid` 设置三档 `off`/`final`/`streaming`（默认 `streaming`）。残留工作仅为升级后目视验收（含与 nebula 主题的观感），不写任何转换器。

### B. LaTeX → Unicode —— 同上，已被 pi 内置取代（取消）

LaTeX 的 Unicode 渲染自 0.84.0 内置、无设置开关（0.85.1→0.86.0 还在持续修排版细节）。不写转换器。

### C. 活动动画（S）

- `ctx.ui.setWorkingIndicator({ frames, intervalMs })`（`docs/extensions.md:2600`）——**动画由 pi 自己驱动帧循环，无重绘风险**。frames 用 `ctx.ui.theme.fg()` 取 nebula 冷调（base0C/0D/0E）造 4-8 帧，例如 `·`→`•`→`●`→`•` 呼吸（intervalMs 120）或 `⎯▁▂▃` 扫掠，具体形态目视验收定。
- **官方同构示例**：`examples/extensions/working-indicator.ts` —— raw ANSI（`\x1b[38;2;r;g;bm`）造彩色帧、session_start 里 apply、`registerCommand` 切换 dot/pulse/none/spinner/reset，可整段取意。
- **生态调研**（`docs/research-pi-ecosystem.md` §1）：全生态无人用过 `setWorkingIndicator`，正道无竞争；若想要 loader 行右侧 elapsed time（dsh-TUI ActivityLine 观感），可借 `@zigai/pi-status-bar` 的 `loader-patch.ts` 原型补丁（MIT）——但侵入 pi-tui 内部类，每次 pi 升级必重测，首版不做。
- 挂在 `install()` 里；`/nebula-off` 与 `session_shutdown` 恢复 `setWorkingIndicator()`（无参 = 内置 spinner）。
- 可选顺带：`setWorkingMessage()` 配 nebula 文案。

### D. 非阻塞更新自检（S）

- `session_start` 的 `install()` 里 fire-and-forget：`git ls-remote --tags https://github.com/wduo87391/pi-nebula.git`，3s 超时，失败完全静默（无网/无 git 不留痕）。
- 比较：运行时读自身 `package.json` 的 `version` vs 远端最高 semver tag → 有新版则 `ctx.ui.setStatus("nebula", "⬆ v0.1.0 → v0.2.0")`。
- **展示零成本**：状态条已读 `footerData.getExtensionStatuses()`（ADR-0002 的对接机制），setStatus 的字样自动出现在 nebula 状态条，不用加任何渲染代码。**官方同构示例**：`examples/extensions/model-status.ts`（事件 → `ctx.ui.setStatus()` 的最小完整版）。
- **生态调研**（`docs/research-pi-ecosystem.md` §2）：`@aaronkyriesenbach/pi-package-manager` 已做 npm 包的自动更新但**只认 `npm:` 源**，不覆盖 nebula 的 git 钉版；吸收其两点：nextCheck 持久化节流（跨会话不重查，无论成败先推进 nextCheck），以及将来若发 npm 可用 notify→`pi update --extensions`→`/reload` 热更新三连。
- **纪律**：只提示、绝不自动升级（`git:…@<commit>` 钉住安装的方式不变）；节流至多每日一查；dim 色。

### 升级 pi 至 0.99.2 的必回归项（0.85.1 → 0.99.2，经 pi.nix）

- **ADR-0005 工厂补丁重测**：0.86.0 起 extension compiler 延迟加载、0.99.0 构建切 TypeScript 7 + Node type stripping——`Object.defineProperty` 替换导出命名空间工厂依赖 jiti getter live binding，加载器变了必须实测。若失效，备选方案是 `@zigai/pi-extension-internals` 的 `linked-method-patch`（多扩展链式补丁协议，MIT，见 `docs/research-pi-ecosystem.md` §4）。
- **工具行 summaries/guidelines**：0.99.2 修复官方 `built-in-tool-renderer.ts` 示例重注册内建工具时弄丢 summary/guideline 的问题（#10072/#10193）——nebula 的 `registerToolRows` 同模式，升级后核对内建工具描述是否完好。
- **编辑器 spinner 形态**：0.86.0 起压缩/分支摘要/重试 spinner 移入编辑器边框，CustomEditor 第 4 参 `{ embedWorkingStatus: true }` opt-in；nebula 目前只传 3 参，升级后目测决定是否 opt-in。
- **`pi.on()` 返回 unsubscribe**（0.86.0）——可简化 session_shutdown 的手动清理。
- **主题**：0.99.0 新增 `system` 主题为默认、内置 dark/light 重写为 OKHSL、主题文件支持 `#rgb`/`oklch()`/`appearance`；nebula 是显式 `"theme": "nebula"`，静态 hex 不受影响；#9973 修复自定义主题忽略 `terminal.trueColor`——nebula 真彩输出受益。
- **分支遍历安全**：0.87.0 新增 `ContextEditEntry`；nebula 的 metrics/sessionLabel 遍历是 `type === "message"` 过滤式而非穷举 switch，未知类型自然跳过，无破坏。
- `--no-extensions` 现在连内置扩展也关（`-e builtin:<name>` 显式加载）——原型/smoke 验证命令照旧可用。

## 实施顺序

**升级 pi（0.85.1 → 0.99.2，经 pi.nix）并过「升级回归项」→ C → D。**（原 B→A 已取消：宿主已内置。）

## 实施记录 C（2026-10-01，已实施待目视验收）

- **动画形态**：8 帧呼吸 `·•●●●●•·`，intervalMs 120；色相沿冷调扫掠 base04（muted）→ base0B（ok）→ base0D（info）→ base0C（cyan）→ base0E（key）→ 回落。帧由 nebula 自带 `fg()` 真彩 ANSI 生成，与扩展其余部分同源；pi 自己驱动帧循环。
- **接入点**：`install()` 里 `ctx.ui.setWorkingIndicator?.({ frames, intervalMs })` + `setWorkingMessage?.(fg(C.muted, "Working…"))`，均带防御，不存在的宿主版本静默跳过。
- **还原点**：`/nebula-off` 与 `session_shutdown` 均调 `setWorkingIndicator(undefined)` / `setWorkingMessage(undefined)`（官方示例的 reset 形式；session_shutdown 供下次会话不装 nebula 时回到内置 spinner）。
- **未决项「embedWorkingStatus」已落地**：实测 pi 0.99.2 自带默认编辑器即传 `{ embedWorkingStatus: true }`（spinner 流入编辑器顶边框，0.86.0+）。nebula 跟随宿主默认，同时新增设置键 `nebula.embedWorkingStatus`（默认 true，false 回退老观感），目视验收后可一键切换。
- **未决项「pi.on() unsubscribe」结论：无需改**。现存两个 `pi.on` 均为加载期注册、跨会话复用（注释明确设计如此）；每会话态资源只有 fs watcher，本就在 session_shutdown 手动销毁，无可简化处。
- **离线 smoke**：`/tmp/nebula-verify` harness 已扩展覆盖：帧数/间隔/真彩 ANSI、message、embedWorkingStatus 默认 true → 设置 false → 移除恢复、`/nebula-off` 还原、session_shutdown 还原；全部通过，既有检查（三宽度、welcome 三模式、thinking 联动、工具行）无回归。stub `@earendil-works/*` 包重建入库 harness 目录。
- **部署提醒**：`npm:pi-nebula@0.1.0`（`~/.pi/agent/npm/…`）与 git 钉版副本均落后于仓库（连 ADR-0005 的工厂补丁都未含）。目视验收前需先同步安装副本或发新版，否则改的都是仓库里的代码、跑的是旧包。
- 遗留给目视验收：动画具体形态（呼吸 vs 扫掠）、`Working…` 文案取舍、embedWorkingStatus 开/关观感对比。
- **Review 补验（同日）**：`emit(event)` 统一传 `(event, ctx)`（0.99.2 宿主反汇编确认），session_shutdown 里的 `ctx.ui` 还原可用；NebulaEditor 无自有构造器，`{ embedWorkingStatus }` 经默认继承直通 CustomEditor 第 4 参；完整扩展已在生产 jiti 下加载冒烟通过（exit 0、无报错）。

## 实施记录 D（2026-10-01，已实施待目视验收）

- **接入点**：`install()` 尾部 `maybeCheckForUpdate(ctx)`，fire-and-forget，外层 try/catch 全包，任何异常不打断 session start。
- **节流**：状态文件 `getAgentDir()/nebula-update.json`（`{ nextCheck }`）；**先推进后查询**——无论成败下次检查都在 24h 后，无网/无 git 的失败零成本；文件缺失/不可读 = 视为 due。
- **查询**：`execFile("git", ["ls-remote", "--tags", REPO], { timeout: 3000 })`。任何错误（无 git、无网、超时、输出不可解析）完全静默，不留任何 UI 痕迹。
- **版本来源**：`__filename` → `../package.json`。**Review 探针实测**（pi 0.99.2 jiti，真机 `--extension` 加载）推翻了初版的 `import.meta.url` 方案：jiti 把扩展模块包在 CJS 里并注入正确的 `__filename`，而 `import.meta.url` 是一坨 base64 data-URL 垃圾（`file:///data:text/…`），用它拼路径会静默读不到 manifest，更新自检永不触发——离线 harness 在纯 node 下跑，`import.meta.url` 恰好是对的，环境差异掩盖了 bug。现改为 `__filename` 优先、`import.meta.url` 仅作非 jiti 环境（node ESM / harness）回退，修复后已在生产同款 jiti 环境下验证返回真实版本号。npm 布局 / git 钉版 / 本地 dev checkout 都如实报告自身版本。
- **提示**：`ctx.ui.setStatus("nebula", "⬆ v0.1.0 → v0.2.0")`，纯文本不携 ANSI——宿主 `setExtensionStatus` 后会 `requestRender()`（实测确认），dim 由状态条着色。纪律不变：只提示，绝不自动升级。
- **附带修复**：statusBar 现在渲染 `footerData.getExtensionStatuses()`（右侧、dim；自带 ANSI 的透传）。此前 nebula 换掉内置 footer 后，其他扩展的 `setStatus` 会石沉大海，这把 ADR-0002 的对接缝真正接通了。
- **`/nebula-off`**：顺带 `setStatus("nebula", undefined)` 清掉自己的提示，恢复 vanilla。
- **可测性**：纯函数 `highestSemverTag` / `updateHint` 以命名导出供 harness 单测（annotated tag 的 `^{}` 行忽略）。
- **离线 smoke**：stub `git`（记录调用次数 + 罐头 tags）→ 8+ 次 session_start 只查 1 次；future nextCheck 完全抑制查询；提示出现在状态条各 think 档位行；`/nebula-off` 清除；全部通过，既有检查无回归。harness 副本改为 `extensions/` 子目录以镜像真实布局（`ownVersion()` 读 `../package.json`）。
- **发版纪律**：打 `vX.Y.Z` 格式的 tag 即可被检测（当前仓库版本 0.1.0）。目视验收项：真实网络下首查 3s 内完成、无网环境完全静默。

## 升级验收记录（2026-10-01，0.85.1 → 0.99.2 实测）

升级经 `~/.dotfiles` flake input `llm-agents`（commit `202b98c`）。

- **工厂补丁（ADR-0005）：存活**。四探针实测：命名空间未冻结、descriptor 仍 `configurable:true` + getter、`defineProperty` 成功；跨扩展具名导入读到补丁后的工厂（含 `promptSnippet`/`promptGuidelines`/`renderCall` 全字段）；**从 SoL-Pi 自己的树**（其 node_modules 有 pi 包本地副本）编译的导入仍解析到宿主命名空间。无需 `linked-method-patch` 备选。已知怪癖：补丁文件自身的 namespace 读回返回原函数（同文件编译的快照效应），`registerToolRows` 与防重入检查对此不敏感，无碍。探针留在 `.scratch/regression/`（gitignore）。
- **工具行：过**。真机会话 `read` 调用渲染为 nebula 行（`● Read [README.md • lines 1–5] 6ms` + `└ Read 5 lines`），❯ 用户标记在位。
- **UI 槽位：过**。欢迎面板（Ciallo/banner/Tips/Loaded/Recent）、状态条、metrics 条全部渲染。注意：`ctx.ui.setHeader()` 语义未变（探针 H 验证）。
- **主题：过**。静态 hex 不受 OKHSL 重写影响；#9973 真彩修复生效。
- **`--no-extensions`/`-e` 新语义：兼容**（探针运行方式本身即验证）。
- **ContextEditEntry（0.87）：安全**（过滤式遍历，维持 ADR 判断）。
- **未决项**：`embedWorkingStatus` opt-in 与 `pi.on()` unsubscribe 简化——并入功能 C/D 实施时处理。
- **第三方新警告（非 nebula）**：0.99.2 加载器要求宿主包声明为 peerDependencies——`@juicesharp/rpiv-*` 两个包违规告警；`pi-mcp-adapter` 的 `/mcp` 命令与 `builtin:mcp` 冲突提示（既有）。
- **验收现场备注**：小屏（50 行）下面板顶部会被截断（面板 19 行 + [Skills]/[Extensions] 列表很长），非缺陷。

## Considered Options

- ~~自写 mermaid/latex 转换器~~ ——已被更强理由取代：pi 自 0.84.0 内置主题化渲染，重复造轮子毫无必要，nebula 只需验证观感。
- TPS/进度条单独先做——否决：与 footer/editor 重设计耦合，用户明确缓做。
- `#L12-14` 补全——否决：输入辅助不是 chrome 包职责。
- 鼠标交互 / thinking 流式渲染 / 进程内后台会话——否决：pi 无对应 API（`docs/research-dsh-tui.md` §7.3，dsh-TUI 那些是自写整套渲染引擎换来的）。
