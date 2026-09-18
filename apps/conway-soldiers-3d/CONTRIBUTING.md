# 贡献说明

感谢你帮助改进三维康威跳棋。项目的唯一源码维护入口是 [Nanoka42/nnk-blog 的 apps/conway-soldiers-3d/](https://github.com/Nanoka42/nnk-blog/tree/main/apps/conway-soldiers-3d)。独立仓库 `Nanoka42/conway-soldiers-3d` 用于单独展示、克隆和发布，其 `main` 由维护者通过 Git subtree 从博客单向同步，目前没有自动同步工作流。

## 反馈问题

请在[博客仓库的 Issues](https://github.com/Nanoka42/nnk-blog/issues) 中反馈，并在标题中标注 `[conway-soldiers-3d]`。尽量附上复现步骤、浏览器和设备、预期与实际表现；规则或空间交互问题可以附上棋子坐标、走棋顺序，以及当时使用的 XZ / XY 工作面。

## 提交代码

1. Fork [博客仓库](https://github.com/Nanoka42/nnk-blog)，在自己的开发分支工作。
2. 修改博客中的 `apps/conway-soldiers-3d/`；游戏代码、测试和本目录的说明文档都在这里维护。
3. 运行下面的检查，并在浏览器中确认受影响的操作。
4. 向 **`Nanoka42/nnk-blog` 的 `main`** 提交 Pull Request，在说明中写明改动目的、验证方式，以及是否影响二维版本或博客集成。

请把修改提交到博客仓库，维护者合并后会同步到独立仓库。如果你已经在独立克隆中做了修改，可以把相关文件的改动应用到博客的 `apps/conway-soldiers-3d/` 后再提交 PR。不要直接向独立仓库的 `main` 添加提交，否则后续单向同步可能发生分叉。

## 本地运行与检查

推荐 Node.js **24 或更新版本**；单独运行本游戏最低需要 Node.js **20.11**。从博客仓库根目录进入游戏目录：

```powershell
cd apps/conway-soldiers-3d
npm test
npm run build
npm run preview
```

本游戏没有第三方运行依赖，不需要在游戏目录执行 `npm install`。如果你只是克隆独立游戏仓库，直接从其根目录执行上面的三个 `npm` 命令，省略 `cd`。

- `npm test` 只运行三维游戏的 Node 测试。
- `npm run build` 清空并重新生成游戏目录内的 `dist/`。
- `npm run preview` 启动本地 HTTP 服务，预览 `dist/`；打开终端打印的地址，按 `Ctrl+C` 停止。
- 开发时可用 `npm run dev` 直接运行源码；如有同端口的服务，请先停止它，再启动预览。

对布局、交互或声音的修改，还需要在浏览器手动验证；涉及工作面的修改应检查 XZ / XY 切换、选子、跨层跳跃和撤回。Node 测试不能代替浏览器和真机检查。不要直接编辑或提交 `dist/` 等生成内容。涉及博客集成时，按[博客仓库说明](https://github.com/Nanoka42/nnk-blog/blob/main/README.md) 完成对应检查。

## 素材与维护者操作

请保留 README 中的素材署名。新增或替换图标、音效等资源时，应说明来源和使用条件；仓库可公开访问并不自动代表所有素材均可任意使用。

首次发布、日常同步和故障处理由维护者按[发布与维护手册](https://github.com/Nanoka42/nnk-blog/blob/main/docs/CONWAY_APPS_PUBLISHING_GUIDE.md) 操作。普通贡献者无需执行 subtree 同步或部署。
