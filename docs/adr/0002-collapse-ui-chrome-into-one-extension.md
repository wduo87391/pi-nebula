# 5 个 UI chrome 包收编为单一扩展 pi-nebula

用户的根本诉求是**统一**：同时安装的插件过多、UI 配置分散在 `powerline: {}` / `toolbox: {}` 等多个键里，令人不适。

因此停用 5 个纯界面包——`pi-powerline-footer`、`@pi-kaush/pi-welcome-screen`、`@andy8647/pi-toolbox`、`@monotykamary/pi-tps`、`@ifi/oh-pi-themes`——由 `pi-nebula` 一个扩展 + 一套 nebula 主题取代，所有 UI 配置收进 `settings.json` 的 `nebula` 键。

**不在收编范围**：功能类包（`pi-mcp-adapter`、`pi-sub-agent`、`pi-notify`、`pi-diff`、`edb-context-viewer`、`pi-cursor` 等）本就不是 chrome，合并它们只会制造另一种混乱；数据源 `~/.Code/pi-usage-r4`（provider 余额）也不收编——它依赖各家 provider 的凭证与额度语义，且实现尚不完整，只保留「若它发布 status 则显示」的弱对接。