# OSS + CDN 部署审查与首次发布清单

更新：2026-09-16。适用仓库：`Nanoka42/nnk-blog`，生产域名：`https://nanoka.tv`。

本文区分三种证据：用户提供的控制台操作记录、本轮工作区代码检查、只读公网实测。没有登录阿里云控制台修改配置，没有提交、推送或运行生产部署，也没有核实 GitHub 上某次 CI / STS 已成功。最初部署计划中的“尚未修复锁文件”是历史状态，不应继续当作当前结论。

## 1. 已修正的工作流

对应文件：[ci.yml](../.github/workflows/ci.yml)、[上传脚本](../scripts/deploy-oss.sh)、[部署前检查](../scripts/check-deployment.mjs)、[线上验收](../scripts/verify-deployment.mjs)。

| 原配置问题 | 当前实现 |
| --- | --- |
| `ossutil --version` 会报 unknown flag，安装步骤直接失败 | 改成实际支持的 `ossutil version` |
| 全站混合上传，之后重复上传 `_astro`；新 HTML 可能先于依赖资源可见 | 按 `_astro` → 固定资源 → RSS/sitemap/robots → HTML 上传；任何阶段失败就停止 |
| RSS/sitemap/robots 与约定的浏览器缓存不一致 | 这些文件使用 300 秒，HTML/固定资源 60 秒，哈希资源 31536000 秒 + immutable |
| 只检查两个文件；`find \| sort \| head` 在 pipefail 下有 SIGPIPE 风险 | 检查主要路由、游戏资源、配置、生产域名、noindex；保存完整 SHA256 清单 |
| 只用 `curl -f` 读源站首页，3xx/旧内容等可能蒙混过关 | 对照本次 artifact 验收正文、HTTP 状态、MIME、缓存头、目录跳转和真实 404 |
| 尚无预演入口和 push 自动发布路径 | 手动默认 dry-run；验收后用 Repository Variable `AUTO_DEPLOY=true` 开启 main 自动发布 |
| 重跑过时工作流可能覆盖新版本 | 拿到部署并发锁后核对当前 main SHA，不允许重跑旧版本发布 |

保留原本正确的部分：同一运行的 `dist-${{ github.sha }}`、`needs: validate`、production 环境、最小 job 权限、固定阿里云 action SHA、ossutil 2.4.0 下载校验和、STS 三项环境变量映射、CNAME 寻址、不取消正在运行的 main 发布、不删除 OSS 对象。

`dist/` 的内容直接上传到桶根，不会多出 `dist/` 前缀。CLI 会根据文件扩展名推断资源 MIME；为避免系统 MIME 数据库差异，字体明确设置 `font/woff2`、`font/woff`、`font/ttf`，HTML 明确设置 `text/html; charset=utf-8` 和 `Content-Disposition: inline`。过滤规则按 ossutil **2.x** 语义实现并实测；不要套用 1.x 说明。[官方上传命令](https://help.aliyun.com/zh/oss/developer-reference/cp-upload-file)、[过滤规则](https://help.aliyun.com/zh/oss/developer-reference/advanced-commands/)、[工具与环境变量](https://help.aliyun.com/zh/oss/developer-reference/ossutil-overview/)

## 2. Variables：现有六项可以保留

| production Environment Variable | 当前值 |
| --- | --- |
| `OSS_BUCKET` | `nanoka-blog-prod-2026` |
| `OSS_REGION` | `cn-shanghai` |
| `OSS_ENDPOINT` | `https://oss-origin.nanoka.tv` |
| `ALIBABA_OIDC_PROVIDER_ARN` | `acs:ram::1559403763150419:oidc-provider/github-actions` |
| `ALIBABA_DEPLOY_ROLE_ARN` | `acs:ram::1559403763150419:role/nanoka-blog-deployer` |
| `CDN_DOMAIN` | `nanoka.tv` |

另外两项放在 **Settings → Secrets and variables → Actions → Variables，即 Repository Variables**：

| 变量 | 设置方式 |
| --- | --- |
| `SITE_URL` | `https://nanoka.tv`。validate 构建阶段就需要；不要仅放 production 环境 |
| `AUTO_DEPLOY` | 首次验收前不设置或设为 `false`；全部验收后改为字符串 `true` |

`AUTO_DEPLOY` 用于 job 是否启动的判断，不能仅放 production Environment Variables。部署脚本已固定 CNAME 模式，不需要新增 `OSS_USE_CNAME` 或 `OSS_ADDRESSING_STYLE`。[GitHub 变量与求值时机](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)

## 3. RAM 信任策略：核对记录中的两处笔误

记录中出现了 `oidc:iss = https://token.actions.githubusercontent.com/` 和 `str:AssumeRole`。若控制台实际也是这样，需修改；如果仅是记录笔误则不必重复操作。

- issuer **没有尾斜杠**，`StringEquals` 必须精确匹配。
- 信任策略 Action 是 **`sts:AssumeRole`**；交换 token 的 API 名称才是 AssumeRoleWithOIDC。
- subject 中的 `@307284785` 与 `@1372837185` 是新版不可变 ID 格式，不能按旧教程删除。具体值须与此前 production 诊断日志一致。

供核对的完整策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "acs:ram::1559403763150419:oidc-provider/github-actions"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "oidc:iss": "https://token.actions.githubusercontent.com",
          "oidc:aud": "sts.aliyuncs.com",
          "oidc:sub": "repo:Nanoka42@307284785/nnk-blog@1372837185:environment:production"
        }
      }
    }
  ]
}
```

Environment 的 subject 不包含 main，所以 production 的 **Selected branches and tags → Branch → main** 必须保留；不额外开放同名 tag。[GitHub OIDC](https://docs.github.com/en/actions/reference/security/oidc)、[新版 subject 公告](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/)、[RAM 信任策略](https://help.aliyun.com/en/ram/user-guide/create-a-ram-role-for-a-trusted-idp)

现有 `oss:ListObjects`、`oss:PutObject`、`oss:GetObject` 可继续用于当前小文件部署。脚本在发布前拒绝单文件达到 100 MiB 的产物，避免将来无意触发分片上传所需的额外权限；确实需要大文件时再审核 ListParts / AbortMultipartUpload。无需改成 OSS FullAccess，也无需增加 DeleteObject。

## 4. 公网实测：还不能认定只剩 CI

检查时间：**2026-09-16 22:51–22:53（北京时间）**。DNS 使用 Google DNS over HTTPS 查询；TLS/GET 使用 Python 标准库并校验证书。本机 DNS 返回代理 fake-IP，因此没有把本机的 `198.18.*` 当成真实服务器地址。

| 项目 | 实测结果 | 含义 |
| --- | --- | --- |
| `nanoka.tv` 的公网 A / AAAA / CNAME | 查询成功，但没有 Answer，只有 SOA | 根域尚未查到可用公网解析；CDN 上线未完成验收 |
| 权威 DNS | `dns17.hichina.com`、`dns18.hichina.com` | 当前由阿里云 DNS 托管 |
| `oss-origin.nanoka.tv` | CNAME 到 `nanoka-blog-prod-2026.cn-shanghai.taihangrda.cn`，再解析到 OSS IP | 上传域名的 DNS 链路已有结果 |
| 上传域名 HTTPS | 证书链与域名验证通过 | TLS 基础链路可用 |
| 源站 `/`、`/index.html`、`/posts`、`/posts/`、随机不存在目录 | 均为 HTTP 403，`AccessDenied`，`EC 0003-00000001`，提示 bucket acl | 匿名读取尚未通过；尚不能验收子目录首页或 404 |
| 直接连接 OSS、SNI/Host=`nanoka.tv` | `nanoka.tv` 证书验证通过；GET 仍为 403 | 正式域名的 OSS 侧证书服务已有证据；不等于 CDN 侧配置正确 |
| 两张可见 OSS 证书 | 到期 2026-12-15 07:59:59 北京时间 | 需要在到期前续签并重新部署 |

**403 不足以证明桶一定是 private，也不证明对象已经存在。** 先检查桶 ACL、账号/桶“阻止公共访问”，首次上传后确认 `index.html` 存在且对象 ACL 继承公共读桶，再重新检查匿名 GET。不要仅为消除错误就放开整个账号的公共访问，先确定实际约束范围。[403 排障](https://help.aliyun.com/zh/oss/user-guide/http-403-error-code)、[阻止公共访问](https://help.aliyun.com/zh/oss/user-guide/block-public-access)

还需要在控制台核对以下内容；操作记录没有足够证据证明已经完成：

1. **CDN 源站继续使用选中的 OSS Bucket 地址**。回源 Host 与 HTTPS SNI 设为已绑定 OSS 的 `nanoka.tv`；不要把源站地址改成会解析回 CDN 的 `nanoka.tv`。
2. **HTTPS 回源及匹配端口**。记录中的源站端口还是 80，需核实最终回源协议/端口；HTTPS 回源使用 443。
3. **CDN 自己的 `nanoka.tv` 证书、HTTP → HTTPS、匿名 OSS 回源**。源站证书可用不证明 CDN 已配置证书；本方案关闭私有 OSS 签名回源。
4. OSS 静态网站默认首页 `index.html`、子目录首页开启、目录 Redirect、自定义 `404.html` 且状态码 404。
5. CDN 的 404 状态码缓存设为 0；基本缓存仍用现有 60 秒 / 300 秒 / 一年规则。关闭会改写 HTML/CSS 正文的页面优化；gzip/br 传输压缩可以正常使用。
6. 首次上传后可用 `curl --resolve` 临时指向 CDN 节点验收，然后给根域 `@` 配置 CDN 分配的 CNAME。检查同名现存记录，不覆盖其他用途。

依据：[OSS + CDN 及回源 Host](https://help.aliyun.com/zh/oss/user-guide/cdn-acceleration)、[回源协议](https://help.aliyun.com/zh/cdn/user-guide/configure-the-origin-protocol-policy)、[回源 SNI](https://help.aliyun.com/zh/cdn/user-guide/configure-sni)。

## 5. 首次发布的操作顺序

1. 核对上述 RAM、公共读取、静态网站和 CDN 配置。保持 `AUTO_DEPLOY` 关闭。
2. 提交并推送这次工作流、三份部署脚本、部署测试与文档。注意仓库中还有原先未提交的 README 等改动，按实际内容选择提交；不要只提交 ci.yml 而漏掉它调用的脚本。
3. 在 Actions → **Check and build → Run workflow → main**：保留 `dry_run=true`，`verify_cdn=false`。检查完整 validate、STS 交换、各阶段上传预览及桶根路径。**dry-run 不证明 PutObject 权限或网站可访问**，它没有上传文件。
4. 再次 Run workflow → main，取消 `dry_run`，暂不勾选 `verify_cdn`。这次才实际上传，并自动验收源站。若上传成功但 HTTP 验收失败，文件已在 OSS；根据失败路径修复配置后重跑，不会自动回滚或删除。
5. 验收 CDN 并配置正式 DNS。浏览器确认首页、文章、中文标签、游戏、音效、公式/代码复制与手机布局；访问 `/posts` 应跳到正式域名 `/posts/`，随机不存在路径应为自定义 404。
6. Run workflow → main，`dry_run=false`、`verify_cdn=true`。源站和 CDN 都通过后，将 **Repository Variable `AUTO_DEPLOY` 设为 `true`**。
7. 后续每次 push/merge main：检查 → 构建 → 同次 artifact → OSS 发布 → 源站/CDN 验收。PR 只验证，不获得生产凭证。开启变量不会追溯触发现有提交；需要下一次 push，或先手动发布。

如果提示 main 已移动，发起一次新的 Run workflow → main；不要重跑旧的发布任务。日常源码回退可以 `git revert` 后推送新提交；精确恢复旧 artifact 需要独立审阅的恢复操作，不通过重跑旧 job 绕过版本检查。

手动检查命令（在已生成对应生产 `dist/` 的仓库根目录执行）：

```powershell
$env:DEPLOY_VERIFY_TIMEOUT_MS = '30000'
node scripts/verify-deployment.mjs https://oss-origin.nanoka.tv

$env:DEPLOY_VERIFY_TIMEOUT_MS = '340000'
node scripts/verify-deployment.mjs https://nanoka.tv
```

线上验收会比较本地文件与返回正文，因此本地 `dist/` 必须是待验收的版本。CDN 在总预算内重试，等待既有短缓存过期；不加 query 参数绕过缓存，以免错误地宣称正常 URL 已更新。长期旧缓存、页面优化改写或源站错误会使验收失败。

## 6. CDN 刷新、归档和日常维护

**本版没有自动调用 CDN 刷新 API。** 当前角色记录只含 OSS 权限，正常 HTML/游戏缓存 60 秒、RSS/sitemap/robots 300 秒已经可以完成发布；CDN 验收为这些缓存预留时间。首次接入或修改缓存规则后，可在 CDN 控制台刷新受影响路径。若希望每次立即刷新，再增加精确域名范围的 `cdn:RefreshObjectCaches` / `cdn:DescribeRefreshTasks` 权限和刷新任务查询流程；无需因此扩大 OSS 权限。[缓存策略](https://help.aliyun.com/zh/cdn/user-guide/configure-the-cdn-cache-expiration-time)、[刷新机制](https://help.aliyun.com/zh/cdn/user-guide/refresh-and-prefetch-resources)

- 稳定版本保存完整 `dist-SHA` artifact（目前保留 14 天）与发布清单（90 天）。清单不是网站备份，长期回滚还需下载完整产物。
- 无自动删除意味着旧哈希资源仍可供缓存页面使用；也意味着删除文章/改为 draft 不会下线历史 OSS 页面。真正下线要按清单删除具体对象并刷新 CDN，之后验证 404。
- 多个固定文件名游戏资源不具备原子切换；先资源后 HTML 只能缩小风险窗口。将来有频繁游戏更新时，再为整套游戏资源增加版本目录或内容哈希。
- `/coso` 与旧游戏入口已有静态跳转页。CDN 的直接 HTTP 重定向属于推荐增强，规则见部署指南，不能把整个游戏资源目录重定向走。
- 证书续期后同时检查 OSS 两处证书和 CDN 证书是否已重新部署。配置余额/流量异常提醒、查看失败的 Actions，并保存首次完整验收结果。

## 7. 本轮本地验证结果

- `actionlint 1.7.12`：工作流语法、表达式与 action 参数检查通过；Bash 语法检查通过。
- `npm run check`：0 errors / 0 warnings / 0 hints。
- Node 测试：既有博客与游戏测试通过；新增线上验收测试最终 17 项通过，包含失败检测、重试和超时边界。
- `SITE_URL=https://nanoka.tv npm run build:release`：构建通过，生成 34 个页面；现有构建验证器检查 38 个必需文件和 170 个站内引用。
- 官方 ossutil 2.4.0 最终脚本 dry-run：七次命令分别选择 9 / 19 / 20 / 20 / 25 / 4 / 34 个文件，总计 131 个，与 dist 完全一致，无遗漏或重复。
- 使用假凭据和本机 HTTP 接收器验证上传请求：字体 MIME、各组 Cache-Control、HTML inline 正确；没有设置对象 ACL。这个验证没有向生产 OSS 上传。
- 部署前检查：当前六项 Variables 与产物通过；在临时副本中改错 canonical 会被拒绝。

这份清单不替代云端首次部署验收。当前代码可提交评审；生产认证、实际上传和 CDN 服务状态仍须由首次工作流结果确认。
