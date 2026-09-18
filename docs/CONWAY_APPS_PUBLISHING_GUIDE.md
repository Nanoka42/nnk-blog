# 康威跳棋独立仓库发布与维护手册（方案 A）

更新：2026-09-18。适用于 Windows、Git Bash，以及当前 `Nanoka42/nnk-blog` 仓库。

**日常只在博客仓库修改代码。先提交、推送博客并等待检查通过，再将两个 app 分别同步到独立仓库。**

本手册采用手动 `git subtree` 发布。仓库已经准备好相关说明和贡献入口，**尚未接入跨仓自动同步**；创建 GitHub 仓库、首次推送由维护者执行。旧目录的迁移前历史不作为保留要求，标准 subtree 导出可能带上少量已有提交。

## 阅读路线

- 第一次发布：按第 2～6 节依次操作。
- 发布过之后：使用第 7 节的日常流程。
- 命令报错：先停在当前步骤，按第 10 节排查。
- 版本发布、回滚、以后自动化：见第 8、9、11 节。

文中的命令，除非单独标注，**全部在 Git Bash 中执行**。每段命令都应逐条运行、检查结果；不要在前一步失败后继续粘贴后面的命令。

## 1. 先了解你在维护什么

### 1.1 三个仓库的分工

| 项目 | 维护位置 / 地址 | 作用 |
| --- | --- | --- |
| 博客主仓库 | [Nanoka42/nnk-blog](https://github.com/Nanoka42/nnk-blog) | 唯一日常开发入口；构建并部署博客及游戏页面 |
| 二维游戏源码 | 博客的 `apps/conway-soldiers/` | 2D 代码、素材、测试和项目文档 |
| 三维游戏源码 | 博客的 `apps/conway-soldiers-3d/` | 3D 代码、素材、测试和项目文档 |
| 二维独立仓库 | [Nanoka42/conway-soldiers](https://github.com/Nanoka42/conway-soldiers) | 导出后的独立源码；首次建仓前链接可能是 404 |
| 三维独立仓库 | [Nanoka42/conway-soldiers-3d](https://github.com/Nanoka42/conway-soldiers-3d) | 同上，内容对应 3D |
| 在线游戏 | [2D](https://nanoka.tv/projects/conway-soldiers/) / [3D](https://nanoka.tv/projects/conway-soldiers-3d/) | 由博客部署，沿用现有域名和路径 |

```text
在博客工作区修改 apps/
          │
    commit → push 博客 main
          │
     博客 CI 验证通过
          │
          ├─ 依现有部署设置 → nanoka.tv
          │
          └─ 手动执行 subtree push
                    ├─ conway-soldiers main
                    └─ conway-soldiers-3d main
```

“独立源码仓库发布”与“网站上线”是两个结果。GitHub 仓库里出现源文件，不代表你刚部署了网站；博客 CI 成功，也不代表独立仓库已经同步。

### 1.2 本手册里会遇到的 Git 术语

| 名称 | 在这里的意思 |
| --- | --- |
| 工作区 | 你正在编辑的文件 |
| 暂存（add） | 选择哪些改动放进下一次提交 |
| 提交（commit） | 在本机记录一个版本；不会自动上传 |
| 推送（push） | 把本机已有提交上传到远端 |
| main | 当前约定使用的主分支 |
| origin | 博客本地仓库给其 GitHub 远端起的名字；保留它指向 nnk-blog |
| HEAD | 你当前检出的提交 |
| origin/main | 上次 fetch / pull 得到的远端 main 状态，不是永远实时的值 |
| SHA | 一次提交的标识；常看到前 7～8 位，也可以显示完整值 |
| subtree split | 从博客某个子目录生成以该目录内容为根的独立历史 |
| subtree push | 先做 split，再把结果推送到指定仓库的分支 |

两个 app 在博客中继续是普通目录。**不要在它们里面 `git init`，不要把博客的 origin 改成 app 仓库，也不需要设置 submodule。**

## 2. 一次性准备：终端、工具和路径

### 2.1 使用 Git Bash

Windows 开始菜单搜索 **Git Bash** 并打开，进入博客根目录：

```bash
cd "/j/NANOKA/N Blog/nnk_blog"
pwd
git rev-parse --show-toplevel
git branch --show-current
git remote -v
```

检查：

- 当前目录和仓库根目录都指向 `J:/NANOKA/N Blog/nnk_blog`；路径中的空格要求保留引号。
- 当前分支是 `main`。若你在另一个开发分支，先用自己的正常流程合并到 main，再发布。
- origin 指向 `Nanoka42/nnk-blog.git`，不是某个 app 仓库。

当前电脑的 origin 是：

```text
git@github-nanoka:Nanoka42/nnk-blog.git
```

`github-nanoka` 是你本机已有的 SSH 主机别名，用来选择相应 GitHub 账号/密钥，不是 GitHub 的公共域名。后面的维护者推送命令沿用它；别人克隆时使用普通 HTTPS 地址。

### 2.2 检查工具

```bash
git --version
node --version
npm --version
git subtree -h
```

博客使用 Node.js 24 或更新版本；建议开发和 CI 都沿用 Node 24。两个 app 自身没有第三方 npm 依赖。

正常的 `git subtree -h` 会显示 `add / split / push` 等帮助。帮助命令可能以非零状态退出，只要正常显示 usage，不应单凭退出码判断安装损坏。

本机此前在工具的 PowerShell 环境直接调用 subtree 出现过环境检查错误，通过 Git Bash 则能正常显示帮助。因此本手册统一使用 Git Bash。PowerShell 的 `$env:变量` 语法与 Bash 不同，不要混用。

### 2.3 如有需要，确认 SSH 使用了正确账号

如果你一直能在这台电脑推送博客，通常可以直接沿用配置。需要诊断时：

```bash
ssh -T git@github-nanoka
```

预期提示你以 **Nanoka42** 成功认证，并说明 GitHub 不提供 shell。这里“没有 shell”是正常结果，不是推送失败。SSH 测试本身也可能返回非零状态，应看认证提示。

若首次连接要求确认主机指纹，按 [GitHub 官方 SSH 检查说明](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/testing-your-ssh-connection)核对，不要把身份不明的主机提示当作普通密码输入框。

## 3. 先把本次准备工作提交到博客

### 3.1 本次准备了哪些文件

- 根 `README.md`：增加手册入口和维护关系。
- `docs/INTERACTIVE_APPS.md`：说明源码独立发布与博客集成的关系。
- `docs/CONWAY_APPS_PUBLISHING_GUIDE.md`：本手册。
- 两个 app 的 `README.md`：修正拆出后会失效的链接，说明维护入口。
- 两个 app 的 `CONTRIBUTING.md`：引导贡献回到博客对应路径。

没有修改游戏逻辑、构建脚本、部署工作流或 Git remote，也没有新建嵌套仓库。代码许可证没有在本次替你选择；已有素材署名继续保留。

### 3.2 查看、暂存、提交

你可以继续用自己熟悉的 Git 图形界面完成这一段。命令行等价流程如下，仍在**博客根目录**执行：

```bash
git status --short
git diff --stat
git diff
```

`git diff` 若进入翻页界面，按空格翻页，按 `q` 退出。新建且尚未跟踪的文件会在 status 中显示 `??`，但不会出现在普通 git diff 中；可以直接打开阅读。

确认是这次想提交的内容后：

```bash
git add README.md docs/INTERACTIVE_APPS.md docs/CONWAY_APPS_PUBLISHING_GUIDE.md apps/conway-soldiers/README.md apps/conway-soldiers/CONTRIBUTING.md apps/conway-soldiers-3d/README.md apps/conway-soldiers-3d/CONTRIBUTING.md
git diff --cached --stat
git diff --cached
git commit -m "Document standalone Conway app publishing"
git push origin main
```

`--cached` 查看的是“已经放入下一次提交”的内容。上面的明确文件列表只暂存这次文档；如果你此前已经暂存过其它文件，仍要从 `git diff --cached` 检查它们是否也会被提交。

如果出现 `Author identity unknown`，先按你已有 GitHub 身份配置 Git 的提交姓名和邮箱；这里不要随意填写一个新身份。若 push 被拒绝，转第 10 节，先别继续发布 app。

### 3.3 在 GitHub 确认博客检查结果

打开 [博客 Actions](https://github.com/Nanoka42/nnk-blog/actions)，找到这次提交触发的 **Check and build**：

1. 确认分支是 main，提交 SHA 对应刚才的提交。
2. 打开运行详情，查看 `validate` 是否成功。
3. 若你需要这次网站也上线，再检查部署 job **Deploy to Alibaba Cloud OSS** 是否成功。
4. 如果 validate 失败，先查看第一个失败步骤并修复；不要发布该版本的 app。

`AUTO_DEPLOY=true` 时，main push 会在验证后部署；未设置或为 false 时，部署可以跳过。手动 Run workflow 的 `dry_run=true` 仅预演。具体网站发布流程见[部署运维清单](DEPLOYMENT_CHECKLIST.md)。

**validate 成功足以满足本手册的源码发布前提；部署被跳过不代表源码验证失败。** 若部署失败而 validate 成功，可以独立处理网站故障，但此时不能声称网页已更新。

## 4. 在 GitHub 建立两个空仓库

登录 Nanoka42，打开 [GitHub 新建仓库](https://github.com/new)，依次创建两个仓库。

| 字段 | 二维版 | 三维版 |
| --- | --- | --- |
| Owner | Nanoka42 | Nanoka42 |
| Repository name | conway-soldiers | conway-soldiers-3d |
| Description 示例 | A standalone Conway's Soldiers puzzle game | A standalone 3D Conway's Soldiers puzzle game |
| Visibility | Public（如果准备公开） | Public（如果准备公开） |
| Template / 自动生成代码 | 不使用 | 不使用 |
| Add README | 不添加 | 不添加 |
| Add .gitignore | 不添加 | 不添加 |
| Choose a license | 先不添加 | 先不添加 |

名称若已被占用，先确认是不是你之前创建的目标仓库；不要假设可以覆盖已有内容。改变仓库名时，也要统一修改本手册、app README 和推送地址。

**仓库初始应没有提交。** README、.gitignore 等已经在 app 源目录里，第一次 subtree push 会把它们带过去。GitHub 也建议导入已有历史时不要预生成这些文件，以免引入冲突。[GitHub 创建仓库说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)。

创建完可能显示 Quick setup 页面，其中包含 `git init`、`git remote add origin` 等示例。**这里不要复制那套命令到博客工作区。** 你的博客已经有自己的仓库和 origin，下一节会直接向新仓库推送子目录。

## 5. 首次同步：在博客根目录执行两次 subtree push

### 5.1 确认来源是已经验证的博客版本

回到 Git Bash：

```bash
cd "/j/NANOKA/N Blog/nnk_blog"
git status --short
git branch --show-current
git fetch origin
git rev-list --left-right --count HEAD...origin/main
git rev-parse HEAD
```

必须满足：

- `git status --short` **没有输出**：没有未提交改动或未跟踪文件需要处理。
- 当前分支是 `main`。
- `git fetch origin` 成功：拿到了最新远端状态。
- 计数输出为 **`0 0`**（中间也可能是制表符）。
- 最后一行完整 SHA 对应你在 Actions 中确认 validate 成功的提交。

计数含义：

| 输出 | 含义 | 下一步 |
| --- | --- | --- |
| `0 0` | 本地与远端 main 一致 | 核对 CI 后继续 |
| `1 0` 或其它左侧非零、右侧为零 | 本地有提交尚未推到博客 | 先 push 博客，等该提交 CI，再 fetch 复核 |
| `0 1` 或其它右侧非零、左侧为零 | 远端比本地新 | 工作区干净时用 `git pull --ff-only origin main`，再核对新 HEAD 的 CI |
| 两侧都非零 | 本地和远端各自有新提交 | 先处理分支分叉；不要直接发布或用 force 覆盖 |

注意，subtree 发布的是**提交中的内容**。编辑器里刚改但未提交的文件，不会因为它在 app 目录中就自动发布。

### 5.2 先发布二维版

```bash
git subtree push --prefix=apps/conway-soldiers git@github-nanoka:Nanoka42/conway-soldiers.git main
```

参数含义：

- `--prefix=apps/conway-soldiers`：只导出博客中的二维目录。
- `git@github-nanoka:Nanoka42/conway-soldiers.git`：接收代码的新仓库。
- 最后的 `main`：目标仓库的分支，不是让你切换分支。

它会生成相应目录的独立提交历史，然后推送。第一次通常出现 `[new branch] ... -> main`；看见错误或 `rejected` 时，先处理错误再往下走。

### 5.3 再发布三维版

二维版成功后：

```bash
git subtree push --prefix=apps/conway-soldiers-3d git@github-nanoka:Nanoka42/conway-soldiers-3d.git main
```

执行这两步期间，不要切换博客分支、pull 新提交或创建新的提交，确保两个 app 来自你刚核对过的同一博客 HEAD。

**不要将上面两条命令替换成普通 `git push app地址 main`。** 普通 push 会把博客的 main 整个推过去，不能代替按目录拆分。

首次发布不需要 `subtree add`、`--rejoin`、`--squash` 或额外的 split 分支。后续也沿用这套固定方式，避免改变历史生成规则。[Git subtree 官方说明](https://github.com/git/git/blob/master/contrib/subtree/git-subtree.adoc)。

### 5.4 “旧历史不要了”在这里如何处理

本流程不额外迁移旧的 `conway_checker_game/` 路径历史，也不重写博客历史。标准导出可能保留当前 app 路径下的少量既有提交，这是正常结果。

不要为了只留一个“今天开始”的初始提交，先复制文件、单独 git init、做一个手工初始提交，然后再接本手册命令。那会生成另一条历史，后续标准 subtree push 可能无法快进。

## 6. 首次发布后的验收

### 6.1 查看两个 GitHub 仓库

刷新两个 app 仓库的 Code 页面，确认：

- 默认分支为 main；若不是，在仓库设置中将 main 设为默认。
- 根目录直接出现 `README.md`、`package.json`、`index.html`、`src/`、`scripts/`、`tests/` 等。
- 不应该再套一层 `apps/conway-soldiers/`，也不应该出现博客的 `astro.config.mjs` 和文章目录。
- README 的博客、另一版本和贡献说明链接能打开。
- app `dist/` 没有作为源码提交；它是构建时生成的。
- 2D 的棋谱 Markdown、icons 和 sounds 齐全；3D 的 docs 和 sounds 齐全。

独立仓库提交 SHA 与博客 SHA **通常不同**：拆分后目录和提交的父子关系变了。不要只凭两边 SHA 不同判断同步失败；第 10 节提供准确核对方法。

### 6.2 验证别人单独 clone 后能使用

在博客目录外放两个临时验证副本，避免在博客内嵌套新仓库。下面名称如果已经存在，换一个新的目录名，不要删除已有目录来腾位置。

```bash
cd "/j/NANOKA/N Blog"
git clone https://github.com/Nanoka42/conway-soldiers.git conway-soldiers-check
cd conway-soldiers-check
npm test
npm run build
npm run preview
```

浏览器打开终端打印的地址，检查棋盘可以加载、操作、播放音效。按 `Ctrl+C` 停止预览后，验证另一个：

```bash
cd "/j/NANOKA/N Blog"
git clone https://github.com/Nanoka42/conway-soldiers-3d.git conway-soldiers-3d-check
cd conway-soldiers-3d-check
npm test
npm run build
npm run preview
```

两个 app 当前都不需要 `npm install` 或 `npm ci`。不要把博客的 package-lock.json 复制进去。

这些副本只用来验收；日常修改仍回到博客工作区。使用私有仓库时，HTTPS clone 需要你自己的访问凭证，匿名访客无法克隆。

### 6.3 设置仓库展示信息

在各仓库首页的 About 编辑入口设置：

- 2D Website：`https://nanoka.tv/projects/conway-soldiers/`
- 3D Website：`https://nanoka.tv/projects/conway-soldiers-3d/`
- Topics 可选：`conways-soldiers`、`puzzle-game`、`javascript`、`canvas` 等。
- 需要时添加项目预览图。

这些仓库设置不会进入源文件，可以在各独立仓库直接修改。无需开启 GitHub Pages；在线试玩继续由博客提供。

### 6.4 首次发布完成的标准

- [ ] 博客提交已推送，validate 成功。
- [ ] 两个独立仓库都有正确的 main 和根目录内容。
- [ ] 两个独立克隆的测试、构建和预览通过。
- [ ] README / CONTRIBUTING 链接指向正确入口。
- [ ] 如本次需要网站同步上线，另行确认博客部署成功及网页行为。
- [ ] 已记住：当前没有自动同步，之后要手动重复 subtree push。

## 7. 日常维护：以后照着这一节操作

### 7.1 修改和检查

回到博客根目录，按通常流程开发。app 源码、README、CONTRIBUTING 都在博客的对应目录修改。

按改动范围选择检查：

| 改动 | 建议检查 |
| --- | --- |
| 只改 README / CONTRIBUTING / 本手册 | 核对链接、命令和 `git diff --check` |
| 修改 2D 逻辑 | `npm --prefix apps/conway-soldiers test`，并打开独立游戏预览 |
| 修改 3D 逻辑 | `npm --prefix apps/conway-soldiers-3d test`，并打开独立游戏预览 |
| 修改 HTML / 样式 / 交互 / 博客集成 | 再运行根 check、build，并检查博客集成页面；必要时运行浏览器回归 |
| 准备正式发布功能改动 | 由博客 CI 完成现有完整验证 |

根依赖尚未安装时，先在博客根目录执行 `npm ci`。常用集成检查命令：

```bash
npm run check
npm test
npm run build
```

需要浏览器回归时，在构建后执行 `npm run test:browser`；首次使用需先 `npx playwright install chromium`。

根开发服务不会自动重新构建 app。改了游戏但博客预览看不到变化时，重新启动根 `npm run dev`，或重新 build 后 preview。集成关系见[交互作品说明](INTERACTIVE_APPS.md)。

### 7.2 提交、推送博客

下面以只修改三维版为例，要求你已经位于博客的 **main**。先运行第一条命令确认输出是 `main`，再执行其余命令。

如果你是在开发分支上工作，请按自己的分支流程提交、推送，并通过 PR 或合并将变更纳入博客 main，再回到 main 按第 7.3 节同步。`git push origin main` 明确推送的是本地 main，不会把当前开发分支的提交自动合并进去。

```bash
git branch --show-current
git status --short
git diff
git add apps/conway-soldiers-3d
git diff --cached
git commit -m "Improve 3D Conway game interaction"
git push origin main
```

如果也改了其它目录，要把实际需要的文件一起暂存并检查。本例的 `git add` 只选择三维目录；不会自动包含其它改动。提交说明请根据实际内容填写。

然后按第 3.3 节检查该提交的 validate。它成功后，再继续下面步骤。

### 7.3 确认源版本，再同步

```bash
git status --short
git branch --show-current
git fetch origin
git rev-list --left-right --count HEAD...origin/main
git rev-parse HEAD
```

仍要求：干净工作区、main、`0 0`，并且当前 SHA 已验证。

```bash
git subtree push --prefix=apps/conway-soldiers git@github-nanoka:Nanoka42/conway-soldiers.git main
git subtree push --prefix=apps/conway-soldiers-3d git@github-nanoka:Nanoka42/conway-soldiers-3d.git main
```

每条单独执行并看结果。没有相关改动时出现 `Everything up-to-date` 是成功，不需要为了“看到新提交”再制造修改。

只改一个 app 时，可以只推那个；每次都推两个也可以。只写博客文章、完全没有 app 变更时，不必同步 app。

若一条成功、另一条失败，已成功的结果有效。修复错误后只重试失败项，或重新执行两条；无需撤回成功项，也无需创建额外的博客提交。

### 7.4 哪些事在哪边做

| 操作 | 正确位置 |
| --- | --- |
| 游戏源码、素材、README、贡献文档 | 博客对应 app 目录，提交后导出 |
| 本手册、博客集成、文章、网站部署 | 博客仓库 |
| 独立仓库 Description、Website、Topics | 各 app 仓库设置 |
| app Issues | 可在 app 仓库讨论；实际修复回到博客 |
| app main 的文件修改 | 通过博客导出；不直接点 GitHub 铅笔编辑 |
| PR | 默认提到博客相应 app 路径 |
| GitHub Release / app tag | 对应 app 仓库，见下一节 |

对于直接投到 app 仓库的 PR，可以保留讨论、致谢和来源链接，将变更按路径移植到博客，再运行检查、合并和导出。**不要先合并到 app main 再期待下一次导出自动合并两边。** 当前流程不是双向同步。

## 8. 可选：给 app 发布版本和 Release

第一次源码推送成功后，已经是独立仓库发布；不一定要再创建 Release。

需要记录一个值得下载或引用的稳定版本时：

1. 先完成博客提交与 app 同步，确认 app main 是你想发布的内容。
2. 打开对应 app 仓库的 Releases 页面，新建 release。
3. 创建该 app 尚未使用的新标签，例如 `v1.0.0`；目标选择该 app 的 main 或你已核对的 app commit。
4. 写清功能变化、已知问题与博客源码来源 SHA。
5. 如需附可直接托管的静态文件，在该版本的 app 独立克隆里构建，将 dist 内容打包为附件；不要把 dist 提交回 main。
6. 发布后复查 tag 指向的版本。

两个 app 的 tag 空间独立，可以各自有 `v1.0.0`。package.json 的 version、Git tag 和 GitHub Release 是三件事，不会因任意一个变化就自动同步；要改 package.json，仍先在博客 app 目录改。

不要把博客 commit SHA 直接当作 app 的目标 SHA。也不建议第一次发布就强行重设版本号：当前 2D package.json 为 1.0.0，3D 为 1.2.3，可按实际版本含义安排。

Release 操作界面以 [GitHub 官方说明](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)为准。

## 9. 发布出问题时，如何恢复一个正常版本

### 9.1 app 代码有 bug

优先在博客 app 目录修复，创建新的提交，验证后依次推送博客和 app。即使内容回到旧状态，也让 Git 历史向前增加一个“恢复”提交。

若某个提交只包含这次错误，且你明确希望撤销它的所有变更，可以在干净的博客 main 上用 `git revert` 创建反向提交：

```bash
git revert --no-edit BAD_COMMIT_SHA
```

**先把 `BAD_COMMIT_SHA` 替换成已经核对的博客提交 ID，不能原样执行。** 一个提交如果同时改了文章和两个 app，revert 会一起撤销；这种情况更适合只编辑需要恢复的 app 文件，再正常提交。合并提交的撤销有额外规则，不在这里直接套用。

若 revert 产生冲突，可以先用 `git status` 查看；不确定如何继续时，`git revert --abort` 可取消尚未完成的 revert。成功创建恢复提交后，按正常流程检查、推送博客、同步 app。[Git revert 官方说明](https://git-scm.com/docs/git-revert)。

不要用 `reset --hard` 加 force push 把三个仓库的 main 拖回过去，这会破坏当前同步历史。

### 9.2 只有网站部署失败

源码仓库和网站部署分别检查。按[部署运维清单](DEPLOYMENT_CHECKLIST.md)处理 OSS/CDN 或部署配置故障；不需要为了修复上传失败去重建 app 仓库。

### 9.3 只有独立仓库同步失败

博客提交、验证和部署可能都已经成功。修复 SSH、仓库名或权限问题后，对同一个已验证版本重试 subtree push 即可。

网络中断时，不要只凭本地报错猜测远端一定没收到。先刷新仓库或用下一节的远端检查，再决定重试；普通重复推送通常不会产生重复提交。

## 10. 常见输出、错误和检查方法

### 10.1 快速排错表

| 现象 | 常见原因 | 如何处理 |
| --- | --- | --- |
| `not a git repository` | 当前目录不在博客仓库里 | 重新 cd 到博客根目录，再检查 show-toplevel |
| `prefix ... does not exist` | 路径拼错、分支不对或项目目录尚不存在 | 核对当前 main 和目录；不因提示就对现有项目乱做 subtree add |
| `working tree has modifications` | 有未提交改动 | 查看 status，把需要的内容提交；不自动丢弃或强行覆盖 |
| `git: 'subtree' is not a git command` | 当前 Git 安装没有可用 subtree | 使用正常 Git for Windows / Git Bash 安装，核对实际使用的 git |
| `git-subtree installation is broken` | 本机调用环境或路径问题 | 先改用 Git Bash；本机此前用此方式可正常显示帮助 |
| `Could not resolve hostname github-nanoka` | 这台电脑没有该 SSH 别名 | 使用已经配置好的 SSH 地址；或按 10.2 使用 HTTPS 推送 |
| `Permission denied (publickey)` | 密钥未加载、账号不对或没有访问权 | 用 ssh -T 确认账号；核对仓库所属与已有 SSH 配置 |
| `Repository not found` | 仓库未建、名字错误或无权访问私有仓库 | 登录 GitHub 查看目标仓库，核对 owner/name |
| `non-fast-forward` / `fetch first` | 目标 main 有同步流程以外的历史，或本地过旧 | 不 force；按 10.3 检查分叉 |
| `GH006` / `GH013` 等规则拒绝 | 分支保护要求 PR 或指定检查，与导出推送冲突 | 按目标仓库用途配置同步身份的推送权限；不照搬博客全部规则 |
| `Everything up-to-date` | 这个 app 自上次同步以来没变 | 正常成功 |
| app 仓库没显示新的提交 | 改了博客其它文件，或 app 修改没 commit | 查看 status、博客提交内容和 prefix |
| 博客源码更新但网页没变 | 部署没运行/失败、缓存或本地预览没重新构建 | 分别查 Actions、线上页面和本地 build；不是重复 init app |

### 10.2 没有 github-nanoka 别名的电脑

你可以用 HTTPS 地址替换推送命令中的 SSH 地址，例如：

```bash
git subtree push --prefix=apps/conway-soldiers https://github.com/Nanoka42/conway-soldiers.git main
git subtree push --prefix=apps/conway-soldiers-3d https://github.com/Nanoka42/conway-soldiers-3d.git main
```

Git 可能通过凭证管理器引导你登录。不要把 token 写在命令 URL、README 或脚本里；GitHub 账户密码不能直接代替 Git 的 HTTPS 推送凭证。身份验证方式见 [GitHub 命令行认证说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github#authenticating-with-the-command-line)。

换一台电脑仍然 clone 博客继续维护，不需要改成日常编辑独立 app 仓库，也不要为了 app 推送覆盖博客 origin。

### 10.3 遇到非 fast-forward，先判断谁在前进

可能的原因包括：

- 首次建仓时让 GitHub 自动生成了一条 README 提交。
- 在独立 app 仓库网页上直接编辑文件或合并了 PR。
- 你在本地使用了旧的博客版本，而目标仓库已同步过更新版本。
- 曾经改过 split 参数、重写源历史，或用“复制文件 + git init”另起了一条历史。

先核对博客 main 是否最新，再在目标仓库 Commits 页面查看最近提交。不要套用普通教程里的 `git pull --allow-unrelated-histories` 或 `git push --force`：在博客根目录这样操作，容易把不同仓库的历史混进来。

若目标有真实改动，先保留并把需要的改动移植回博客；但**仅仅复制回文件，不会自动消除已经分叉的提交历史**。后续需要在备份目标分支后，单独设计历史对齐或重新建立发布分支。这超出本手册的正常流程，处理时应带上实际 Git 图和错误输出，而非直接覆盖。

若目标只是误建的空 README 仓库，也先确认没有其它代码、Issues、Releases 或设置需要保留，再决定如何重新建立空目标。不要把“重建仓库”当作每次报错的通用解法。

### 10.4 如何准确核对同步版本

在工作区干净、main 已核对的博客根目录执行：

```bash
git rev-parse HEAD
git subtree split --prefix=apps/conway-soldiers HEAD
git ls-remote git@github-nanoka:Nanoka42/conway-soldiers.git refs/heads/main
git subtree split --prefix=apps/conway-soldiers-3d HEAD
git ls-remote git@github-nanoka:Nanoka42/conway-soldiers-3d.git refs/heads/main
```

解释：

- 第一行是博客 SHA，方便记下本次来源。
- 每个 split 最后输出该 app 的完整提交 SHA。
- 对应 ls-remote 输出“远端 SHA + refs/heads/main”。
- **分别比较同一 app 的 split SHA 与远端 SHA**；相等表示该 app main 对应当前博客版本的标准拆分结果。
- ls-remote 成功但没有 main 输出，表示目标尚无 main；报认证或网络错误则先处理错误。

这里的 split 会在本地 Git 对象数据库中生成拆分对象，但没有 `-b` 或 `--rejoin`，不会替你创建分支、改写博客文件或推送远端。这不是通常日常维护的必做步骤，只在验收或排错时使用。

### 10.5 忘记同步一次，需要逐个补历史吗

不需要。在确认最新博客 main 已验证后，重新执行 subtree push，即可把这个 app 尚未发布的相关提交一起推过去。

如果工作区还有其它没提交的工作，先完成或妥善保存它，再回到本手册要求的干净 main；不要为了发布旧版本随意丢弃当前工作。

## 11. 以后想自动同步时，需要补什么

当前仓库**没有**名为 sync-apps 的自动化 job，也没有新增跨仓凭证。先按本手册完成至少一次正常发布和一次更新，再实施自动化比较容易验证结果。

推荐的后续行为：

```text
博客 main push → validate 成功
                    ├─ 现有 deploy
                    └─ 新 sync-apps：导出同一已验证 SHA 到两个仓库
```

自动化至少需要：

1. 获取完整 Git 历史，checkout 使用 `fetch-depth: 0`。
2. 用本次 validate 验证的确切 SHA 拆分，避免临时追到另一个未验证版本。
3. 配置只授权目标仓库的 GitHub App 或 fine-grained PAT；博客默认 GITHUB_TOKEN 不能直接写另一个仓库。
4. 串行同步、检查过期运行、普通快进推送；不自动 force。
5. 记录源 SHA、两个 split SHA、分别成功或失败的结果，并提供补同步入口。
6. 将源码同步开关与博客部署 `dry_run` 语义分清，避免“预演部署”意外变成真实跨仓发布。
7. 若导出 `.github/workflows/`，再核对更新工作流所需的额外凭证权限。

这些要求分别对应 [checkout 官方参数](https://github.com/actions/checkout)和 [GitHub 跨仓认证说明](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)。

独立 app 的 CI、Release 自动化或 GitHub Pages 都是后续可选项，不是完成当前发布所必需的条件。

## 12. 发布前的简短自检

每次准备同步时，确认这五件事：

1. 我在博客仓库根目录的 main 上。
2. 文件都已经正确提交；没有未提交的本次游戏改动。
3. 当前 HEAD 已推到博客，并通过对应的 validate。
4. 我执行的是带正确 prefix 和目标仓库的 subtree push。
5. 两个目标的结果分别看过；网站部署状态另外检查。

日常维护要记住的顺序是：**改博客里的 app → 检查 → 提交博客 → 推送博客 → 等 CI → 同步 app。**
