# pi-nebula

把 pi 的终端界面收拢成**一个扩展 + 一套主题**的项目。它取代当前散落的多个 UI 插件，并把配色对齐桌面 stylix 的「nebula」方案。

## Language

**统一 (Unification)**:
本项目的根本目标——减少同时安装的插件数量，并把分散的 UI 配置收进单一配置面。
_Avoid_: 整合、美化、增强

**chrome 包**:
只负责终端界面外观、不提供任何功能的 pi 扩展（状态条、启动头、tool 行、主题、tps 显示）。与之相对的是**功能包**。
_Avoid_: UI 插件、美化包、皮肤

**收编**:
停用某个已装的 chrome 包，并由 pi-nebula 自己实现其界面职责。
_Avoid_: 合并、融合、集成

**对接 (Bridging)**:
通过 `ctx.ui.setStatus()` / `footerData.getExtensionStatuses()` 读取别的扩展发布的数值并在自己的界面里显示——只交换数值，不共享代码。
_Avoid_: 集成、融合

**nebula**:
本项目采用的配色方案，即桌面 stylix 的 base16 方案（16 色，蓝紫青冷调深色），机器可读副本在 `~/.config/stylix/palette.json`。
_Avoid_: 主题、配色表、palette

**取意**:
本项目的保真原则——取设计稿的信息结构与语义色，按 pi 的真实 API 能力重新设计妥协项，做不到的直接砍掉，而非像素级复刻。
_Avoid_: 复刻、还原、1:1

**启动面板 (startup panel)**:
pi 原生的顶部区域，逐条列出已加载的 context files / skills / extensions / themes——信息密、无视觉层级。当前界面里最丑的部分。
_Avoid_: welcome、header（不要与 welcome overlay 混用）

**常驻面板 (persistent panel)**:
pi-nebula 用来取代启动面板的常驻区域：钉在屏幕顶部，位于对话与状态条之上，含键位 Tips、Loaded 计数、Recent sessions。默认形态。
_Avoid_: 启动页、welcome、header

**welcome overlay**:
常驻面板的可选替代形态：居中浮窗、一次性、按键即消失（`nebula.welcome = "overlay"`）。关闭后只剩一条空的编辑器，因此不是默认。
_Avoid_: 启动页、启动浮层

**pi-nebula**:
本项目的交付物，一个同时提供 extension 与 theme 的包。