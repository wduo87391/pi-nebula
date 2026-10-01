# 研究笔记：dsh-TUI（github.com/ccch1mneyyy/dsh-TUI）

> 调研日期：2026-10-01 ｜ 服务对象：pi-nebula 功能增强
> 方法：`git clone https://github.com/ccch1mneyyy/dsh-TUI`（@ 646740f，存于 `/tmp/dsh-TUI`）逐文件核验 + 宿主 DeepSeek Harness 本机安装源码包 + pi 官方扩展 API 文档。除非标注「README 声称」，下述内部实现均已对源码核实。

## TL;DR

- **dsh = DeepSeek Harness**（DeepSeek 官方 coding-agent CLI，上游 `deepseek-ai/deepseek-harness`）；**dsh-TUI 是它的社区 TUI 插件**，官方领衔者推荐名单第一位。纯插件挂载、卸载无痕——与 pi-nebula 的「chrome 包」定位同构。
- **规模远超预期**：TypeScript，626 个 TS/TSX 文件、约 **148.6k 行**，npm 包 `@deepseek-harness-tui/dsh-tui` v0.12.0，MIT。React ^19.2 是唯一框架依赖——**Ink 不是依赖而是自带 fork**（`src/ink/ink.tsx` 137KB + 自写 `dom.ts` / `hit-test.ts` 22KB / `reconciler.ts` / `src/native-ts/yoga-layout/`），鼠标交互（hit-test）就是这么来的。
- 设计心法：**「会话日志是唯一事实源，UI 只是投影」**；事件驱动 projection + 虚拟化，长会话 O(可见窗口) 渲染。
- 功能面（已对源码核验组件存在）：流式 Markdown、Mermaid→Unicode 图、LaTeX→Unicode/终端图片、Kitty/Sixel 图片预览（缩放/平移）、可点击时间线、实时状态条（context bar、成本、缓存）、统一会话管理器（★ 置顶/过滤）、跨 agent 会话迁移、zh/en 双语（`i18n.ts` 单文件 160KB 字符串表）、像素鲸鱼宠物（`assets/whale-girl/`）。
- **对 pi-nebula 最有价值的借鉴**：走 `registerMarkdownTransformer` 的 **Mermaid/LaTeX → Unicode**、metrics bar 增补 TPS/上下文进度条、非阻塞更新自检、`#L12-14` 行号补全、`?` 速查浮层、双语字符串表。
- **不可移植**（pi 边界硬约束）：鼠标交互、thinking 流式渲染、进程内后台会话——pi 无对应 API，详见 §7.3。

---

## 0. 来源

| 编号 | 来源 | 性质 |
|---|---|---|
| **[D]** | `https://github.com/ccch1mneyyy/dsh-TUI` 本地 clone（`/tmp/dsh-TUI`，HEAD `646740f`，PR #1249 合入）。引用形如 `src/…:行` | 一手（源码） |
| **[H]** | 宿主 DSH 发布源码包 `~/.dsh/profiles/node_modules/@deepseek-ai/*`（upstream `github.com/deepseek-ai/deepseek-harness`；本机版本 0.1.0-rc.5） | 一手（宿主源码） |
| **[P]** | pi 官方扩展 API 文档（`@earendil-works/pi-coding-agent` docs） | 一手（pi 文档） |
| **[F]** | 本仓库 `README.md` / `FEASIBILITY.md` / `CONTEXT.md` / `extensions/nebula.ts` | 一手（pi-nebula 自身） |

dsh-TUI GitHub 仓库页自述（README）作为补充叙事来源，凡引用处标「README 声称」。

## 1. 项目定位：这是什么

- **dsh 的全称/含义**：**DeepSeek Harness** 的 CLI 产品启动器（product launcher）——DeepSeek 官方 coding agent harness。证据：`@deepseek-ai/dsh` 包 description "dsh CLI: profile boot, plugin management, and the browser UI alias"（`~/.dsh/profiles/node_modules/@deepseek-ai/dsh/package.json:3`），repository 指向 `github.com/deepseek-ai/deepseek-harness`（同文件 :5-8）[H]。
- **dsh-TUI 是什么**：DSH 的第三方 TUI 插件——DSH 默认交互界面是浏览器 web 前端（`dsh web`），dsh-TUI 补上终端原生界面。README 自称 "DSH's officially recommended TUI plugin"，官方领衔者推荐的社区插件名单第一位；仓库页与最近 commit `5e10e3d docs(readme): note the official lead's first recommended community plugin` 相互印证 [D]。
- **解决什么问题 / 定位**：终端里的全功能交互界面，且**不改宿主内核**——"It mounts as a pure plugin, with no core changes. Install to enable; uninstall leaves no patches behind."（README 声称）。挂载方式是宿主 profile 体系内的树外插件 + `cordis.patch.yml`（[D] 仓库根有 `cordis.patch.yml` 25KB、`cordis.yml` 10KB）。与 pi-nebula 的「chrome 包，只管界面」同构。
- **目标用户**：DSH 终端用户；中文社区活跃（微信群 + QQ 群，README 声称）。

来源：[D] README.md、`package.json`（keywords: deepseek, deepseek-harness, cordis, tui, terminal, cli, ink, agent, coding-agent）、`cordis.patch.yml`、git log；[H] `@deepseek-ai/dsh/README.md:5-39`、`package.json:3-8`。

## 2. 技术栈（源码已核验）

- **语言**：TypeScript；**React ^19.2.0** 是唯一的 UI 框架依赖（[D] `package.json:406`）。
- **渲染**：**自带的 Ink fork**，不是 npm 依赖——`src/ink/` 目录共 40+ 文件：`ink.tsx`（137KB）、`dom.ts`（22.5KB）、**`hit-test.ts`（22.4KB，鼠标命中测试）**、`reconciler.ts`、`focus.ts`、`bidi.ts`、`frame.ts`、`flush-tick.ts`，布局用 `src/native-ts/yoga-layout/`（Yoga 的 TS 移植）。`package.json` 里 `"ink"` 只是 keyword，不是 dependency。
  - → **这解释了它的鼠标交互为什么做不到 pi 里来**：那是它自写渲染器的内置能力，不是 Ink/宿主给的。
- **规模**：626 个 `.ts/.tsx` 文件，合计约 **148,595 行**（`find src -name '*.ts*' | xargs wc -l`）。单文件大户：`src/components/MessageList.tsx` 90.5KB、`src/ink/ink.tsx` 137KB、`src/i18n.ts` 160KB。
- **分发**：npm `@deepseek-harness-tui/dsh-tui` v0.12.0（[D] `package.json:1-2`），全局装后得到 `dsh-tui` / `dst` 双命令 launcher；`standalone/entry.mjs` 是独立打包入口。Node `^22.19 || >=24`，pnpm workspace + `vendor/dsh-std` 子模块，不支持 Git URL 安装（README 声称）。
- **主题系统**：`src/theme.ts`（25.6KB）+ `themeCatalog.ts` + `customTheme.ts` + `themePrefs.ts`——主题是一等公民，有目录/偏好/自定义三层。
- **定价模型**：`src/deepseekPricing.ts` 13.4KB——成本估算按各家模型费率 × peak/idle × cache 分量计算。

来源：[D] `package.json`、`src/ink/`、`src/native-ts/yoga-layout/`、`standalone/`、`src/theme*.ts`、`src/deepseekPricing.ts`、wc 实测。

## 3. 宿主架构（dsh 如何跑起来）——据宿主一手源码 [H]

dsh-TUI 的所有能力长在宿主的插件缝上，理解宿主才能理解它的做法：

1. **Profile = 补丁层叠**：profile 目录持有 `package.json`（`dsh.profile` 清单 + 有序 `bundles`）+ 用户 `cordis.patch.yml`；bundle 先从 dsh 安装内解析，再从 profile 自己的 `node_modules`（pnpm 装的树外插件，dsh-TUI 即此类）解析。
2. **会话日志 = 唯一事实源**：每会话一条 append-only JSONL（zstd 分帧、含校验头帧），目录形如 `<root>/--<normalized-cwd>--/<id>/session.jsonl.zstd`（本机实测 `~/.dsh/sessions/` 布局吻合）。
3. **会话投影（projection）**：`dsh-session-projection` 提供纯函数折叠单元（`init/apply/view`），由框架按 committed event 喂给所有 UI——**这就是 dsh-TUI「event-driven projection」的宿主机制**。
4. **持久 PTY 缝**：`dsh-terminal` 提供 owner-scoped persistent PTY，后台 shell 会话由它支撑（dsh-TUI 的 `/bg` 建立在这上面）。

## 4. dsh-TUI 的渲染管线与接口（README 声称 + 目录佐证）

- 运行链路（README）：`dsh profile → dsh-base → dsh-TUI Cordis patch → agent preset + DSH services → session/event → Channel projection → React components → Ink/Yoga renderer → terminal`。
- 职责切分（README）："The TUI handles interaction and presentation. **The session log is the source of truth.** DSH services own models, tools, and persistence. Long sessions render in O(visible window)."——配套手段：event-driven projection、virtualization、bounded caches。
- 兼容面：主要兼容 DSH `0.2.0-rc.2`，adapter 支持 Shell API、V4 session messages、declarative presets、profile-backed settings（[D] `ADAPTER.md` 5.8KB、`src/dsh-adapter/` 目录佐证）。
- 更新机制：启动后**后台**检查新版本，"never blocks the first frame"；`/update` 升级后自动重启并恢复当前会话（README 声称）。
- 扩展生态：自有插件组织 `dsh-tui-ecosystem`（[D] `dsh-ecosystem-spec/` 目录佐证）。

## 5. 功能清单（组件均已对源码核验存在）

| 功能 | 实现证据（[D] src/…） | 备注 |
|---|---|---|
| 流式 Markdown + 表格 | `components/Markdown.tsx`（10.8KB）、`MarkdownTable.tsx` | |
| Mermaid → Unicode 图 | `components/MermaidDiagram.tsx`、`terminal-utils/mermaid.ts` | ```` ```mermaid ```` 围栏渲染 |
| LaTeX → Unicode / 终端图片 | `components/MathBlock.tsx`、`InlineMathParagraph.tsx`、`terminal-utils/latex.ts`、`src/math/{inline-layout,layout,renderer}.ts` | display block 里堆叠排版分数/极限 |
| 图片预览（缩放/平移） | `components/ImagePreviewOverlay.tsx`（19.4KB） | Kitty/Sixel；无图形协议回退文字 |
| 时间线轨道 | `components/trajectory/` 目录 | 三形态 timeline/scrollbar/hidden（README 声称）；可点击（自写 hit-test 支撑） |
| 实时状态条 | `components/ActivityLine.tsx`、`ContextBarView.tsx` → `screens/StatusMetrics.js`、`CompactionStatusRow.tsx`、`BalanceReportRow.tsx` | context bar、活动动画、成本；TPS/缓存命中率为 README 声称 |
| 会话管理器 | `components/sessions/`、`sessionPins.ts`、`sessionHistory.ts`、`sessionMounts.ts`（30.9KB）、`starAction.ts` | ★ 置顶/过滤/workspace 侧栏（README 声称四入口） |
| 历史/搜索/帮助 | `components/HistorySearchDialog.tsx`、`HelpMenu.tsx`、`history.ts`（↑/↓ 与 Ctrl+R 按当前 project 限定，commit `d63e756`） | |
| 跨 agent 会话迁移 | `components/MigratePicker.tsx`、`migrationPrefs.ts`、`src/adapter/` | Claude Code/Codex/OMP/zcode/Grok Build → DSH 会话库，幂等、确定性 UUID（README 声称）；`pi` 在 adapter registry 上排队扩展 |
| 双语 UI | `src/i18n.ts`（160KB，条目形如 `{ zh: '…', en: '…' }`） | 单文件字符串表 |
| 像素鲸鱼宠物 | `assets/whale-girl/`、`components/LogoV2.tsx`（28KB） | 22 帧手绘，素材移植自 `lhh010/dsh-ui-whale`（BSD-3，THIRD_PARTY_LICENSES 佐证） |
| 工作流命令 | `src/commands.ts`（12.4KB）、`command-trees.ts` | `/new` `/compact` `/export` `/tree` `/fork` `/rewind` `/settings` `/cost` `/model` 等 |
| 模型/努力偏好 | `modelPrefs.ts`、`modelGroups.ts`、`modelRecents.ts`、`modelRoute.ts`、`effortPrefs.ts`、`EffortSlider.tsx` | 模型热切换以 fork 会话实现（README 声称） |
| OAuth 登录 | `src/dsh-adapter/oauth/`（`service.ts`、`bonus.ts`） | pi-ai OAuth 等 |
| 外部状态上报 | `src/herdr.ts`（5.3KB） | 向 Herdr 类工具报 idle/working/blocked |
| CLI 附件 | `bin/`、`standalone/entry.mjs` | `--resume` / `update` / `doctor` / `safe` / `version`（README 声称） |

自报的已知限制（README 声称）：插件 context 无独立展示、`Ctrl+V` 依赖平台剪贴板工具、拖放仅单 `file://` URI、后台会话进程内即停、`≈¥` 成本为估算。

## 6. 活跃度

- **非 fork**，独立插件仓库；commit 持续推进（本地 clone 到 PR #1249 为止，最近提交含中文说明，中文社区驱动）。
- 仓库自述 3892 stars / 235 forks，抓取当日仍在更新（README/GitHub 页面声称；GitHub Trending TypeScript 日榜 #7 为其自述）。
- 生态：`dsh-tui-ecosystem` 组织 + `dsh-ecosystem-spec/` + plugin-template；包曾用名 `dsh-cc-tui` 后更名（README 声称）。
- 许可：**MIT**（[D] LICENSE）——若移植代码需遵守，借鉴设计无碍。

来源：[D] LICENSE、git log、`dsh-ecosystem-spec/`、THIRD_PARTY_LICENSES；README 声称项已标注。

---

## 7. 对照 pi-nebula：可借鉴点（逐条 + 移植可行性 + 风险）

> **取舍结果（2026-10-01 修订）**：原采纳 #1 #2 #4 #5。后经升级调查发现 pi 0.84.0 已内置 Mermaid/LaTeX 的 Unicode 渲染，**#1 #2 取消**（宿主取代，见 `docs/adr/0006-dsh-tui-borrowings.md`）；#3 缓做（等 footer/editor 重设计）；#6 拒绝（非 chrome 职责）；#7 缓；#8 弃。待实施只剩 #4（活动动画）与 #5（更新自检）。本节保留完整分析原样，供日后翻案时查阅。

pi-nebula 现状（[F]）：常驻启动面板 / 状态条 / metrics bar / 编辑器壳 / 7 工具行内渲染。硬边界：**pi 内置 user/assistant/thinking 消息渲染器不可替换**（`README.md` 已知边界节）；**鼠标事件只在 fullscreen 模式路由**（`FEASIBILITY.md:78`）；`renderCall/renderResult` 的 `state` 仅行内共享、不跨行（`FEASIBILITY.md:82`）；Image 可内联但不能交互（`FEASIBILITY.md:81`）。

### 7.1 可直接落地（pi API 已覆盖）

1. **Mermaid → Unicode 图** ⭐ 最高价值
   通道：`pi.registerMarkdownTransformer`（仅显示层变换，收 `messageType`/`isStreaming`/`availableWidth`；流式或 thinking 时原样放行 [P]）。思路：检测 ```` ```mermaid ```` 围栏 → 纯函数布局器（Unicode 线框盒/箭头）→ 换成普通 fenced 输出，交 pi 内置渲染器照常渲染。
   可行性 ✅；风险：变换须同步且便宜（pi 文档要求）、流式时必须跳过（半截 mermaid 无法布局）、窄终端降级为原代码块。
2. **LaTeX → Unicode 数学**
   同一通道：`$…$`/`$$…$$` → Unicode（√、∑、上下标、分数行内 `(a/b)`）。可行性 ✅；风险：误伤普通美元金额——只在成对 `$` 且无空格紧邻时触发。
3. **metrics bar 增补：TPS + 上下文进度条**
   dsh-TUI 的 `ContextBarView`/`StatusMetrics` 对应物：pi-nebula metrics bar 已在遍历 `ctx.sessionManager.getBranch()` 的 usage（`extensions/nebula.ts` metricsBar），加 tokens/s 与 `ctx.getContextUsage()` 百分比画 `▰▱` 进度条即可。可行性 ✅；风险小。
4. **活动动画（working indicator）**
   pi 有 `setWorkingIndicator`；dsh-TUI 的 ActivityLine/shimmer 可移植为自定义 spinner。可行性 ✅；风险：动画节流不当会高频整屏重绘。
5. **非阻塞后台更新自检**
   dsh-TUI「启动后后台检查更新，绝不阻塞首帧」。pi-nebula 以 `git:…@<commit>` 钉住安装，可在 `session_start` 后异步 `git ls-remote` 比对远端 tag，有新版就在状态条放 dim 提示。可行性 ✅；风险：网络超时须静默、不自动升级。
6. **`#L12-14` 文件行号范围补全**
   pi 有 `addAutocompleteProvider`。做 `@文件` 后接 `#L起-止` 的补全源。可行性 ✅。
7. **`?` 快捷键速查浮层**
   pi 有 `registerShortcut` + `ctx.ui.custom` overlay。把启动面板里静态的键位 Tips 抽成随时呼出的浮层，启动面板可更瘦。可行性 ✅（大浮窗 `width/height:"100%"` 属实验性，小浮窗不受影响）。
8. **zh/en 双语文案**
   学 dsh-TUI 的做法：单文件字符串表（它的 `i18n.ts` 160KB 就是个大号 `{ zh, en }` 表）。pi-nebula 目前文案散在代码里；抽字符串表 + `nebula.locale` 设置。可行性 ✅。

### 7.2 要妥协（边界内可做，形态必然不同）

9. **时间线竖轨**：视觉竖轨**可以画**（模块级 WeakMap 按 `toolCallId` 自建跨行连续性，绕开 `state` 不跨行的限制），但**不可点击**（pi 鼠标只在 fullscreen 且无扩展级 mouse API）。README 里列为「做不到」的这条可细化为「视觉 ⚠️ 可做、点击 ❌」。建议先做「tool 组起止竖线」弱化版。
10. **全屏草稿编辑器**：`ui.custom` overlay（实验性）做大号浮层编辑器，或 CustomEditor 内做模态。可行性 ⚠️。
11. **跨 agent 会话迁移**：pi `SessionManager` 只文档化 `list/listAll`，无「创建/写入会话」API；硬写 session jsonl 属逆向未文档格式。可行性 ❌，若做只能是独立脚本。不建议现在做。
12. **会话管理器增强（★ 置顶/过滤）**：pi 内置 `/resume` `/tree` 不可替换；妥协为 `/nebula-sessions` 命令 + `SessionManager.list` 自有视图。可行性 ⚠️。
13. **成本含子代理**：pi 扩展只能读主会话 usage，子代理用量未暴露；只能标注「不含子代理」。可行性 ⚠️。
14. **图片缩放/平移**：pi Image 只能内联；妥协为预生成多档尺寸 + 切换档位。可行性 ⚠️。
15. **外部状态上报**：`ctx.ui.setStatus()` 对接 tmux/状态栏工具，正道已在。可行性 ✅（价值取决于用户是否用 Herdr 类工具）。

### 7.3 不可行 / 不建议（明确越界，记录在案防止反复起意）

16. **鼠标交互**（点 tool 卡/时间线、拖选）：dsh-TUI 靠**自写渲染器 + 自写 hit-test**（`src/ink/hit-test.ts` 22KB）实现；pi 不向扩展暴露鼠标事件。❌ 这是「自带整套渲染引擎换来的」，不是可摘取的单点功能。
17. **thinking 流式渲染改造**：内置 thinking 渲染器不可替换；transformer 官方建议 thinking 放行。❌
18. **进程内后台会话（`/bg`）**：dsh-TUI 靠宿主持久 PTY 缝；pi 无 background session API。❌
19. **像素鲸鱼宠物**：技术上 ⚠️（header 组件自绘帧 + `setInterval` 驱动），但高频重绘与 pi 增量渲染可能打架，且与本仓库「minimal terminal coding harness」的语言冲突。记为「知道可行，主动不做」。

### 7.4 工程心法（非功能借鉴）

- **「会话日志是事实源，UI 是投影」**：pi 的 session jsonl 同样是事实源；pi-nebula 的 `recentSessions/sessionLabel` 已在挖 jsonl——值得升格为 ADR 级设计原则（一切显示值尽量从会话日志/官方 API 派生，不另立状态）。
- **「先渲染上次成功的列表，再查变更」**：pi-nebula 启动面板数据目前是 session_start 一次性算死；可学 dsh-TUI 先画缓存值、异步补真值（用 `tui.requestRender()` 显式失效）。
- **声称分级（evidence-gated claims）**：dsh-TUI 明确区分「机制层有 fixture 验证」vs「现场环境未复测」。本仓库文档（尤其 FEASIBILITY 表）可借用这种写法。
- **主题目录 + 偏好 + 自定义三层**：dsh-TUI 的 `themeCatalog.ts`/`themePrefs.ts`/`customTheme.ts` 分层值得参考，若 pi-nebula 未来出多主题。

来源：[F] `README.md` 已知边界节、`FEASIBILITY.md:77-82`、`extensions/nebula.ts`（metricsBar / recentSessions / /nebula-off）；[P] registerMarkdownTransformer / addAutocompleteProvider / registerShortcut / setWorkingIndicator / SessionManager 文档；[D] §2/§5 所列文件。

---

## 8. 存放位置说明

本仓库 `docs/` 下只有 `adr/`（决策记录 0001–0005）与 `preview.png`，没有研究笔记的先例。因此与 adr 平级新建单一文件 `docs/research-dsh-tui.md`（它是调研不是决策，不进 `docs/adr/`；只有一篇，暂不建 `docs/research/` 目录）。后续同类调研沿用 `docs/research-<主题>.md` 命名；积累到 3 篇以上再收进目录并建索引。
