# GitHub Pages 部署

仓库：https://github.com/wmltogether/gravejump.github.io

默认游戏地址：https://wmltogether.github.io/gravejump.github.io/

这是项目站点；仓库名虽然带 `.github.io`，并不等于账号站点 `wmltogether.github.io`。保留地址末尾斜杠，所有脚本、样式及 SVG 都使用相对路径，支持此项目子路径。

## 发布流程

1. 仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**。
2. 推送源码到 `main`，或手动运行 `Deploy game to GitHub Pages`。
3. build job 安装锁定依赖，运行严格检查和测试，再从 SVG/TypeScript 生成干净的 `dist/`。
4. 上传 `dist/` 为 Pages artifact，由 deploy job 发布。只有 deploy job 拥有 `pages: write`、`id-token: write` 权限。
5. Actions 成功后，打开部署环境给出的 URL。玩家仅下载静态 HTML/CSS/JS/SVG，不需要运行构建命令。

工作流：`.github/workflows/pages.yml`。PR 检查：`.github/workflows/check.yml`。Node 主版本由 `.node-version` 统一指定。

## 目录约定

- 游戏源码与母稿提交 Git；构建产物 `dist/` 不提交。
- 不将工程源码、依赖目录、旧压缩包或 Sites 托管配置作为 Pages artifact。
- 资源地址保持相对路径，避免 `/app.js` 或 `/rocket.svg` 指向域名根目录。
- 不需要服务器、数据库、密钥或额外后端。最高纪录保存在玩家浏览器本地；音效需用户主动开启。
- 当前 `dev` 是构建后静态预览，不提供热重载；修改后重新构建和刷新。

官方参考：[自定义 GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
