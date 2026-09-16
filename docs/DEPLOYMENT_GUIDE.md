# 阿里云静态部署指南

## 当前状态

**代码已完成：** Astro 静态输出、游戏自动集成、内容/类型/浏览器测试、生产链接检查、GitHub Actions CI、RSS、sitemap、robots、canonical 与基础 Open Graph。

**已确认：** 主域名 `nanoka.tv`，网站名称「微羽笔记本」，网站备案号 `粤ICP备2026138999号-1`，2026-09-16 审核通过。按广东规则，页脚展示主体备案号 `粤ICP备2026138999号` 并链接工信部。备案记录中的实例 IP 为 `101.37.36.31`。

**仍需配置：** GitHub 远程仓库、OSS Bucket、CDN、HTTPS 证书、AliDNS、RAM OIDC Provider 与部署 Role，以及获得参数后才启用的上传 workflow。当前没有部署到云端，没有修改 DNS，没有创建或保存凭证。未来迁至 OSS + CDN 时，应向接入商确认接入资源与备案记录需要如何更新；CDN 的动态解析 IP 与备案实例 IP 不同，本身不能直接判断为备案违规。

## 1. 这条链路分别做什么

```text
GitHub 仓库                 保存源码、Markdown 和版本历史
  ↓ push / pull request
GitHub Actions             在临时机器 npm ci、检查、测试、构建
  ↓ dist/ 静态文件
阿里云 OSS                 保存 HTML / CSS / JS / 图片 / 字体 / 游戏资源
  ↓ CDN 回源读取
阿里云 CDN                 在边缘缓存内容、提供 HTTPS 加速
  ↑ AliDNS CNAME
www.<你的域名>             读者访问的地址
```

AliDNS 只负责告诉浏览器域名指向哪里，不运行网站；CDN 没有文件时到 OSS 获取。Astro 的构建过程需要 Node.js，网站访问过程不需要。

本文采用 **独立的公开只读发布 Bucket + 匿名 CDN 回源**。Bucket 内只放可公开的 `dist/` 内容；上传权限仅给部署角色。不能把源码、`.env`、备份或私有文件混放其中。

选择这个方案是因为 OSS 目录首页依赖匿名访问：CDN 对私有 OSS 的签名回源不会自动触发默认首页。若以后要求私有 Bucket，必须给每个目录路径增加到对应 `index.html` 的回源改写，并单独验证 404；只给首页加改写不足以支持文章链接。[阿里云关于私有回源默认首页的说明](https://help.aliyun.com/en/oss/why-am-i-unable-to-access-the-default-homepage-of-a-bucket-when-i-retrieve-an-object-from-a-private-bucket-by-using-cdn)

## 2. 开始前需要确认

| 信息 | 用途 |
| --- | --- |
| GitHub 仓库 `OWNER/REPO`、默认分支 | CI 与 OIDC 信任边界 |
| Production domain、canonical 选择（www 或根域名） | SITE_URL、证书和域名跳转 |
| ICP 备案状态、CDN 加速区域 | 决定是否可使用中国内地加速 |
| OSS Region、Bucket name、Endpoint | 上传目标与 CDN 源站 |
| 是否受默认公网端点限制；上传用 OSS 直连域名（若适用） | GitHub 托管 runner 的公网上传方式 |
| CDN accelerated domain | CDN 与 AliDNS CNAME |
| OIDC Provider ARN、部署 Role ARN、实际 OIDC subject | 无长期密钥的身份认证 |
| 是否允许 PutObject、ListObjects、DeleteObject | 确定最小权限；删除默认不启用 |
| 是否用 GitHub `production` Environment 及其审核规则 | 发布范围与信任策略 subject |

ARN、Bucket 名和域名通常属于配置标识，不是密码。**不要把阿里云密码、主账号 AccessKey、长期凭证或 OIDC token 发进聊天或提交仓库。**

## 3. GitHub 仓库与本地发布检查

工作区初始不是 Git 仓库。本次未替你创建远程仓库或提交。先在 GitHub 创建仓库，再在根目录运行（远程 URL 替换为自己的）：

```bash
git init -b main
git add .
git commit -m "Create static Nanoka blog"
git remote add origin <你的-GitHub-仓库-URL>
git push -u origin main
```

提交前用 `git status` 确认 `.env`、`node_modules`、`dist`、`public/play`、`.generated` 和测试截图都没有被加入。原素材和 H5 源码需要提交。

仓库 Settings → Secrets and variables → Actions → Variables 添加：

```text
SITE_URL = https://nanoka.tv
```

只填 origin，不带文章路径、query 或 fragment。配置集中在 `config/site.mjs`；`astro.config.mjs` 用它生成全站 URL。生产域名必须 HTTPS。

本地可从 `.env.example` 创建 `.env` 并填写同一值：

```bash
npm ci
npm run check
npm test
npm run build:release
npm run preview
```

不设置 `SITE_URL` 时仍可构建，但 canonical 指向 localhost，robots 输出 `Disallow: /`，页面有 noindex。这种产物只适合本地预览，**不能直接用于上线**。

`npm run build:release` 会拒绝 localhost/noindex 的发布配置。现有 `.github/workflows/ci.yml` 使用该命令，在 push main、PR、手动触发时验证并保存 `dist-<commit SHA>`。CI 的默认生产 origin 是 `https://nanoka.tv`，可以用 Repository Variable `SITE_URL` 显式覆盖。Actions 页面显示绿勾后，点进该次运行即可下载 artifact；这不代表已经上传到云端。

## 4. OSS 控制台

### 创建发布 Bucket

1. 选择 Region，记录 Bucket 名及公网 Endpoint。
2. 使用标准存储类型即可；网站文件不适合需要恢复等待的归档存储。
3. 确认这是仅存放公开站点文件的独立 Bucket。
4. 如当前默认开启“阻止公共访问”，为这个发布桶关闭，再设置为 **公共读**。绝不能设为公共读写。
5. 不授予匿名列表、上传或删除权限。不要上传源项目根目录。

### 静态网站设置

在 Bucket 的静态网站/基础设置页配置：

| 字段 | 值 |
| --- | --- |
| 默认首页 | `index.html` |
| 子目录首页（SupportSubDir） | 开启 |
| 子目录无尾斜线访问规则 | Redirect，使 `/posts` 进入 `/posts/` |
| 默认错误页 | `404.html` |
| 错误页 HTTP 状态 | 404 |

**子目录首页是必要配置。** 否则 `/posts/` 等路径可能读到根首页，不能正常访问 SSG 的多页目录。游戏主入口现为 `/projects/conway-soldiers/`；其脚本、图标和音效保留在 `/play/conway-soldiers/` 资源目录，须完整上传。旧 `/play/conway-soldiers/` 页面本身是跳转页。

不要设置 SPA fallback，把所有未知路径都返回首页/200；这是多页静态博客，未知页面应返回自定义 404。[OSS 静态网站配置](https://www.alibabacloud.com/help/en/oss/user-guide/hosting-static-websites)

### 公网 Endpoint 的新限制

阿里云公告说明：2025-03-20 后新开通 OSS 的用户，在中国内地 Bucket 通过默认公网域名调用数据 API，可能遇到 `400 PublicEndpointForbidden`；涉及 PutObject、ListObjects、GetObject 等。上线前需核实自己的账户是否适用。[官方变更公告](https://www.alibabacloud.com/en/notice/oss_update_notice_policy_change_in_calling_data_api_operations_via_the_default_public_domain_name_45a)

如果适用：为 OSS 绑定独立的直连自定义域名，例如 `<上传子域名>`，完成归属验证与 DNS 绑定，并配置 HTTPS；上传 SDK/ossutil 使用该域名及 CNAME 模式。它与面向读者的 CDN 域名不同。不能把数据上传到 CDN 加速域名，也不能让 GitHub 托管 runner 使用只在阿里云内网可达的 `internal` Endpoint。

## 5. CDN、HTTPS 与 AliDNS

1. CDN 控制台添加最终加速域名，例如 `www.<域名>`。
2. 选择加速区域。包含中国内地时，先确认域名已完成 ICP 备案；境外区域仍需按所选服务与区域的要求配置。
3. 源站类型选择 OSS，指定发布 Bucket。回源 Host 使用该 Bucket 对应的源站域名，不能填 CDN 自己的域名形成回环。
4. 当前公开只读桶方案使用匿名回源，不开启私有 OSS 签名回源。
5. 如默认 Endpoint 限制影响回源，结合该 Bucket 的 CDN 接入与自定义域名配置验证直连源站，不能仅凭上传成功推断 CDN 可用。
6. 在 CDN 为加速域名配置有效 HTTPS 证书与自动/定期续期，开启 HTTP → HTTPS。证书须覆盖实际访问域名。
7. AliDNS 中给 `www` 创建 CNAME，值复制 CDN 分配的加速 CNAME，不能填 OSS Endpoint。若同名已有 A/AAAA/CNAME，先审查现有用途再调整。
8. 非 canonical 域名使用支持重定向的 CDN 配置、另一个加速域名或独立重定向服务做永久跳转。**DNS 本身不会产生 HTTP 301/308。** 根域名与 CNAME/MX 等记录可能冲突，应按现有 DNS 规划处理。

参考：[OSS 接入 CDN](https://help.aliyun.com/en/oss/user-guide/cdn-acceleration)、[CDN 源站与回源 Host](https://help.aliyun.com/en/cdn/user-guide/configure-an-origin-server)。这些控制台与 DNS 操作尚未执行。

### 康威跳棋短链

代码已为正则 `^conways?[_-]?(?:soldier|checker)s?$` 的全部 24 种小写拼写、`coso`，以及旧 `play/conway-soldiers` 入口生成独立目录跳转页。映射集中在 `config/redirects.mjs`，统一目标是 `/projects/conway-soldiers/`。例如：

- `https://nanoka.tv/coso`
- `https://nanoka.tv/conway-checker`
- `https://nanoka.tv/conways_soldiers`

静态页通过 `location.replace` 跳转，保留 query 与 hash；禁用 JavaScript 时通过 HTML `meta refresh` 跳转，并提供手动链接。静态 HTML 响应通常是 **200 + 浏览器跳转**，不能自行发出 HTTP 301/302。OSS 开启上面的无尾斜杠目录跳转后，`/coso` 也能先进入 `/coso/`；Astro 本地开发和预览接受这两种路径。所有跳转页均有 noindex，canonical 指向主游戏页，且不进入 sitemap。

正式部署建议在 CDN → 域名管理 → `nanoka.tv` → 缓存配置 → **重写访问 URL** 加下面两条规则，让请求直接到达棋盘：

| 待重写 Path（PCRE，区分大小写） | 目标 Path | 执行规则 |
| --- | --- | --- |
| `^/(?:conways?[_-]?(?:soldier|checker)s?\|coso)/?$` | `/projects/conway-soldiers/` | Redirect |
| `^/play/conway-soldiers/?$` | `/projects/conway-soldiers/` | Redirect |

**复制正则时去掉 Markdown 表格中为竖线添加的转义。** 第一条可直接复制以下原文：

```text
^/(?:conways?[_-]?(?:soldier|checker)s?|coso)/?$
```

规则匹配 path，不匹配域名或 query，目标保留尾斜杠。不要使用 `break`（它是内部改写），也不要把旧目录规则写成 `^/play/conway-soldiers/.*`，否则会把游戏脚本和音效也重定向走。阿里云这项功能默认是 **302**，文档没有保证普通控制台可直接选择 301；302 已满足短链需求。如需永久 301，应再核实账号可用的边缘脚本/重定向功能。查询参数按普通 Redirect 规则保留，hash 不发送到服务器。[阿里云访问 URL 重写说明](https://help.aliyun.com/zh/cdn/user-guide/create-an-access-url-rewrite-rule)

这些是已准备好的配置值，尚未在云端应用。生效后执行：

```powershell
curl.exe -I https://nanoka.tv/coso
curl.exe -I https://nanoka.tv/conways_checkers/
curl.exe -I https://nanoka.tv/play/conway-soldiers/
curl.exe -I https://nanoka.tv/play/conway-soldiers/src/app.js
```

前三项应得到重定向到 `/projects/conway-soldiers/` 的 Location；最后一项应为正常 JavaScript 响应，不能重定向。另检查 `/conway-checkers-extra/` 仍是 404。

### 备案与上线内容

`config/registration.mjs` 统一保存主体号、完整网站号及未来公安备案配置；博客底部中央和游戏页的可见底栏使用同一个备案组件。广东悬挂主体号的依据见[阿里云广东备案规则](https://help.aliyun.com/zh/icp-filing/icp-filing-regulations-for-guangdong)。

网站实际开通之日起 **30 日内**向属地公安提交联网备案申请，时间起点不是 ICP 审核通过日。获批后从[全国互联网安全管理服务平台](https://beian.mps.gov.cn/)取得编号、查询链接及官方图标，将图标放入 `public/`，填写 `publicSecurityRegistration` 后重建发布。当前保持 `null`，页面不显示任何虚构公安备案状态。[深圳公安办理时限说明](https://ga.sz.gov.cn/ZT/HLWSYSQ/CJWT/content/post_11490792.html)

更完整的备案范围、交互式科普游戏适用边界、访问日志和素材授权检查，以及可直接使用的主管部门咨询说明，见 [发布前检查记录](PRELAUNCH_REVIEW.md)。ICP备案和前端检查通过不能代替云端配置验收或其他业务许可判断。

### 缓存建议

| 对象 | 建议的源站 Cache-Control | CDN 建议 |
| --- | --- | --- |
| `/_astro/*` 哈希资源 | `public, max-age=31536000, immutable` | 长缓存，保留旧哈希资源 |
| HTML | `public, max-age=0, must-revalidate` | 短缓存或遵循源站，发布后刷新 |
| `rss.xml`、sitemap、robots | `public, max-age=300` | 短缓存 |
| `/play/conway-soldiers/*` 非哈希脚本、样式、图片、音效 | `public, max-age=300` | 短缓存，升级游戏时刷新整个前缀 |
| favicon 等非哈希文件 | `public, max-age=3600` | 中短缓存 |

这些是部署时设置的 OSS 对象 metadata / CDN 规则，静态 HTML 不能自动设置 HTTP 缓存头，当前构建没有假装已配置它们。上传工具还应设置正确 Content-Type：HTML、CSS、JavaScript、WebP、PNG、SVG、WAV、WOFF2、XML 与 TXT。

CDN 的目录/后缀缓存规则可能覆盖源站的 `no-cache`/短缓存，请检查优先级，不要统一把全部文件缓存一年。[CDN 缓存优先级](https://help.aliyun.com/en/cdn/user-guide/configure-the-cdn-cache-expiration-time)

## 6. GitHub OIDC → RAM Role → STS

### 创建 OIDC 身份提供商

RAM 控制台：集成管理 → SSO 管理 → 角色 SSO → OIDC → 创建身份提供商。

- Issuer URL：`https://token.actions.githubusercontent.com`
- Client ID / audience：`sts.aliyuncs.com`
- 验证指纹：使用控制台获取，并按当前官方说明核实。不要抄旧教程中的固定指纹。
- 保存生成的 OIDC Provider ARN。

然后创建信任该 OIDC provider 的 RAM Role，记录 Role ARN。[RAM OIDC 配置说明](https://help.aliyun.com/zh/ram/user-guide/manage-an-oidc-idp)

### 精确限制信任策略

下列 JSON 是需替换占位符的信任策略示例，不能原样保存：

```json
{
  "Version": "1",
  "Statement": [{
    "Effect": "Allow",
    "Action": "sts:AssumeRole",
    "Principal": { "Federated": ["<OIDC_PROVIDER_ARN>"] },
    "Condition": {
      "StringEquals": {
        "oidc:iss": "https://token.actions.githubusercontent.com",
        "oidc:aud": "sts.aliyuncs.com",
        "oidc:sub": "<实际部署-job-的精确-subject>"
      }
    }
  }]
}
```

策略 action 是 `sts:AssumeRole`；交换临时凭证的 API 则是 `AssumeRoleWithOIDC`。[STS API](https://www.alibabacloud.com/help/en/ram/developer-reference/api-sts-2015-04-01-assumerolewithoidc)

不要假定所有仓库的 subject 都是旧格式 `repo:OWNER/REPO:ref:refs/heads/main`。GitHub 当前文档说明，2026-07-15 后新建、改名或转移的仓库默认 subject 会包含不可变 owner/repo IDs；使用 `environment: production` 又会改变 subject 上下文。必须按实际仓库和部署 job 核实 issuer、audience、subject；只记录这些 claims，不记录完整 token。[GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc)

推荐部署 job 使用 `production` Environment，并在 GitHub Environment 设置仅允许 main、按需要启用人工审核。若 subject 是 environment 形式，分支限制须由 Environment 规则落实。不要给所有仓库、所有分支或 PR 通配授权。

### 最小 OSS 权限

只上传且需要列举对象时，可以给部署 Role 附加如下自定义策略（替换账号 ID 和 Bucket）：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:ListObjects"],
      "Resource": ["acs:oss:*:<ACCOUNT_ID>:<BUCKET>"]
    },
    {
      "Effect": "Allow",
      "Action": ["oss:PutObject"],
      "Resource": ["acs:oss:*:<ACCOUNT_ID>:<BUCKET>/*"]
    }
  ]
}
```

如果具体同步工具需要 HeadObject/GetObject 比较远端对象，才额外授予 `oss:GetObject`。`oss:DeleteObject` 仅在明确允许同步删除时增加到对象资源；默认不用删除，也不加 `--delete`。不要给 `AliyunOSSFullAccess`、创建桶、修改桶策略等权限。[OSS RAM 权限参考](https://www.alibabacloud.com/help/en/ram/api-object-storage-service)

CDN 自动刷新权限需要另外设计，不能混在 OSS 全权限中。初次发布可在控制台手动刷新；以后若启用刷新 API，再按指定加速域名及当前 API 授权能力添加最小权限。

### 未来的部署 workflow

现有 CI 没有 `id-token: write`，也不接触云账号。待上述信息齐全后再新增 `.github/workflows/deploy.yml`，建议：

1. 仅手动触发或 main 的成功发布触发，不接受 fork PR 凭证请求。
2. 验证/构建 job 只有 `contents: read`；确认 `SITE_URL` 已是 HTTPS 生产域名。
3. 单独 deploy job 使用 `environment: production`、`contents: read` 和 `id-token: write`。
4. 下载同一 commit 已验证的 dist artifact，避免部署另一版本。
5. 使用阿里云官方 `aliyun/configure-aliyun-credentials-action`，填写 `oidc-provider-arn`、`role-to-assume`、`audience: sts.aliyuncs.com`；启用时核实版本并固定完整 commit SHA。
6. 将得到的短期 AccessKeyId、AccessKeySecret、SecurityToken 通过环境传入上传工具，不写入仓库或日志；SecurityToken 不能遗漏。
7. 上传 assets，再上传 HTML，设置 MIME/缓存 metadata，最后验证并刷新 CDN。
8. 部署 concurrency 应按 production 环境串行；不要中途取消正在上传的版本。

参考：[阿里云官方凭证 Action](https://github.com/aliyun/configure-aliyun-credentials-action)、[GitHub 的云端 OIDC 指南](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-cloud-providers)。当前没有创建一个看似能发布、实际缺少上传参数的半成品 workflow。

未来使用的 Repository/Environment Variables：

```text
SITE_URL
OSS_REGION
OSS_BUCKET
OSS_ENDPOINT
OSS_USE_CNAME       # 采用直连自定义上传域名时 true
ALIBABA_OIDC_PROVIDER_ARN
ALIBABA_DEPLOY_ROLE_ARN
CDN_DOMAIN
```

变量名将在启用的上传脚本中统一使用。OIDC 正常配置后不需要长期 AccessKey Secret；证书私钥也不应提交到 Git，优先在阿里云证书/CDN 控制台管理。

## 7. 首次上线与验证

1. 完成域名、备案（适用时）、Bucket、CDN、HTTPS、DNS 和 RAM 配置。
2. 设置生产 `SITE_URL=https://nanoka.tv`，执行 `npm run check`、`npm test`、`npm run build:release`、`npm run test:browser`，或取得对应 commit 的成功 CI artifact。
3. 使用配置好的部署角色临时凭证上传 **`dist/` 里面的文件** 到 Bucket 根：根对象应是 `index.html`，不是 `dist/index.html`。
4. 设置对象 Content-Type / Cache-Control；确认没有上传 `.env`、源码、测试文件或配置文件。
5. 分别验证 OSS 源站和 CDN 域名，包含 `/`、`/posts/`、一篇文章、中文标签、`/projects/conway-soldiers/`、`/play/conway-soldiers/`、`/about/`、`/rss.xml`、`/robots.txt`、`/sitemap-index.xml`。
6. 用不存在的地址验证 **HTTP 404** 和自定义错误页；用 `/posts` 验证尾斜线重定向；验证上述短链及旧游戏入口。
7. 检查页面 canonical 与 Open Graph URL 已指向生产域名，robots 没有误留 `Disallow: /`。
8. 在 HTTPS 下尝试行内/独立公式、代码复制；测试游戏摆子、移动、音效和手机布局。

Windows 上可以用：

```powershell
Resolve-DnsName <生产域名>
curl.exe -I https://<生产域名>/
curl.exe -I https://<生产域名>/posts/
curl.exe -I https://<生产域名>/does-not-exist/
```

文件上传不是原子操作。特别是游戏资源使用固定文件名，更新时应先上传其资源，再上传入口，尽量保持过渡版本兼容；不要在上传过程中清空整个桶。

## 8. 回滚与下线文章

- Actions 保存 14 天构建 artifact。要长期回滚，请把稳定版本产物下载归档或发布为 Release 附件，并标注 commit SHA 和生产 SITE_URL。
- 回滚优先重新上传上一份**完整、已验证**的产物，再刷新 CDN。只还原 Git 后重新构建不等于恢复当时的每个字节。
- 可以开启 OSS Versioning 提供额外恢复能力，但会增加存储与治理工作，而且不是多对象原子回滚。
- 默认上传不删除远端文件，因此删除文章或把已发布文章改成 draft 后，旧详情对象仍可能存在。要真正下线，需明确删除对应 `posts/<slug>/index.html`（及无用标签页等），再刷新 CDN；这需要额外批准的 DeleteObject 权限或控制台操作。
- 不要立即删掉旧 `/_astro/` 哈希资源，缓存中的旧 HTML 仍可能引用它们。可之后按保留期清理。

## 9. 常见问题

| 现象 | 优先检查 |
| --- | --- |
| OSS / CDN 403 | Bucket 公共访问阻止、ACL、请求签名、RAM 资源 ARN、回源 Host、私有回源开关 |
| `PublicEndpointForbidden` | 是否命中新 OSS 公网端点限制；上传是否应改用绑定的自定义域名/CNAME 模式 |
| 首页正常，文章 404 | 是否上传完整目录、开启子目录首页、保留尾斜线；是否把全部内容误放到 `dist/` 前缀 |
| `/posts/` 显示首页 | OSS 子目录首页没有启用，或 CDN rewrite 把所有路径送到根首页 |
| 游戏空白、图标/声音 404 | 游戏地址是否有尾斜线；src/icons/sounds 是否完整上传；缓存是否混入旧版本 |
| 浏览器提示证书错误 | CDN 证书域名不匹配、过期、DNS 指错位置或证书尚未生效 |
| DNS 找不到或仍访问旧站 | AliDNS 记录值、重复 A/AAAA/CNAME、TTL 与本地缓存；解析生效不等于 HTTPS 已配置 |
| 更新没出现 | 对比 OSS 源对象与 CDN，检查缓存优先级、Age/ETag、HTML/游戏前缀是否刷新 |
| OIDC 认证失败 | issuer/audience、Role/Provider ARN、实际 sub、Environment 及分支约束、指纹和 token 有效期 |
| 复制失败 | 是否 HTTPS、浏览器是否拒绝剪贴板；站点提供手动选择源文本的回退 |
| 搜索引擎不收录 | 是否用 localhost 配置构建、robots/noindex、canonical 是否正确 |

原部署方案文档核查日期：2026-09-09；短链、备案及本轮发布流程更新于 2026-09-16。未在本轮重新实测所有历史云端步骤。实际开通云资源时请以对应账户区域的控制台与上述官方说明为准。
