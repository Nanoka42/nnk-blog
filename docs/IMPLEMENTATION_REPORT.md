# 历史实现记录与架构说明

> 本文保留博客初建时的实现背景，游戏架构于 2026-09-17 按 3D 集成与目录迁移同步。它不是当前版本的验收报告；测试数量、页面数量和产物体积会随内容变化，请以本次构建与测试输出为准。日常维护以 README、内容更新指南与部署指南为准。

## 结果与架构

在原素材与 H5 项目之外新建了完整 Astro 博客；纯 SSG，没有 adapter、SSR、数据库或访问时所需的 Node 服务。最终发布目录为 `dist/`。

实现了首页、文章列表/详情、标签、作品列表、康威跳棋、关于页和 `404.html`，以及 RSS、sitemap、robots、canonical、基础 Open Graph。康威跳棋现在直接在 `/projects/conway-soldiers/` 显示棋盘，不再设置单独的作品介绍中间页。设计采用头像中的紫色与浅黄点缀，静态图片经过 Astro 优化；原 PNG/GIF、封面与 H5 源文件均保留。

依赖以 `package-lock.json` 锁定，根要求 Node.js 24。主要依赖职责如下，具体版本以 `package.json` 与 lockfile 为准：

- Astro 与 TypeScript：静态站点和类型检查。
- `@astrojs/markdown-remark` 的 unified processor、`remark-math`、KaTeX、`rehype-slug`：Markdown、数学和标题锚点。
- Astro 自带 Shiki，以及 `@astrojs/rss`、`@astrojs/sitemap`：代码高亮与订阅、索引产物。
- `@astrojs/check`、Node 内置 test runner、Cheerio 与 Playwright：静态、内容和浏览器检查。

## Markdown、数学与代码

`src/content.config.ts` 使用 Content Collections 的 glob loader 与 schema 验证。文章主要为 `.md`，包含标题、摘要、日期、标签、draft、可选本地封面与 alt。生产路由、列表、标签与 feed 都过滤 draft。没有为普通文章引入 MDX 或客户端框架。

`src/plugins/markdown.mjs` 在 remark math AST 阶段读取 `node.value`，调用 KaTeX 构建 HTML/MathML，并将原始 TeX 写入 HTML 转义后的 `data-math-source` 与按钮 `data-copy-source`。复制不依赖从 KaTeX HTML 反向恢复，也不带数学分隔符。独立公式右上角和行内公式旁的 ⧉ 都是原生按钮，支持键盘与触摸；无 Clipboard API/权限时弹出可选源文本。

代码通过 Shiki 构建高亮，transformer 直接保存其原始输入；remark 同时保留未高亮 fence 的原文作后备。单行、空行、引号、HTML 字符均不会因高亮丢失。复制在原生 TypeScript 脚本中完成，未加载 React/Vue 等框架。

GFM 表格、任务列表、删除线、脚注、图片、引用与列表已覆盖。表格、代码、宽公式使用独立横向滚动容器。数学标题保留隐藏的源文本供锚点和目录提取。正文最大宽度 760px，移动端目录折叠。主题在 head 内首屏绘制前读取，支持系统/浅色/深色及偏好持久化、系统变化和存储不可用回退。

## 康威跳棋集成

2D 源码已从原根目录迁移到 `apps/conway-soldiers/`，3D 源码位于 `apps/conway-soldiers-3d/`。两个项目均以 `index.html` 为入口，使用原生 ES Modules + Canvas，无 npm 运行依赖或服务器 API。通过 `npm --prefix apps/<slug> run dev`、`npm --prefix apps/<slug> test`、`npm --prefix apps/<slug> run build` 独立开发与验证，构建产物位于各自 `dist/`。

根 `scripts/prepare-games.mjs` 按 `config/games.mjs` 注册表构建两个项目，将资源放入 `public/play/<slug>/`，入口暂存 `.generated/<slug>.html`。两个 Astro 入口页复用 `src/layouts/GameLayout.astro`，在构建时集成游戏 HTML、站点元信息、返回作品入口与备案信息。正式页面分别是 `/projects/conway-soldiers/` 与 `/projects/conway-soldiers-3d/`，游戏规则仍由各自项目实现。目录约定和后续作品接入步骤见[交互作品集成说明](INTERACTIVE_APPS.md)。

2026-09-16 的调整删除了 `conway-notes` 文章及相关入口，封面从文章目录移至 `assets/conway_checker_cover.png`。原 H5 信息卡片删除了棋子跳跃图示与两条操作提示，HTML 与 README 的署名统一为「真理院七叶」。

`config/redirects.mjs` 保留 2D 的 25 个短链及旧 `/play/conway-soldiers/` 跳转，并增加 3D 正则 `^conways?[_-]?(?:soldier|checker)s?[_-]?3d$` 的 72 个短链、`/coso3d` 和 `/play/conway-soldiers-3d/` 兼容入口。两个游戏的内部说明窗口互相链接。静态站点生成跳转页，CDN HTTP 重定向规则另见部署指南。

不使用 iframe，保留 Canvas 焦点和原有键盘/触摸操作；桌面保持全视口布局，3D 手机页面在高度不足时允许按内容滚动，确保全部控件与底栏可达。生成目录在每次准备时重建并被 Git 忽略，原源码不删除。Vite 忽略游戏及生成目录，避免 Windows 文件监视句柄阻碍清理；修改游戏后重新启动根 dev，或用原项目服务开发。

## 主要文件

- `astro.config.mjs`、`config/site.mjs`、`src/config.ts`：构建、Markdown、域名、个人资料与项目数据。
- `config/games.mjs`、`config/redirects.mjs`、`config/registration.mjs`：游戏集成注册表、跳转映射与 ICP / 公安备案展示配置。
- `src/content.config.ts`、`src/content/posts/`：schema、初始文章与 draft regression fixture。
- `src/layouts/`、`src/components/`、`src/pages/`、`src/styles/`：布局、页面、阅读与主题交互。
- `scripts/prepare-games.mjs`、`scripts/verify-build.mjs`：自动集成和静态文件/本地引用检查。
- `tests/`、`playwright.config.ts`、`.github/workflows/ci.yml`：内容、浏览器、H5 和 CI 验证。
- `README.md`、`docs/CONTENT_GUIDE.md`、`docs/DEPLOYMENT_GUIDE.md`：日常维护与部署说明。

## 验证方法与记录范围

早期报告记录过当时版本的本地通过结果。页面路由与浏览器测试结构已在发布前调整，这些历史数字不能证明当前版本已通过检查，因此本文不再保留固定的测试数量、HTML 数量或体积结论。

当前应依次执行 `npm run check`、`npm test`、`npm run build`、`npm run test:browser`。首次运行浏览器测试需先安装 Chromium。Playwright 分别启动开发服务与服务于已有 `dist/` 的生产预览服务；production 项目单独检查构建产物，其他项目用于桌面、平板和手机视口。修改代码或内容后，必须先重新构建再运行浏览器测试。

浏览器回归涉及路由、404、图片、页面宽度、数学/代码源复制、剪贴板权限拒绝回退、主题与康威跳棋操作。构建后的静态检查用于发现遗留草稿链接、资源引用和路由配置问题。Windows 剪贴板的 CRLF/LF 差异在比较时按逻辑行归一化。

CI 在 `push → main`、PR、手动触发时依次执行 `npm ci → check → test → build:release → browser tests`，保存带 commit SHA 的 dist artifact。CI 定义存在不等于远程 runner 已成功运行；正式验收应保留相应执行日志。

## 已知限制与下一步

- 博客及原 2D 游戏的发布链路已建立，日常状态以[部署运维清单](DEPLOYMENT_CHECKLIST.md)为准；本次 3D 集成与源码迁移本身不包含推送、发布或云端配置变更。
- 生产域名已确定为 `nanoka.tv`。普通 `npm run build` 支持 localhost 与禁止索引的本地构建；正式发布须配置 `SITE_URL=https://nanoka.tv`，使用 `npm run build:release` 检查生产域名后重新构建。
- `config/registration.mjs` 保留完整网站备案号 **粤ICP备2026138999号-1**，按广东规则在页脚展示主体号 **粤ICP备2026138999号**。公安备案尚未完成，获批后再配置真实的备案展示信息；办理时限、服务器与 CDN 配置要求见部署指南。
- 个人简介与项目资料在 `src/config.ts` 中维护；初始文章仍可自行改写。游戏源码署名已统一为「真理院七叶」，原有音效署名保留。
- 原游戏刷新后不保存对局。作品保持自己的视觉与明亮主题，不强制重写为博客深色模式。
- KaTeX 不是完整 LaTeX 引擎；无效公式会报错。未启用 MDX、搜索、评论、分析或自动预约发布时间，当前没有这些运行需求。
- Chromium 的桌面与触摸视口模拟不能替代 iOS Safari / Android 真机测试或完整屏幕阅读器审计。
- OSS 上传若采用默认不删除策略，已发布后删除/改 draft 的旧对象需额外下线并刷新 CDN，详见部署指南。

正式发布前仍需按部署指南核对 OSS/CDN、DNS、HTTPS、跳转规则与备案展示，运行当前版本的发布构建和测试，再部署最终 `dist/`。

实现依据：[Astro Markdown processor](https://docs.astro.build/en/guides/markdown-content/)、[Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)。阿里云与 GitHub OIDC 的官方参考集中列于部署指南。
