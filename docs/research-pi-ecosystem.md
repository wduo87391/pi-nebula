# 研究笔记：pi 插件生态对 ADR-0006 相关功能的既有实现

> 调研日期：2026-10-01 ｜ 服务对象：ADR-0006 待实施功能（C 活动动画、D 更新自检）与缓做项（metrics bar TPS）
> 方法：npm registry + pi.dev 包目录（5639 包）检索 → clone 一手源码逐文件核验。clone 存于 `/tmp/{pm-pkg,zigai-tweaks,pi-spark,cc-ext}`。
> 结论先行：**C 在生态里是空白**（无人用 `setWorkingIndicator`），但存在更深一档的做法可借；**D 已有人做了 npm 包版本的自动更新**（不覆盖 nebula 的 git 钉 commit 场景，模式可吸收）；**缓做的 TPS 有一个现成的、比 ADR 草案更好的 MIT 实现**。

## TL;DR

- **功能 C（活动动画）**：整个 pi 生态没有任何包调过 `setWorkingIndicator`——正道无竞争。但 `@zigai/pi-status-bar` 的 `loader-patch.ts`（418 行）用**原型链补丁**在 loader 行右侧加运行时长/状态文本，比换帧数组深一档，两档可择。
- **功能 D（更新自检）**：`@aaronkyriesenbach/pi-package-manager` 已实现 npm 包的节流自动更新（`npm view` 查询 + `pi update --extensions` + `/reload` 热应用 + 崩溃恢复），但**只认 `npm:` 源**，覆盖不了 nebula 的 `git:…@<commit>` 钉版；其 nextCheck 节流与 notify→reload 模式值得照抄。
- **缓做的 TPS**：`@zigai/pi-status-bar` 的 `token-throughput.ts` 是完整、防御性极强的吞吐跟踪器（分步采样、剔除 reasoning tokens、处理 error/abort/incomplete、聚合多步）——比 ADR-0006 草案的「output÷耗时」好得多，MIT 可整段移植。
- **架构模式**：`@zigai/pi-extension-internals` 的 `linked-method-patch.ts` 是 ADR-0005 defineProperty 手法的**通用强化版**（多扩展链式补丁、predecessor、dispose、Symbol.for 全局版本协议）——升级 0.99.2 重测工厂补丁时可考虑迁移到这个模式。
- **意外收获**：`pi-cc-extensions`（63K/mo，中文作者）是 nebula 的最大同类 chrome 包——工具行 Claude Code 风格、markdown 增强、状态栏、/context 查看器全有积累，**footer/editor 重设计前值得专门拆解一次**。

---

## 1. 功能 C：活动动画 / working indicator

**生态现状**：npm（pi-package keyword）与 pi.dev 目录均无任何包调用 `ctx.ui.setWorkingIndicator`；官方只给了示例 `examples/extensions/working-indicator.ts`。**正道无人使用 → nebula 做了即独有。**

**更深一档的做法**：`@zigai/pi-status-bar`（MIT）的 `src/loader-patch.ts`：

- 不满足于换帧，直接补丁 **pi-tui `Loader` 原型**（`start/stop/updateDisplay/render` 四个方法），在 loader 行右侧渲染 elapsed time 与状态文本（配合它的 `worked-for-widget.ts`「本次会话工作时长」）。
- 补丁经 `installLinkedMethodPatch`（见 §4）安装，带 `Symbol.for` 全局版本化 controller（`LOADER_TIME_PATCH_VERSION = 5`），静态 loader 1s 间隔刷新。
- 位置：`/tmp/zigai-tweaks/packages/pi-status-bar/src/loader-patch.ts:1-55`（已核验）。

**nebula 的两档选择**：
1. 卫生档：`setWorkingIndicator({frames, intervalMs})` 官方通道——ADR-0006 现方案，无重绘风险、升级零成本。
2. 深度档：借 zigai 的 Loader 原型补丁加「右侧 elapsed time」——观感更接近 dsh-TUI ActivityLine，但补丁侵入 pi-tui 内部类，**pi 升级必重测**（0.99.2 已换构建链）。

## 2. 功能 D：更新自检

**生态现状**：`@aaronkyriesenbach/pi-package-manager` v0.5.0（38KB，npm）——「list, enable/disable, and **auto-update** installed Pi packages from within a session」：

- `lib/updates.ts`：手写 semver 比较（含 pre-release 语义：`1.0.0-rc < 1.0.0`）+ `shouldCheckForUpdates(config)` 按 `nextCheck` 时间戳节流。
- `lib/fs-helpers.ts:84`：`npm view <pkg> version`（execFile，15s 超时，失败静默 null）。
- `lib/session.ts:67`：`checkAndRunAutoUpdate` —— 先写回 nextCheck（无论结果如何都推进节流），比对后若有更新：`ctx.ui.notify` → `pi update --extensions`（120s 超时）→ `sendUserMessage("/reload")` 热应用。
- 还有完整的 enable/disable 会话覆写（settings 备份/恢复 + `session_shutdown` 时还原 + 启动时崩溃恢复）。
- **关键限制**：`getPackagesFromSettings` 显式 filter `source.startsWith('npm:')`——**git 源不覆盖**，nebula（`git:…@<commit>`）不在其射程内。

**对 nebula 的启示**（ADR-0006 §D 可直接吸收）：
- nextCheck 持久化节流（写状态文件，比 ADR「每会话至多一次」更准——跨会话不重复查）；
- 「无论成败先推进 nextCheck」防失败风暴；
- 若将来 nebula 发 npm：notify→`pi update --extensions`→`/reload` 三连是社区已验证的热更新路径。

## 3. 缓做项：TPS / metrics bar

`@zigai/pi-status-bar/src/token-throughput.ts`（174 行，MIT）——**比 ADR-0006 缓做项草案好得多的现成实现**：

- **分步采样**（`startStep/markOutput/finishStep`），跨步骤聚合成整 turn 的 `tokensPerSecond`，而非单条消息的粗除法；
- **剔除 reasoning**：pi 的 `usage.output` 含 reasoning，它换算「可见输出」= `output - reasoning`（对齐 OpenCode 语义）；
- **防御性极强**：error/abort 的步骤、无可见输出、零时长、不完整步骤都有明确的 `unavailable` 状态机（`no-steps | incomplete-step | no-visible-output | zero-duration`）；
- 首输出锚定（`firstOutputAtMs`）避免把首 token 前的等待计入流速。

结论：将来做功能 3 时**移植此实现**（MIT，注出处），不要自己重推公式。

## 4. 架构模式：linked-method-patch（与 ADR-0005 同族但更稳）

`@zigai/pi-extension-internals/src/linked-method-patch.ts`（MIT）——多扩展**协作式原型方法补丁协议**：

- 每个补丁拿到自己安装时刻的 `predecessor`（被补丁方法的直接下家），`dispose()` 干净摘除；
- `Symbol.for("…render-patch-predecessor")` + `PATCH_PROTOCOL_VERSION` 全局协议键：多个包补丁同一方法（如 `Loader.render`）时链式叠加而非互相覆盖——正是 ADR-0005 用 `Object.defineProperty` 硬抢导出命名空间时担忧的冲突问题，它给出了通用解。
- pi-status-bar 的 loader 补丁、pi-footer 的 slot 接线都在用这套。

对 ADR-0005 的意义：升级 0.99.2 后重测工厂补丁时，若 jiti live binding 机制失效或想降冲突风险，可评估把「defineProperty 抢命名空间」迁移为「linked-method-patch 式链式协议」。

## 5. 意外收获：同类 chrome 包扫描

| 包 | 规模 | 与 nebula 的关系 |
|---|---|---|
| `pi-cc-extensions`（minuque，63K/mo，MIT） | `renderer/`（default-mode 26K + compact-mode 78K 行级工具渲染）、`feature/`（context 查看器 25.8K、agent-summary、mouse、shell）、`markdown-enhance.ts` | **最大同类包**：Claude Code 风工具行/折叠、markdown 增强、状态栏（模型/上下文/缓存/费用/git，适配 pi-usage 额度）、CC Dark/Light 主题、/ccstyle 配置面板。nebula 做工具行精修与 footer/editor 重设计前应专门拆解（它是中文 README，交流无碍） |
| `@zigai/pi-footer`、`pi-ui-tweaks`（12 个可配小补丁：border 色、paste-collapse、compaction 历史保留…） | 见 `/tmp/zigai-tweaks` | chrome 细节的补丁集散地，各补丁均带配置开关与 lifecycle，工程范式可参考 |
| `@quandev104/pi-style`（0.3.2，pi.dev 目录 5m 前刚发） | 未 clone（npm 无 repo） | 「native-layout cohesive visual style」——刚出生的直接竞品，留意即可 |
| `pi-spark`（0.28.0） | `src/features/`（credits/editor/footer/presets/recap/title/write） | 特性注册器 + `autoCollectEvents`（事件订阅统一收集、session_shutdown 自动销毁）——订阅生命周期管理模式可借鉴 |

## 6. 存放位置说明

延续 `docs/research-dsh-tui.md` 的先例：与 adr 平级的第二份研究笔记。两份调研（dsh-TUI、pi 生态）互补，若再添一份则按 §8 的约定收进 `docs/research/` 目录。
