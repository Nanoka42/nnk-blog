# 微羽笔记本 · 真理院七叶的笔记与作品

一个基于 Astro、TypeScript 和 Markdown 的个人博客。纯静态生成，最终只需部署 `dist/`，无需 Node.js 服务、数据库或服务器渲染。

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
npm test            # Markdown / 内容 / 配置工具测试 + 原游戏测试
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
conway_checker_game/            原 H5 项目，继续支持独立运行
config/site.mjs                 SITE_URL 校验与本地域名回退
config/redirects.mjs            康威跳棋主入口、短链与旧入口映射
config/registration.mjs         ICP / 公安备案展示配置
src/config.ts                  名称、简介占位、头像、社交链接、项目资料
src/content.config.ts          文章 frontmatter schema
src/content/posts/             Markdown 文章与 draft 回归 fixture
src/pages/                     页面、RSS、robots 和标签静态路由
src/plugins/markdown.mjs        数学源保留、代码工具条、表格与标题锚点
src/styles/                    全站与正文样式
scripts/                       H5 集成与构建产物检查
tests/                         内容、Markdown、浏览器回归
.github/workflows/ci.yml        GitHub Actions 验证与 artifact 保存
docs/                          实现、写作和部署指南
dist/                          最终上传到 OSS 的静态文件（生成，不提交）
```

`public/play/` 与 `.generated/` 由脚本自动生成，不要直接编辑。原 H5 的 `dist/` 也会重新生成。

## 内容与作品

- 文章位于 `src/content/posts/*.md`；文件名生成 `/posts/<文件名>/`。
- 初始文章 `hello-world.md` 是可编辑的建站内容。
- `markdown-regression.md` 是开发草稿，生产路由、首页、列表、标签、RSS 和 sitemap 不包含它。
- GFM、表格、脚注、数学、Shiki 高亮和代码复制都在普通 Markdown 中可用。
- 独立公式按钮及行内公式旁的 ⧉ 可复制原始 TeX；剪贴板权限不足时显示可选文本。
- 康威跳棋的主入口是 `/projects/conway-soldiers/`，直接显示完整 H5 棋盘，不使用 iframe。文章区不再保留 `conway-notes`，作品入口也不再链接作品笔记。
- 游戏封面位于 `assets/conway_checker_cover.png`；图标、音效和脚本仍由构建脚本生成到 `public/play/conway-soldiers/`，资源目录与页面主入口独立。
- `config/redirects.mjs` 覆盖正则 `^conways?[_-]?(?:soldier|checker)s?$` 的全部 24 个短链，加上 `/coso`，共 25 个短链；旧 `/play/conway-soldiers/` 也跳转到主入口。静态跳转页与 CDN HTTP 重定向的配置见部署指南。

独立运行原游戏：

```bash
npm --prefix conway_checker_game run dev
npm --prefix conway_checker_game test
npm --prefix conway_checker_game run build
```

## CI 与上线

`push` 到 `main`、Pull Request 和手动触发都会运行 CI：`npm ci → check → test → build:release → browser tests`，成功后保存可部署的 `dist-<commit SHA>` artifact。当前没有启用阿里云上传步骤。

最终生产域名为 **`nanoka.tv`**，通过 `SITE_URL=https://nanoka.tv` 集中配置。未设置时，普通 `npm run build` 仍可用于本地检查，并输出禁止索引标记。上线前从 `.env.example` 创建 `.env`，或在 GitHub Repository Variables 设置 `SITE_URL`，再运行 `npm run build:release`；发布构建会拒绝缺失或无效的生产域名配置。

`config/registration.mjs` 保留完整网站备案号 **粤ICP备2026138999号-1**；按广东规则，页脚展示主体备案号 **粤ICP备2026138999号**，并链接工信部备案系统。公安备案尚未完成，获批后再填入真实的备案号、查询链接和图标；办理步骤与上线检查见部署指南。

规划链路：GitHub → GitHub Actions → 阿里云 OSS → CDN → AliDNS → 自定义域名。部署采用 GitHub OIDC / RAM Role / STS 临时凭证，不存储长期 AccessKey。

- [实现报告](docs/IMPLEMENTATION_REPORT.md)
- [内容更新指南](docs/CONTENT_GUIDE.md)
- [阿里云部署指南](docs/DEPLOYMENT_GUIDE.md)
- [发布前检查记录](docs/PRELAUNCH_REVIEW.md)
