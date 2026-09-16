# 内容更新指南

## 1. 修改个人信息

编辑 `src/config.ts` 的 `profile`：

- `name`、`englishName`、`title`：名称与站点标题。
- `bio`、`note`、`description`：简介、短句与站点描述。当前简介是可编辑占位，没有学校、职位或研究成果等虚构履历。
- `github`、`bilibili`：社交链接。
- `avatar`：文件顶部 import 的头像。

原头像为 `assets/nanoka_avatar_512.jpg`。目前使用静态头像，原 GIF 保留未改。页面中的 `Image` 组件会生成 WebP、尺寸和响应式图片，减少体积与布局偏移。

首页大标题位于 `src/pages/index.astro`；关于页补充文字位于 `src/pages/about.astro`；颜色在 `src/styles/global.css` 的 CSS 变量中统一修改。

## 2. 新建文章

创建 `src/content/posts/my-post.md`：

```yaml
---
title: "我的第一篇学习笔记"
description: "用一两句话说明这篇文章解决了什么问题。"
pubDate: 2026-09-09
updatedDate: 2026-09-10
tags:
  - Music AI
  - 学习笔记
draft: false
# 可选封面：相对于当前 Markdown 文件的本地图片路径
# cover: "./images/my-cover.png"
# coverAlt: "具体说明封面内容"
---
```

然后直接写 Markdown 正文，不用 JSX。文件名 `my-post.md` 生成 `/posts/my-post/`。建议使用小写英文、数字和连字符，发布后尽量不要改名，以保持 URL 稳定。子目录也支持，例如 `src/content/posts/music/my-post.md` 对应 `/posts/music/my-post/`。

`title`、`description`、`pubDate` 必填。`tags` 默认空数组，`draft` 默认 false；`updatedDate` 不能早于 `pubDate`。使用封面时 `coverAlt` 必填。Schema 不通过会使检查或构建失败，避免错误文章被发布。

封面使用 Astro `image()` schema，因此推荐上面这种可导入的本地相对路径，**不要在 frontmatter 的 `cover` 中填写 public 根路径或远程地址**。正文插图不受此限制，见下文。

列表按发布日期倒序排列，修改 `updatedDate` 不会改变该排序。相同发布日期按文件 ID 排序。日期统一按 UTC 日历格式化，避免 CI 与本机时区差异。

## 3. Markdown 写法

文章标题由 frontmatter 自动显示，正文通常从 `##` 开始。H1–H6 均可渲染，但普通文章不建议再加一个 H1。有至少 3 个 H2/H3 时，桌面显示侧栏目录，手机显示可展开目录。标题旁 `#` 是可访问的段落链接。

### 数学

```markdown
Inline math: $E=mc^2$。

Display math:

$$
\mathbf{y} = \mathbf{W}\mathbf{x}
$$
```

多行公式：

```markdown
$$
\begin{aligned}
a &= b+c \\
d &= e+f
\end{aligned}
$$
```

独立公式右上角有「复制公式」；行内公式右侧有 ⧉。两者都支持键盘 Tab / Enter、鼠标和触摸。复制的是 Markdown AST 中的原始 TeX，不带 `$` 分隔符；不会从公式 HTML 反推源代码。

复制需要浏览器允许 Clipboard API（生产站必须配置 HTTPS）。如果浏览器拒绝，站点会显示带原始文本的对话框，可按 Ctrl / ⌘ + C 或手机长按复制。Windows 系统剪贴板可能将行尾转换为 CRLF，表达式及代码内容保持一致。

KaTeX 在构建时渲染。无效或不支持的命令会使构建失败，请按报错修正；它支持常见数学 TeX，不能运行完整 LaTeX 文档、任意宏包或 TeX 文件 I/O。

### 表格

```markdown
| Model | Accuracy |
| --- | ---: |
| A | 91.2% |
| B | 94.8% |
```

`---:` 表示右对齐；`:---:` 表示居中。宽表格在独立容器中横向滚动，可以用触摸拖动或聚焦后用键盘操作，不会撑宽正文。

### 代码

````markdown
```python
import torch

x = torch.randn(4, 128)
print(x.shape)
```
````

支持 `python`、`javascript`、`typescript`、`bash`、`json`、`yaml`、`html`、`css`、`c`、`cpp` 等常见 Shiki 语言。单行 fenced code 也有复制按钮。未知语言会降级为纯文本；没有语言标记也可以复制。

行内代码写成 `` `npm run build` ``。宽代码行保留原有换行，在代码块中横向滚动。复制按钮不会复制语言标签或行号。

### 图片

推荐将文章图片放在 `src/content/posts/images/`，引用时相对于文章文件：

```markdown
![这张图具体展示了什么](./images/my-diagram.png)
```

现有作品素材位于仓库根目录的 `assets/`。对于直接位于 `src/content/posts/` 的文章，也可以使用以下相对路径引用：

```markdown
![绿色棋子在棋盘上跳跃](../../../assets/conway_checker_cover.png)
```

Astro 会处理这些本地图片并生成 width/height。保留有意义的 alt 文本。

对于必须原样发布的文件，可以放到 `public/images/`，正文使用 `/images/文件名.png`；这种图片不会自动优化，建议用 `<img src="/images/文件名.png" alt="说明" width="960" height="540" loading="lazy">` 明确尺寸。远程图片不保证可推断尺寸或长期可用，优先下载你有权使用的图片并保存到项目。

### 其它常用语法

```markdown
**加粗**、*强调*、~~删除线~~、[链接文字](https://github.com/nanoka42)。

> 引用内容。

- 无序列表
- 第二项

1. 有序列表
2. 第二项

- [x] 已完成
- [ ] 待完成

脚注引用。[^note]

[^note]: 脚注内容。

---
```

## 4. 草稿与本地预览

设置 `draft: true` 后：

- `npm run dev` 可以预览，并在首页、列表中标记「草稿」。
- `npm run build` 不生成其详情页，也不会把它放进生产首页、列表、标签、RSS 或 sitemap。
- draft 的 schema 和 Markdown 仍需有效，因为内容同步和回归检查也会读取它。

首次安装使用 `npm ci`；修改依赖才需要 `npm install` 更新 lockfile。日常操作：

```bash
npm run dev
```

打开终端 `Local` 一行显示的地址，并在后面添加 `posts/my-post/`，例如 `http://127.0.0.1:54321/posts/my-post/`。端口会自动选择，以本次启动输出为准；保存文章后自动更新。

发布前建议：

```bash
npm run check
npm test
npm run build
npm run test:browser
npm run preview
```

开发与构建预览都自动选择可用端口，可以同时运行；分别访问各自终端显示的地址。需要指定端口时可用 `npm run preview -- --port 54322`，但指定端口需自行确保未被 Windows 预留。

首次运行浏览器测试前先执行 `npx playwright install chromium`。测试包含使用现有 `dist/` 的生产预览项目，修改代码或内容后须重新运行 `npm run build`，再运行 `npm run test:browser`。

## 5. 更新与发布

更新已有文章时修改正文，并填写新的 `updatedDate`，保留原 `pubDate`。

```text
编辑 Markdown / 素材
→ 本地检查、测试与构建
→ git add
→ git commit
→ git push
→ GitHub Actions 检查、构建并保存 dist artifact
→（未来启用的部署 job）上传 OSS → CDN 更新
```

当前 Actions **只验证与保存产物，不会上传阿里云**。Git 初始化和远程仓库创建请按部署指南完成；本次没有创建远程仓库或推送。

正式发布使用 `SITE_URL=https://nanoka.tv`，并运行 `npm run build:release`。普通 `npm run build` 支持未配置域名的本地构建；这种构建使用 localhost 绝对链接并禁止索引，不能直接用于上线。

更新标签后自动生成 `/tags/<tag>/`，例如 `Music AI` → `/tags/music-ai/`。中文标签也支持。请统一大小写和拼写；规范化后的同名冲突会使构建报错。没有单独的标签配置文件。

## 6. 添加或更新作品

1. 把封面放到 `assets/`，在 `src/config.ts` import。
2. 给 `projects` 数组添加项目对象：`slug`、`title`、`englishTitle`、`description`、`tags`、`cover`、`coverAlt`、`playUrl`。
3. 创建 `src/pages/projects/<slug>.astro` 作为作品主入口，根据作品需要直接展示交互内容或介绍。
4. 如果是另一个静态子项目，扩展构建准备脚本，为其资源安排稳定目录。页面 URL 不必与资源目录相同；不要把运行时服务放进静态博客。

首页与作品列表自动使用 `projects` 数组。新增作品请填写真实内容，不保留参考作品的介绍。

康威跳棋的主入口为 `/projects/conway-soldiers/`，直接显示棋盘。`conway-notes` 文章已经移除，作品页面不再提供「阅读作品笔记」链接。封面保存在 `assets/conway_checker_cover.png`，不依赖文章目录。

康威跳棋的原始文件仍在 `conway_checker_game/`。修改它的源码后，重新运行根 `npm run dev` 或 `npm run build`，即可重新集成。根开发服务不监听游戏源目录以重建游戏；需要频繁修改游戏时，优先用子项目自己的 `npm run dev`。

页面使用的游戏资源仍生成到 `public/play/conway-soldiers/`。旧 `/play/conway-soldiers/` 页面已成为兼容跳转入口；`config/redirects.mjs` 同时集中定义 25 个短链。调整这些路由时应同步部署指南中的 CDN 规则，并重新运行构建与浏览器检查。

不要修改 `public/play/`、`.generated/`、任何 `dist/` 中的文件，下一次准备/构建会覆盖它们。游戏信息卡片与原项目 README 的制作 / 图标美术署名已统一为「真理院七叶」。

网站备案信息统一编辑 `config/registration.mjs`。保存的完整网站备案号为 `粤ICP备2026138999号-1`；按广东规则，页脚显示主体号 `粤ICP备2026138999号`。公安备案获批前保持相应配置为空；获批后按官方信息填入备案号、查询链接和图标，具体要求见部署指南。

## 7. 回归 fixture

`src/content/posts/markdown-regression.md` 是固定的开发测试页，请保留 `draft: true`。用它检查宽表格、长代码、宽公式、GFM、H1–H4、脚注、图片与复制功能。

```bash
npx playwright install chromium
npm run build
npm run test:browser
```

测试报告与截图生成于 `test-results/`，不提交 Git。升级 Astro、KaTeX、remark 或 Shiki 后，务必运行内容测试、浏览器测试和生产构建。

目前未引入 MDX。普通文章完全不需要 JSX；只有确有文章内组件需求时再加入 `@astrojs/mdx` 并扩展 collection loader。
