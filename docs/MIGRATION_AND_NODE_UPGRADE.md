# 目录迁移与 Node.js 升级记录

检查日期：2026-10-22。

## 目录与 Git

当前仓库根目录为 `N:\N Blog\nnk_blog`，由 `J:\NANOKA\N Blog\nnk_blog` 复制迁移。

- 源码、构建脚本、配置和依赖启动入口中，未发现需要旧目录才能工作的绝对路径，也没有指向旧目录的符号链接或 junction。
- 已修复 `BUILD_AND_DEPLOY_EXPLAINED.md` 和 `CONWAY_APPS_PUBLISHING_GUIDE.md` 中共 7 处旧操作路径。PowerShell 使用 `N:\N Blog\nnk_blog`，Git Bash 使用 `/n/N Blog/nnk_blog`。
- `.astro/dev.json` 和 `.astro/preview.json` 保存的是 9 月的旧 PID、端口。已确认对应进程与监听端口均不存在，备份到 `.git/node-upgrade/stale-astro/` 后移除这两个生成状态文件。
- `.astro/dev.log`、`.generated/check.log`、`.generated/build-release.log` 中的旧路径属于历史日志，不参与运行；保留它们以便追溯。
- 父目录中的 `CONWAY_APPS_REPOSITORY_PLAN_2026-09-18.md` 仍保留历史路径。本次没有改动历史计划或解包检查旧 ZIP 备份；日常操作请使用本仓库 `docs/` 内的现行指南。

Git 检查结果：

- `.git` 是仓库自身目录；没有 `core.worktree`、外部对象库 alternates、独立 worktree 或生效的自定义 hook 指向旧目录。
- **发现并修复提交身份失效**：用户级 `includeIf.gitdir:J:/NANOKA/` 原本从 `~/.gitconfig-nanoka` 加载 Nanoka 身份；迁到 N 盘后条件不匹配，导致此仓库的 `user.name` 和 `user.email` 均未设置。本次将原文件中同一姓名、邮箱写入本仓库 `.git/config`，恢复 author 与 committer 身份解析，不改动全局规则。原本地配置已备份到 `.git/node-upgrade/git-config-before-identity`。这项本地配置不会随 commit 或 push 上传，也不需要在 GitHub Actions 中设置。
- `main` 正常跟踪 `origin/main`。检查时本地 HEAD 与实时读取的远程 `main` 均为 `a60ae5d734aa0a091b21e8c173b9cffd3a4ff3e3`。
- origin 仍为 `git@github-nanoka:Nanoka42/nnk-blog.git`；SSH 别名解析到 GitHub，使用用户目录中的密钥。只读访问远程分支成功，不需要重配 origin 或 SSH 密钥。
- `git fsck --full` 未报告损坏或缺失对象；存在少量 dangling 对象，这是未被当前引用指向的历史对象，无须清理。
- 用户级 Git 配置已包含 `safe.directory=N:/N Blog/nnk_blog`。旧的 `J:/NANOKA/N Blog/nnk_blog` 条目也仍存在，但不影响新目录，本次未修改全局配置。

如果以后希望 `N:\N Blog\` 下所有仓库都自动使用原 Nanoka 身份，可以自行增加对应的全局规则：

```powershell
git config --global 'includeIf.gitdir:N:/N Blog/.path' '~/.gitconfig-nanoka'
```

当前博客已经通过本地配置修复，无须执行这一步；不要笼统把整个 N 盘都归为同一身份。

如果旧副本今后不再使用，可自行执行以下可选清理；不要删除其他项目的条目：

```powershell
git config --global --fixed-value --unset-all safe.directory 'J:/NANOKA/N Blog/nnk_blog'
```

## 项目与 Actions 配置

Node.js 官方于 2026-10-21 发布 [24.22.1 安全版本](https://nodejs.org/en/blog/release/v24.22.1/)，本次继续沿用 24.x LTS。

- `.nvmrc`：由 `24` 改为精确版本 `24.22.1`。
- `package.json` 与 lockfile 的根项目 `engines.node`：由 `>=24.0.0` 改为 `>=24.22.1`。这是最低版本声明，不会自动替换 Windows 安装；npm 默认也仅对不符合要求的版本发出警告。
- CI 的 validate 与 deploy 都通过 `node-version-file: .nvmrc` 选择项目脚本使用的 Node。
- GitHub 官方 Action 更新为 `checkout@v7`、`setup-node@v7`、`upload-artifact@v7`、`download-artifact@v8`，均使用 Node 24 Action 运行时。当前 artifact 名称、路径、ZIP 格式和部署流程继续适用；下载摘要不匹配时会报错。
- 阿里云凭证 Action 当前固定的 SHA 已声明 `using: node24`，保持原版本。
- 依赖包版本未升级，lockfile 仅同步根项目的 Node 最低版本。`@types/node@24.13.3` 是传递类型依赖，并不是 Node 运行时，无须改成 24.22.1。
- 独立游戏的最低兼容版本和旧验证报告中的真实环境记录予以保留；当前开发推荐版本与博客统一。

项目脚本的 Node 版本和 Action 内部运行时是两套机制：`.nvmrc` 将项目脚本固定为 24.22.1；Action 内部 `using: node24` 的具体补丁版本由 GitHub runner 提供，不能通过 `setup-node` 一并锁定。当前使用 GitHub 托管的 `ubuntu-latest`，无需维护本地或自托管 runner。

## Windows 系统安装：需要你操作

本次检查时，系统 Node 位于 `C:\Program Files\nodejs\node.exe`，版本为 24.13.0，未发现 nvm、fnm 或 Volta。为避免未经确认更改系统级安装，本次在仓库 `.git/node-upgrade/` 内下载并校验官方 Windows x64 ZIP，以独立 Node 24.22.1 / npm 11.19.1 验证项目；系统级安装尚未替换。

1. 关闭正在运行的博客开发、预览服务。
2. 下载并运行 [官方 Node.js 24.22.1 Windows x64 安装包](https://nodejs.org/dist/v24.22.1/node-v24.22.1-x64.msi)，沿用原安装目录和默认组件即可；出现 Windows 管理员确认时由你确认。不需要另外全局安装 Astro、npm 或新建版本管理器。
3. 完成后重新打开 PowerShell；如编辑器或 Codex 中的终端仍显示旧版本，重启相应应用。
4. 在新终端逐条执行：

```powershell
Set-Location -LiteralPath 'N:\N Blog\nnk_blog'
node --version
npm --version
node -p 'process.execPath'
npm ci
npm run dev
```

`node --version` 应显示 `v24.22.1`，官方安装包附带的 npm 为 `11.19.1`。安装目录通常仍是 `C:\Program Files\nodejs\node.exe`；若 Node 仍是旧版本，用 `Get-Command node -All` 检查是否有其他安装抢占 PATH。

## GitHub：审查后提交，云端才会生效

本次仅修改本地文件，没有创建 commit、push、PR、修改远程设置或触发工作流。已通过 GitHub 只读接口确认远程仍为旧版工作流；本地改动提交并推送后才会使用新配置。

1. 如果只想先验证 CI，请先在仓库 **Settings → Secrets and variables → Actions → Variables** 将 Repository Variable `AUTO_DEPLOY` 设置为 `false`。若它为 `true`，推送 `main` 后检查通过会执行真实 OSS/CDN 发布。此变量必须是 Repository Variable，不能只放在 Environment 中。
2. 若仓库 **Settings → Actions → General → Actions permissions** 使用“只允许指定 Action”的白名单，允许本次使用的四个新版本及现有阿里云 Action；如果已允许这些官方 Action，则无需更改。没有必要扩大 `GITHUB_TOKEN` 权限、更换 OIDC/RAM Role 或新增长期 AccessKey。
3. 审查本地差异后，按正常方式提交并推送到 `main`，或通过 PR 合并。现有 SSH 读取已验证正常，本次无需为迁移创建 PAT。推送权限和分支保护仍以 GitHub 实际策略为准。
4. 打开仓库 **Actions → Check and build**，查看新提交对应运行。validate 中的 setup-node 日志应显示 `24.22.1`，随后依次通过依赖安装、check、test、发布构建和浏览器测试。
5. 若要验证部署任务，选择 **Run workflow → main**，保留 `dry_run=true`；production 环境如配置了审批，需要按页面提示批准。预演会申请临时凭证并检查上传计划，不会上传文件。确认后再自行决定是否执行真实发布或恢复 `AUTO_DEPLOY=true`。

更新配置后不要对旧提交点 Re-run 来验证新版配置；请查看新提交触发的运行，或在新配置已进入 `main` 后 Run workflow。

## 本地验证

本次使用 Node.js **24.22.1**、附带的 npm **11.19.1**，在新目录 `N:\N Blog\nnk_blog` 执行：

| 检查 | 实际结果 |
| --- | --- |
| 官方 Windows x64 ZIP 的 SHA-256 | 与官方 `SHASUMS256.txt` 一致 |
| `npm ci --no-audit --no-fund` | 成功，安装 425 个包；依赖版本和完整性信息未变 |
| `npm run check` | 28 个 Astro 文件，0 errors / warnings / hints |
| `npm test` | 博客 38 项、2D 游戏 34 项、3D 游戏 117 项，共 189 项全部通过 |
| `npm run build:release` | 成功；109 个页面，119 项必需产物、452 处本地引用与最终静态内容校验通过 |
| `npm run test:browser` | 桌面、平板、手机与生产预览，共 47 项全部通过 |
| CI YAML 解析与配置复查 | 通过；两处项目 Node 选择一致，部署条件与权限保持原样 |
| Node 版本声明 | `.nvmrc` 满足根项目及 lockfile 的一致最低要求，24.13.0 不再满足声明 |
| `git diff --check` | 通过 |
| Git author / committer 身份解析、SSH 远程读取 | 修复后身份解析成功；远程只读访问成功 |

`npm ci` 有上游弃用提示和 esbuild install scripts 审批提示；未导致本轮验证失败，也没有为此扩大安装脚本权限。浏览器日志另有颜色环境变量提示，不影响测试结果。

本地兼容性检查已经完成；Windows 系统级 Node 仍需安装，GitHub 托管 runner、OIDC 和 OSS/CDN 真实部署需要提交后的云端执行才能确认。
