# 配色以桌面 stylix 的 nebula 方案为准，而非 nixvim 的 catppuccin

用户的桌面由 stylix 统一着色，配色是自定的 base16「nebula」（蓝紫青冷调深色），定义在 `~/.dotfiles/nix/homeConfigurations/unsual/stylix/default.nix`，并已被 alacritty、GTK、Qt 采用。

但 `~/.dotfiles/nix/homeConfigurations/unsual/nixvim/themes.nix` 用的是 Catppuccin mocha——一个孤例。

pi 与 alacritty 同屏，因此以 **nebula** 为准：16 个 hex 映射到 pi 的 53 个 theme token，产出一份**静态** `theme.json`，hex 只在单一 nix let 块里定义一次（不引入构建期生成或运行时注入）。nvim 的 catppuccin 不在本项目范围内。

**Considered Options**: Catppuccin mocha（跟随 nvim）——被否决，与终端同屏的配色应同源。构建期从 `~/.config/stylix/palette.json` 生成——被否决，nebula 是手写死在 nix 里的、不会自行变化，生成的收益不足以抵消多一个活动部件。