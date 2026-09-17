# 交互作品的目录与集成方式

博客继续使用 Astro 纯静态构建。独立交互作品统一放到 `apps/`，保留各自的开发、测试和构建入口；博客负责作品列表、正式路由、站点元信息、备案展示与发布。

## 源码、页面与资源

| 职责 | 2D 康威跳棋 | 3D 康威跳棋 |
| --- | --- | --- |
| 源码目录 | `apps/conway-soldiers/` | `apps/conway-soldiers-3d/` |
| 正式页面 | `/projects/conway-soldiers/` | `/projects/conway-soldiers-3d/` |
| 游戏静态资源 | `/play/conway-soldiers/` | `/play/conway-soldiers-3d/` |
| 短链示例 | `/coso` | `/coso3d` |

源码目录按作品的稳定 slug 命名，和线上页面及资源目录保持一致。博客封面统一放到 `assets/`；游戏运行时需要的文件留在各自 `apps/<slug>/` 中。两个游戏没有 npm 运行依赖：原生 ES Modules、样式、Canvas 绘制与本地 WAV 音效均随站点发布。浏览器加载游戏时不需要第三方素材 CDN 或服务端 API。

构建路径为：

```text
apps/<slug>/                   编辑、提交的游戏源码
  └─ dist/                     子项目 build 产物
       ├─ index.html → .generated/<slug>.html
       └─ 其余文件 → public/play/<slug>/

src/pages/projects/<slug>.astro
  └─ src/layouts/GameLayout.astro
       └─ 读取 .generated/<slug>.html，整合站点信息和同源资源地址

根 npm run build → dist/        唯一需要发布的完整站点产物
```

`config/games.mjs` 是集成注册表；`scripts/prepare-games.mjs` 按注册表构建和复制游戏。`GameLayout.astro` 复用 HTML 集成逻辑，不使用 iframe，也不把游戏改成依赖博客客户端框架的组件。实际路由仍由 `src/pages/projects/` 中的小型 Astro 页面显式声明。

`public/play/`、`.generated/`、`apps/*/dist/` 和根 `dist/` 是可重建的生成目录，均不作为源码编辑或提交。准备脚本不应复制测试、README、开发服务或整个子项目到线上。发布时只上传根 `dist/`，不需要分别部署子项目。

## 日常开发

在根目录执行 `npm ci` 后，可使用 `npm run dev` 预览集成后的博客；它启动前会准备两个游戏。根 `npm run check` 和 `npm run build` 也会准备游戏，根 `npm test` 同时运行博客测试，并通过 `scripts/test-games.mjs` 按注册表运行游戏测试。

频繁修改游戏时单独启动其开发服务：

```bash
npm --prefix apps/conway-soldiers run dev
npm --prefix apps/conway-soldiers-3d run dev
```

根开发服务不会自动重新构建 `apps/` 中的改动。验证独立项目后，重新启动根 `npm run dev`，或执行根 `npm run build` 并预览新的 `dist/`。游戏内部互相引用的是正式博客路由：独立运行时链接线上站点，集成时改写为当前站点内的路径，应在博客预览中检查跨版本导航。

## 添加另一个静态交互作品

1. 创建 `apps/<slug>/`，提供 `index.html`、运行时资源和 `scripts/build.mjs`，并用 `npm run build` 调用它；构建应把可发布文件写入该项目的 `dist/`，清除过期产物，保持以 `./` 开头的相对 HTML 资源引用。集成准备脚本使用 Node 直接执行这个构建文件。
2. 在 `config/games.mjs` 中注册 `slug` 和源码目录 `source`；正式入口和资源前缀会按 slug 自动派生。准备脚本会读取注册表，无需为每个游戏复制整套集成脚本。
3. 在 `assets/` 添加封面，在 `src/config.ts` 的 `projects` 中添加真实的作品标题、说明、标签、封面和正式 `playUrl`。
4. 参照现有游戏页面，创建 `src/pages/projects/<slug>.astro` 并使用 `GameLayout.astro`。若新作品的 DOM 或页面布局与现有游戏不同，应为它适配布局，避免依赖现有游戏特有的元素。
5. 在 `config/redirects.mjs` 添加需要的短链与兼容入口；把子项目测试放到 `tests/*.test.js`，根 `scripts/test-games.mjs` 会按注册表使用 Node test runner 执行。同步扩展静态验证、游戏交互浏览器测试和部署验收资源清单。静态短链自动生成；CDN HTTP 重定向需要另行配置，见[部署指南](DEPLOYMENT_GUIDE.md#康威跳棋短链)。
6. 运行 `npm run check`、`npm test`、`npm run build` 和 `npm run test:browser`；发布前再用生产 `SITE_URL` 执行 `npm run build:release`。新增运行依赖时，应明确它是否仅用于构建，以及浏览器是否仍只请求同源资源。

`apps/` 是源码整理方式，并不要求使用 npm workspaces。当前两个子项目无需安装依赖，也无需引入 monorepo 管理工具；以后确有跨项目共享包或依赖管理需求时再扩展。

## 路由与部署边界

2D 原有 26 个跳转保持有效。3D 正则 `^conways?[_-]?(?:soldier|checker)s?[_-]?3d$` 共有 72 个有限的小写拼写，加上 `/coso3d` 为 73 个短链；另有 `/play/conway-soldiers-3d/` 兼容入口。跳转只匹配这些入口，不覆盖资源目录下的 JS、CSS 或音效。

静态跳转页用 `location.replace` 保留查询参数与片段标识符，禁用 JavaScript 时提供 `meta refresh` 与手动链接。静态托管下，这通常是 HTTP 200 后的浏览器跳转；如需 HTTP 302，可按部署指南添加 CDN 规则。无尾斜杠路径依赖现有 OSS 目录首页与 Redirect 配置。

两个游戏的资源使用固定文件名，沿用 60 秒短缓存。更新游戏时应同时考虑 `/projects/<slug>/` 主页面和 `/play/<slug>/` 资源目录；只刷新主页面不足以更新缓存中的脚本。源码迁移不改变现有 2D 的线上 URL，也不需要把 `apps/` 上传到 OSS。
