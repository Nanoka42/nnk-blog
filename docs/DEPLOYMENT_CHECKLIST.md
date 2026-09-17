# 日常发布与运维清单

更新：2026-09-17。仓库：`Nanoka42/nnk-blog`；网站：<https://nanoka.tv>。

用户已确认 OIDC、实际上传、OSS 源站和 CDN 验收全部通过，网站与游戏正常访问。当前进入日常维护阶段；初次接入时的排错过程保留在 Git 历史中。基础配置见 [部署指南](DEPLOYMENT_GUIDE.md)，构建概念见 [构建与部署说明](BUILD_AND_DEPLOY_EXPLAINED.md)。

上述记录对应此前已发布的博客和 2D 游戏。新增 3D 游戏及 `apps/` 目录迁移仍需随本次提交构建、发布和验收；本地集成完成不代表云端已更新。正式 3D 入口是 `/projects/conway-soldiers-3d/`。

## 1. 发布方式

工作流仍名为 **Check and build**，位于 [.github/workflows/ci.yml](../.github/workflows/ci.yml)。

| 触发方式 | 行为 |
| --- | --- |
| Pull Request | 检查、测试、构建，不部署 |
| push / merge main，`AUTO_DEPLOY=true` | 检查通过后自动发布，并验证 OSS 与 CDN |
| push / merge main，`AUTO_DEPLOY` 未设置或为 `false` | 只检查、测试、构建 |
| Run workflow → main，保留 `dry_run=true` | 检查配置、获取临时凭证并预演上传；不修改 OSS，也不执行线上验收 |
| Run workflow → main，取消 `dry_run` | 实际发布，并验证 OSS 与 CDN |

首次接入用的 `verify_cdn` 开关已移除。每次真实发布都必须通过源站和 CDN 验收；预演不会被误当成已上线。

日常写作通常只需修改文章/素材、按需本地预览、提交并推送 main，然后查看 Actions 结果。若希望每次推送自动发布，确认 Repository Variable `AUTO_DEPLOY` 为字符串 `true`。它可随时设为 `false` 暂停后续 push 的自动发布，不会撤销已经开始的部署，也不会关闭线上网站；手动发布入口仍可使用。

## 2. 长期保留的配置

### Repository Variables

| 变量 | 值 / 用途 |
| --- | --- |
| `SITE_URL` | `https://nanoka.tv`；构建阶段生成 canonical、RSS 与 sitemap |
| `AUTO_DEPLOY` | `true` 开启 main 自动发布；`false` 或未设置时暂停 |

### production Environment Variables

| 变量 | 值 |
| --- | --- |
| `OSS_BUCKET` | `nanoka-blog-prod-2026` |
| `OSS_REGION` | `cn-shanghai` |
| `OSS_ENDPOINT` | `https://oss-origin.nanoka.tv` |
| `ALIBABA_OIDC_PROVIDER_ARN` | `acs:ram::1559403763150419:oidc-provider/github-actions` |
| `ALIBABA_DEPLOY_ROLE_ARN` | `acs:ram::1559403763150419:role/nanoka-blog-deployer` |
| `CDN_DOMAIN` | `nanoka.tv` |

这些变量都仍被使用，保留即可。`SITE_URL` 和 `AUTO_DEPLOY` 要放在 Repository Variables。CNAME 寻址已固定在上传脚本中，无需另设 `OSS_USE_CNAME` 或 `OSS_ADDRESSING_STYLE`。

production 环境继续限制 **Selected branches and tags → Branch → main**。凭证由 GitHub OIDC 换取 STS 临时凭证，不需要长期 AccessKey Secret。当前角色只需目标桶的 ListObjects 和目标对象的 PutObject / GetObject；不授予自动删除权限。权限策略中的资源范围是 `acs:oss:*:*:nanoka-blog-prod-2026` 及 `acs:oss:*:*:nanoka-blog-prod-2026/*`。

域名、CNAME、HTTPS 证书、CDN 回源 Host/SNI、RAM Provider/Role 都是运行依赖。DNS 中证书/域名验证记录的保留或移除，应按对应服务的续期要求处理；本次代码清理没有改动云端配置。

## 3. 发布流程与脚本职责

```text
检查 / 测试 / 生产构建 / 浏览器测试
  → 保存 dist-SHA，确认当前提交仍为 main 最新版本
  → 下载同一次运行的产物并检查配置与内容
  → 获取 STS 临时凭证
  → 哈希资源 → 固定资源 → RSS/sitemap/robots → HTML
  → 验证 OSS → 等待短缓存更新并验证 CDN
```

| 文件 | 保留原因 |
| --- | --- |
| [check-deployment.mjs](../scripts/check-deployment.mjs) | 上传前核对参数、必要产物、生产 canonical 与 noindex，拒绝异常发布 |
| [deploy-oss.sh](../scripts/deploy-oss.sh) | 分阶段上传、设置 MIME 与缓存；支持预演 |
| [verify-deployment.mjs](../scripts/verify-deployment.mjs) | GET 验证实际内容、状态、目录跳转、404、MIME 和缓存；显示 TLS/DNS 等底层错误码 |
| [report-oss-errors.mjs](../scripts/report-oss-errors.mjs) | 仅上传失败时输出并归档脱敏报告，防止 runner 结束后丢失错误详情 |

相应测试验证失败检测、超时和脱敏行为，也继续保留。一次性 OIDC claims 诊断 job 已不存在。

部署按 production 串行，不取消正在运行的 main 发布。上传前会检查 main SHA，拒绝部署已经落后的提交；遇到过时提交提示时，发起新的 Run workflow → main。

## 4. 缓存与发布结果

| 内容 | Cache-Control |
| --- | --- |
| `_astro/` 内容哈希资源 | `public, max-age=31536000, immutable` |
| HTML、固定文件名资源、游戏资源 | `public, max-age=60` |
| RSS、sitemap、robots | `public, max-age=300` |

CDN 验收最多等待约 340 秒，使用正常 URL，不加随机参数绕过缓存。当前没有自动刷新 CDN API；一般更新等待短 TTL 即可，修改缓存规则或需立即失效时可在 CDN 控制台刷新相关路径。

两个游戏的 `/play/conway-soldiers/`、`/play/conway-soldiers-3d/` 都应使用 60 秒短缓存；可将原 2D CDN 目录规则扩展为 `/play/`。需要刷新时，同时刷新受影响的 `/projects/<slug>/` 页面与 `/play/<slug>/` 资源。具体设置和可选的 3D HTTP 重定向规则见[部署指南](DEPLOYMENT_GUIDE.md#康威跳棋短链)，代码不会自动修改控制台配置。

若上传或线上验收失败，Actions 会失败；已经上传的对象不会自动回滚。按第一个失败步骤排查，再决定修复配置、重新发布或恢复上一版本。

## 5. 查看线上状态

PowerShell 中使用 GET 打印响应头并丢弃正文：

```powershell
curl.exe -sS -D - -o NUL https://nanoka.tv/
curl.exe -sS -D - -o NUL http://nanoka.tv/
curl.exe -sS -D - -o NUL https://nanoka.tv/posts/
curl.exe -sS -D - -o NUL https://nanoka.tv/posts
curl.exe -sS -D - -o NUL https://nanoka.tv/does-not-exist-check/
```

预期分别为：200 HTML、重定向到 HTTPS、200 HTML、跳转到 `/posts/`、404 HTML。源站排查时换成 `https://oss-origin.nanoka.tv`。直接请求 OSS 时，HEAD（`curl -I`）可能读到桶/目录对象的元数据，不等同于静态网站 GET；检查页面请保留上述 GET 写法。

本次 3D 集成发布后还应确认：

- 首页与作品列表同时展示两个游戏，正式页面均能加载棋盘。
- `/coso3d`、`/conways_checkers_3d/`、`/play/conway-soldiers-3d/` 最终进入 `/projects/conway-soldiers-3d/`，2D 短链仍进入 2D 页面；查询参数与 hash 在浏览器跳转后保留。
- 两个游戏说明窗口中的跨版本链接正确；3D 视角操作、跳吃、撤销与音效正常。
- 两个 `/play/<slug>/src/app.js` 返回 JavaScript，音效返回 WAV，而非误被跳转规则改成 HTML；不存在的近似短链返回 404。

未配置 CDN HTTP 规则时，短链返回 200 HTML 后自动跳转是预期行为。无尾斜杠路径沿用 OSS 目录 Redirect 配置。

如需逐字节验收，下载已部署运行的 `dist-SHA` artifact 并解压，再执行：

```powershell
node scripts/verify-deployment.mjs https://nanoka.tv 'C:\path\to\extracted-dist'
```

最后的目录参数指向直接包含 `index.html` 的目录。同一提交在 Windows 重新构建时，复制的 CSS 可能保留 CRLF，与 Linux runner 的 LF 不同；这不等于线上内容损坏。精确比较应使用实际部署的 artifact。

## 6. 失败排查

| 现象 | 先检查 |
| --- | --- |
| OIDC / STS 失败 | Provider、Role、实际 subject、production 分支限制 |
| ossutil `FinishWithError` | **Show OSS upload failure details** 日志及脱敏诊断 artifact；按 Error Code / Message / Request ID 排查 |
| OSS AccessDenied | 部署角色绑定的生效策略、桶名和对象资源范围；匿名读与角色写权限分别核对 |
| GET 失败且有 TLS 错误码 | CDN HTTPS 开关、正式域名证书及有效期；OSS 证书与 CDN 证书分别部署 |
| ENOTFOUND / EAI_AGAIN | DNS / CNAME 及解析传播 |
| 返回旧正文或错误缓存头 | 核对源站、CDN 缓存策略和实际部署 artifact；确认没有正文改写 |
| 首页正常、目录或 404 不正常 | OSS 子目录首页、Redirect、自定义 404 状态；CDN 回源 Host 与路由规则 |

脱敏上传报告只在失败时保存 7 天，不归档原始 `ossutil_output/`。正常发布不会运行这项诊断。

## 7. 归档、删除与维护

- `dist-SHA` artifact 保留 14 天，SHA256 文件清单保留 90 天。稳定版本应另存完整产物；清单不能代替网站备份。
- 默认覆盖上传、不删除远端对象，保留旧哈希资源供缓存页面使用。删除文章或改为 draft 后，旧详情页仍可能存在；按准确对象清单下线，再刷新并确认 404。
- 日常源码回退可通过 revert 后推送新提交；需要逐字节恢复历史版本时，使用已归档的完整 artifact，并审查失败版本独有页面。
- 续签证书后，分别确认 OSS 上传域名、OSS 回源域名和 CDN 证书已部署。定期查看 Actions 失败、流量与费用提醒。
- 公安备案等内容配置继续按 [发布前检查记录](PRELAUNCH_REVIEW.md) 的实际待办处理；技术部署成功不自动代表这些事项完成。
- 若需要改善海外体验，可评估 CDN 的“全球”加速；这与 HTTPS 可用性是独立事项。基础配置与官方参考链接见部署指南。
