# 微羽笔记本 · 真理院七叶的笔记与作品

一个基于 Astro、TypeScript 和 Markdown 的个人博客。纯静态生成，最终只需部署 `dist/`，无需 Node.js 服务、数据库或服务器渲染。

第一次接触 npm、GitHub Actions 和静态部署，可以先阅读[从写文章到网站上线：构建与部署入门](docs/BUILD_AND_DEPLOY_EXPLAINED.md)，了解源码如何变成 `dist/`、构建产物保存在哪里，以及自动构建与自动部署的区别。

网站已上线至 [nanoka.tv](https://nanoka.tv/)。日常发布、暂停自动发布、故障排查与回滚，请从[部署运维清单](docs/DEPLOYMENT_CHECKLIST.md)开始。

## 本地使用

要求：Node.js **24 LTS**、npm。依赖版本和 lockfile 已锁定，不需要全局安装 Astro。

```bash
npm ci
npm run dev
```

开发和构建预览默认自动选择可用端口（`server.port: 0`），避免依赖可能被 Windows 预留或被其他服务占用的 4321。打开终端 `Local` 一行显示的实际地址，例如 `http://127.0.0.1:54321/`；每次重新启动的端口可能不同。

普通终端使用 Ctrl+C 停止；如果 Astro 报告已作为后台服务启动，可用 `npx astro dev status` 查看地址、`npx astro dev stop` 停止。预览服务对应使用 `npx astro preview status` / `npx astro preview stop`。

```bash
npm run check       # 准备游戏产物，检查 Astro、TypeScript 和内容 schema
npm test            # Markdown / 内容 / 配置工具测试 + 2D、3D 游戏测试
npm run build       # 构建游戏、博客，并验证最终静态文件与链接
npm run build:release # 发布构建；额外要求配置有效的生产域名
npm run preview     # 预览 dist，自动选择可用端口，以终端 Local 地址为准
```

开发和构建预览可以同时运行，分别使用各自显示的地址。需要指定端口时，可使用 `npm run dev -- --port 54321` 或 `npm run preview -- --port 54322`；指定端口需自行确保未被 Windows 预留。省略 `--port` 即恢复自动选择。

`SITE_URL` 用于构建 canonical、RSS 和 sitemap 等绝对链接，不决定本地服务的监听端口；未配置时，其中的 `http://localhost:4321` 只是本地构建的占位 origin。

需要额外运行真实浏览器回归时：

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

测试通过 Astro 公开 API，在两个独立 Node worker 中启动开发服务与生产预览服务，取得实际可用端口，并在结束时调用 API 关闭服务、回收 worker，避免 Windows 进程树清理卡住。开发服务覆盖桌面、平板、手机视口、原始内容复制、主题、图片与康威跳棋；独立的 production 项目检查已有 `dist/`，因此运行浏览器测试前必须先构建。CI 在 Linux 安装 Chromium 的系统依赖。

## 主要目录

```text
assets/                         原有头像、动画头像、作品封面（保留）
apps/conway-soldiers/            2D 康威跳棋源码，可独立运行
apps/conway-soldiers-3d/         3D 康威跳棋源码，可独立运行
config/games.mjs                静态游戏注册表：源码、入口、资源目录
config/site.mjs                 SITE_URL 校验与本地域名回退
config/redirects.mjs            两个康威跳棋版本的短链与兼容入口映射
config/registration.mjs         ICP / 公安备案展示配置
src/config.ts                  名称、简介占位、头像、社交链接、项目资料
src/content.config.ts          文章 frontmatter schema
src/content/posts/             Markdown 文章与 draft 回归 fixture
src/pages/                     页面、RSS、robots 和标签静态路由
src/layouts/GameLayout.astro    游戏 HTML 集成、站点元信息与返回入口
src/plugins/markdown.mjs        数学源保留、代码工具条、表格与标题锚点
src/styles/                    全站与正文样式
scripts/                       H5 集成、构建检查、OSS 上传与上线验收
tests/                         内容、Markdown、部署工具与浏览器回归
.github/workflows/ci.yml        GitHub Actions 验证、artifact 保存与 OSS/CDN 发布
docs/                          实现、写作和部署指南
dist/                          最终上传到 OSS 的静态文件（生成，不提交）
```

`apps/` 保存独立交互作品的源码；以后新增同类作品也放在这里。`public/play/`、`.generated/`、`apps/*/dist/` 与根 `dist/` 都是构建产物，不要直接编辑或提交。目录职责和新增作品流程见[交互作品集成说明](docs/INTERACTIVE_APPS.md)。

两个康威跳棋采用“博客统一维护、独立仓库单向发布”的方式：在本仓库的 `apps/` 中修改和提交代码，再用 `git subtree` 分别同步到 `Nanoka42/conway-soldiers` 与 `Nanoka42/conway-soldiers-3d`。目前同步由维护者手动执行；博客 CI 不会自动推送这两个仓库。首次建仓、发布、日常更新与排错，请按[康威跳棋发布与维护手册](docs/CONWAY_APPS_PUBLISHING_GUIDE.md)操作。

## 内容与作品

- 文章位于 `src/content/posts/*.md`；文件名生成 `/posts/<文件名>/`。
- 初始文章 `hello-world.md` 是可编辑的建站内容。
- `markdown-regression.md` 是开发草稿，生产路由、首页、列表、标签、RSS 和 sitemap 不包含它。
- GFM、表格、脚注、数学、Shiki 高亮和代码复制都在普通 Markdown 中可用。
- 独立公式按钮及行内公式旁的 ⧉ 可复制原始 TeX；剪贴板权限不足时显示可选文本。
- 2D 康威跳棋的主入口是 `/projects/conway-soldiers/`；3D 版是 `/projects/conway-soldiers-3d/`，支持保持视角与选子的 XZ / XY 工作面切换，以及键鼠和触屏六向跳跃。两个入口都直接显示完整棋盘，游戏内部说明窗口提供另一个版本的链接。
- 作品封面位于 `assets/`；游戏自己的脚本、样式、图标和音效由构建脚本复制到 `public/play/<slug>/`，使用同源静态资源，无需运行时 CDN、服务端 API 或额外 npm 运行依赖。
- `config/redirects.mjs` 保留 2D 的 25 个短链与旧 `/play/conway-soldiers/` 跳转；3D 正则 `^conways?[_-]?(?:soldier|checker)s?[_-]?3d$` 对应 72 个短链，加上 `/coso3d` 共 73 个，并提供 `/play/conway-soldiers-3d/` 兼容跳转。静态页自动跳转并保留 query/hash；可选的 CDN HTTP 重定向配置见[部署指南](docs/DEPLOYMENT_GUIDE.md#康威跳棋短链)。

独立开发或验证游戏（两个子项目都不需要另行安装 npm 依赖）：

```bash
npm --prefix apps/conway-soldiers run dev
npm --prefix apps/conway-soldiers test
npm --prefix apps/conway-soldiers run build

npm --prefix apps/conway-soldiers-3d run dev
npm --prefix apps/conway-soldiers-3d test
npm --prefix apps/conway-soldiers-3d run build
```

## CI 与上线

`push` 到 `main`、Pull Request 和手动触发都会运行 CI：`npm ci → check → test → build:release → browser tests`，成功后保存可部署的 `dist-<commit SHA>` artifact。部署 job 下载同次 artifact，先上传资源、后上传 HTML，并通过 GET 验收 OSS 源站和 HTTPS CDN。

Repository Variable `AUTO_DEPLOY=true` 时，`main` 的 push 会在检查通过后自动发布；设置为 `false` 可暂停自动发布，CI 仍照常运行。手动运行请选择 `main`：默认 `dry_run=true` 只预演上传，取消后执行真实发布及两端验收。Pull Request 不部署。

生产域名为 **`nanoka.tv`**，通过 `SITE_URL=https://nanoka.tv` 集中配置。未设置时，普通 `npm run build` 仍可用于本地检查，并输出禁止索引标记。本地正式构建可从 `.env.example` 创建 `.env`；CI 使用 Repository Variable `SITE_URL` 或工作流中的生产默认值。`npm run build:release` 会拒绝缺失或无效的生产域名配置。

`config/registration.mjs` 保留完整网站备案号 **粤ICP备2026138999号-1**；按广东规则，页脚展示主体备案号 **粤ICP备2026138999号**，并链接工信部备案系统。公安备案尚未完成，获批后再填入真实的备案号、查询链接和图标；办理步骤与上线检查见部署指南。

发布链路：GitHub → GitHub Actions → 阿里云 OSS → CDN → 读者；AliDNS 将 `nanoka.tv` 指向 CDN。部署采用 GitHub OIDC / RAM Role / STS 临时凭证，不存储长期 AccessKey。2026-09-17 已完成源站与 CDN 发布验收。

- [实现报告](docs/IMPLEMENTATION_REPORT.md)
- [内容更新指南](docs/CONTENT_GUIDE.md)
- [交互作品集成说明](docs/INTERACTIVE_APPS.md)
- [康威跳棋发布与维护手册](docs/CONWAY_APPS_PUBLISHING_GUIDE.md)
- [部署运维清单](docs/DEPLOYMENT_CHECKLIST.md)
- [阿里云部署指南](docs/DEPLOYMENT_GUIDE.md)
- [发布前检查记录](docs/PRELAUNCH_REVIEW.md)
