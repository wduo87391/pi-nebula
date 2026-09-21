# 默认从零实现，仅在四个部件上移植既有代码

用户偏好自己拥有代码（「最好从0」），但同时也要求效果优先。

`pi-powerline-footer` 是 MIT 许可且随包发布可读 TypeScript，共 **10,893 行**，其中约 3,600 行是 pi-nebula 不需要的子系统（`bash-mode/*` ≈1,937、`working-vibes.ts` 781、`queue/*` 403、`quote-reply.ts` 289、`cd-command.ts` 190），另有 `index.ts` 3,448 行把两者混在一起接线。整包 fork 意味着收下 10.9k 行再删掉/拆解其中约 60%。

因此规则是：**默认从零写；只在「从零会明显更差」的具体部件上移植**。预判的移植候选：

- `git-status.ts` (363 行) — 异步 git 状态获取 + 缓存 TTL + 写文件后失效
- `token-stats.ts` (304 行) — token 智能格式化、订阅成本识别
- `icons.ts` (191 行) — Nerd Font 图标集 + ASCII 回退
- `context-usage.ts` (156 行) — context 70%/90% 警告色

合计约 1,000 行。

**Considered Options**: 整包 fork 后裁剪——被否决，继承与拆解的成本高于收益。从零全部重写——被否决，会在上述四个部件上重复踩坑。