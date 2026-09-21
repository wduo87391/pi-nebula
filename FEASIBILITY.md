# pi-TUI 美化插件 — 可行性分层表

> 产物形态：**Extension 为主 + 底层 theme**（已拍板）
> 判定图例：✅ 能落地 · ⚠️ 要妥协 · ❌ 做不到/是假的
> 依据：`docs/themes.md`（53 色 token）、`docs/extensions.md`（ctx.ui / renderCall / registerMessageRenderer）、`docs/tui.md`（Box / Container / Image / Overlay / 自绘 render）

---

## 图1 — 启动 / Welcome 面板

| 元素 | 判定 | 手段 | 备注 / 风险 |
|---|---|---|---|
| 双栏 + 外边框布局 | ✅ | `ctx.ui.setHeader((tui,theme)=>({render,invalidate}))` 替换内置 header | pi 的"welcome"就是 **startup header**，官方 API 直接替换；`quietStartup:true` 可抑制 |
| 左栏像素 Pi logo | ✅ | 多行 `Text` / 字符块 | 纯字符 |
| 左栏 Ciallo 标题（品红） | ✅ | theme `accent` + `Text` | |
| 版本号 `v0.85.1 [dark]` | ✅ | 运行时读版本 + 主题名 | |
| 分隔线 / tagline / 下划线 | ✅ | `borderMuted` 或自绘 `─` | |
| Tips 键位表 | ✅ | 自绘表格 + `Text` | 文案静态 |
| 键帽圆角背景 | ⚠️ | 背景色 + 空格模拟 | 终端只能直角，圆角不可控 |
| Loaded 计数（2/22/32/22） | ✅ | 资源发现 / session 真实数量 | 数值真实可得 |
| Recent sessions + 相对时间 | ✅ | `SessionManager.list(cwd)` / `listAll()` | 入口结构未文档化，相对时间需自己从 mtime 算 |
| `↑/↓ to navigate` 交互 | ⚠️ | 自绘键盘处理 + `MouseRegion` | 交互全手写 |
| 状态条（模型/think/cwd/git/时间） | ✅ | `ctx.ui.setFooter()` → `{render(width),invalidate,dispose}` | `footerData.getGitBranch()/getExtensionStatuses()/onBranchChange()`；token/cost 从 `ctx.sessionManager.getBranch()+ctx.model` 算 |
| 输入框 placeholder | ⚠️ | 内置编辑器无法换皮，只能 `setEditorText` 预填 | **真正的输入框外观改不了** |
| 底部 metrics bar | ⚠️ | 见下表 | 与图2共用数据问题 |
| 顶部 macOS 三点 + 标签页 | ❌ | 截图装饰 | pi 不画窗口 chrome |

### 底部 metrics bar 逐项

| 指标 | 判定 | 数据来源 |
|---|---|---|
| ↑ input 12.4k | ✅ | `event.message.usage` / session totals |
| ↓ output 3.8k | ✅ | 同上 |
| ctx 16.2k/272k (6%) | ✅ | `ctx.getContextUsage()` |
| cache 82% | ⚠️ | usage 有 `cacheRead`/`cacheWrite`，可算命中率（82% 是编的） |
| cost $0.024 | ✅ | `usage.cost.{input,output,cacheRead,cacheWrite}` |
| balance $12.40 | ❌ | 账户余额，pi 未暴露 |
| 32ms latency | ⚠️ | tool render 的 `executionStarted` 有单次耗时；"总延迟"定义模糊 |

---

## 图2 — 对话 Transcript

| 元素 | 判定 | 手段 | 备注 / 风险 |
|---|---|---|---|
| 用户消息 + 左竖线 + 右对齐时间戳 | ⚠️ | 自绘 message renderer / `userMessageBg` | token 管背景，竖线+时间戳自绘 |
| 蓝色 chevron `>` 前缀 | ✅ | 自绘 `Text` | |
| Thinking 块（紫菱形 + `\|--`/`L--` 树形） | ⚠️ | `thinkingText` token 有；树形字符自绘 | thinking 内容定制程度待确认 |
| 右对齐耗时 3.2s | ✅ | 自绘 padding | |
| Tool 行（绿点+名+args+耗时+结果子行） | ✅ | **`renderCall` / `renderResult`** | pi 明确支持，完全可控 |
| Tool 左侧时间线竖轨 | ⚠️ | 每行自绘左侧 `│` 前缀凑连续 | `context.state` 是**行内局部**，不跨行；跨 message 类型（thinking/tool/text）协调竖线需自建模块级状态，无官方支持 |
| 回答正文 | ✅ | 内置 markdown + theme | |
| 编号列表 + 外框 | ⚠️ | markdown 列表可渲染；外框自绘 | |
| **整屏山湖背景照片** | ❌ | 终端无法把图片垫在文字下 | 只能退化：顶部/侧边放一个 `Image` 装饰块（Kitty/iTerm2/Ghostty） |

---

## 待 grilling 的决策清单（图回答不了的）

1. **布局**：双栏 welcome 是启动弹一次还是常驻？会不会挡住正常输出？
2. **数据**：`balance` 做不到 → 换成什么？metrics bar 保留哪几项？
3. **背景照片**做不到 → 接受纯色，还是用装饰图块？
4. **键帽圆角**做不到 → 直角 / 无背景 / 纯色，选哪种？
5. **图标体系**：emoji（💡📦🕐）还是 Nerd Font？（跨终端一致性）
6. **退化策略**：不支持图片协议的终端（普通 xterm）怎么办？
7. **范围分期**：先做哪一块？
8. **交互**：welcome 面板要键盘导航吗？Recent sessions 可点击？
9. **配色统一**：图1品红为主、图2蓝青+绿 → 统一到哪套？
10. **输入框改不了皮** → 接受吗？

---

## 关键事实（scout 调查，pi v0.85.1）

> 判定汇总（修正后）：✅ 能落地约 70% · ⚠️ 妥协约 25% · ❌ 做不到约 5%。

- **welcome = startup header**：`ctx.ui.setHeader((tui,theme)=>Component)` 替换；`setHeader(undefined)` 还原；`quietStartup:true` 抑制。参考 `examples/extensions/custom-header.ts`。
- **运行模式**：`tuiMode: "regular" | "fullscreen"`（默认 regular），CLI `--tui-mode`。**鼠标事件只在 fullscreen 路由**；regular 模式终端自己管 scrollback。
- **`ctx.ui.custom()` 不带 overlay** = 只替换**编辑器区域**（`done()` 关闭）；**无全屏接管 API**；overlay 可设 `width/height:"100%"` 但标记为 Experimental。
- **footer**：`setFooter((tui,theme,footerData)=>Footer)`，返回 `{render(width):string[],invalidate(),dispose?}`；`footerData.getGitBranch()/getExtensionStatuses()/onBranchChange()`。token/cost 不在 footerData，需从 `ctx.sessionManager.getBranch()` + `ctx.model` 的 `m.usage` 算。
- **Image**：支持 Kitty/iTerm2/Ghostty/WezTerm/Warp；`PI_IMAGE_PROTOCOL` 可覆盖；**不能当背景**（只能按 cell 尺寸内联渲染）；iTerm2 全屏下退化为文字占位符。
- **tool 渲染**：`renderCall(args,theme,ctx)` / `renderResult(result,{expanded,isPartial},theme,ctx)`；`ctx` 含 `args,state,lastComponent,invalidate(),toolCallId,cwd,executionStarted,argsComplete,isPartial,expanded,showImages,isError`；`renderShell:"self"` 可关掉默认 Box 外壳。**`state` 仅在同一 tool 的 call/result 间共享，不跨行**。
- **sessions 列表**：`SessionManager.list(cwd, sessionDir?, onProgress?)`、`SessionManager.listAll(onProgress?)`；入口字段未文档化。
- **打包**：`package.json` 用 `{"pi":{"extensions":[...],"themes":[...]}}`；`@earendil-works/pi-*` 必须放 `peerDependencies:"*"` 且不打包。目录：全局 `~/.pi/agent/extensions/`，项目 `.pi/extensions/`（需 trust）。
- ⚠️ **磁盘上只有编译后的二进制 + docs + examples，没有 TS 源码**。编码前需对 `github.com/earendil-works/pi-mono`（`packages/coding-agent/src`、`packages/tui/src`）核对精确类型（尤其 `FooterData`、sessions 列表项、`ImageTheme`）。