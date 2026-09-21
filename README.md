# pi-nebula

把 [pi](https://pi.dev) 的终端界面收拢成**一个扩展 + 一套主题**。

取代五个纯界面包——`pi-powerline-footer`、`@pi-kaush/pi-welcome-screen`、`@andy8647/pi-toolbox`、`@monotykamary/pi-tps`、`@ifi/oh-pi-themes`——由本包独自接管全部 chrome 槽位，所有 UI 配置收进 `settings.json` 的单个 `nebula` 键。

配色是 base16「nebula」（蓝紫青冷调深色），与桌面 stylix 方案同源，静态写在 `themes/nebula.json` 里。

## 安装

```bash
pi install git:github.com/wduo87391/pi-nebula@<commit>
```

`ref` 是**钉住的 tag 或 commit**，`pi update --extensions` 不会把它漂到新版本（`docs/packages.md:90`）。

装完在 `settings.json` 里启用主题：

```json
{ "theme": "nebula" }
```

## 接管了哪些槽位

| 槽位 | 实现 | 位置 |
|---|---|---|
| 启动面板 | `ctx.ui.setHeader()` | 屏幕顶部，常驻，位于对话与状态条之上 |
| 状态条 | `ctx.ui.setWidget("nebula-status")` | 编辑器上方 |
| 底部 footer | `ctx.ui.setFooter()` | 渲染为空——只用来抓 `footerData`（git 分支）供状态条使用 |
| metrics bar | `ctx.ui.setWidget("nebula-metrics", …, { placement: "belowEditor" })` | 编辑器下方 |
| 编辑器壳 | `class NebulaEditor extends CustomEditor` | 与状态条、metrics 共用同一个 `INDENT` |
| 工具行 | `pi.registerTool()` 覆盖 7 个内置工具，`execute` 委托回原定义 | 行内 |

设计上的自上而下顺序是：**启动面板 · 状态条 · 编辑器 · metrics bar**。

## 配置

```json
{
  "nebula": {
    "welcome": "header"
  }
}
```

| 值 | 效果 |
|---|---|
| `header`（默认） | 常驻面板，钉在屏幕顶部 |
| `overlay` | 居中浮窗，一次性，按键即消失 |
| `off` | 不画启动面板 |

`settings.json` 的项目级配置（`<cwd>/.pi/settings.json`）覆盖用户级。

## 命令

- `/nebula-off` —— 本次会话恢复 pi 内置的 header / footer / widget / editor

## 要求

- **Nerd Font** —— 图标用的是 Nerd Font 私有区码位（`` `` `` ` ` `` 等）
- **真彩色终端** —— 颜色以 raw truecolor ANSI 输出（`COLORTERM=truecolor`）
- 终端宽度会变，本包**不写死任何列数**；一律走 pi 自己的 `visibleWidth()` / `truncateToWidth()`

## 已知边界

- **pi 内置的 user / assistant / thinking 消息渲染器无法替换**（二进制里硬编码，`ExtensionAPI` 上没有注册点）。因此消息流里的 chevron 前缀、右对齐时间戳、贯穿 tool 组的竖轨这类 chrome **做不到**，不是没做。输出区能改的部分只有 `themes/nebula.json` 的 53 个 token。
- 状态条里的 provider 只能显示 provider **id**（如 `r4coder`），不是真实厂商名——pi 未暴露该字段。

## 开发

```bash
# 语法自查（报 ERR_MODULE_NOT_FOUND 是正常的，pi 内部由 jiti 解析）
node --experimental-strip-types extensions/nebula.ts
```

本地以路径方式安装（`packages` 里写目录路径）会让每次编辑直接影响运行中的 pi；改用上面的 `git:...@<commit>` 形式可以把开发目录与运行实例隔开。

## 许可

MIT