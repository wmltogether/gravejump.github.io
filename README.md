# 坟头蹦迪 · GRAVE JUMP

PixiJS + TypeScript 竖屏动作游戏。绿发贝斯少女在废弃音乐厅中自动跳跃，躲避落石、雕像和十字架。

> **生成式 AI 声明**
>
> 本项目完全通过生成式人工智能（Generative AI）创作完成，涵盖游戏代码、SVG 美术、界面设计、音效实现、测试及文档。人类负责提出创意、定义需求与提供反馈，生成式 AI 负责具体实现与持续迭代。

[直接游玩](https://wmltogether.github.io/gravejump.github.io/)

## 项目结构

```text
.github/workflows/   检查与 GitHub Pages 自动部署
art/                可编辑角色 SVG 母稿
public/             页面、样式、场景与道具 SVG 源文件
src/
  engine/           纯逻辑：物理、碰撞、生成、火箭与企鹅
  input/            键盘、触屏和逐帧输入
  render/           Pixi 场景、角色层、透明故障效果
  ui/               菜单、生命、记录、竖屏布局
  audio/            合成音效
scripts/            清理、导出 SVG、构建、验证、预览
tests/             物理、输入、UI 和布局自动测试
docs/              验收记录与发布说明
 dist/              构建产物，自动生成，不手动编辑
```

`public/` 与 `src/` 是源码；`dist/` 是玩家实际访问的静态网站。角色只编辑 `art/bassist.svg`，构建会直接向 `dist/` 导出完整 SVG 和三个动画层，不再生成重复的 `public/bassist*.svg`。

## 本地开发

需要 Node.js 24。

```sh
npm ci
npm run dev
```

`dev` 先构建，再启动 `http://127.0.0.1:4174`。修改源码后运行 `npm run build` 并刷新。其他命令：

- `npm run check`：严格类型检查、77 项测试、构建与资源验证。
- `npm run build`：清理并重新生成 `dist/`。
- `npm run clean`：只清空可再生的 `dist/` 内容，保留源码与依赖。
- `npm run format`：格式化 TypeScript、HTML 和 CSS。

## 游戏规则

- 自动跳跃始终开启。← → / A D 移动；Space / ↑ / W 手动起跳；P / Esc 暂停。触屏按住画布左右半边移动。
- 触屏长按持续移动，滑过中线切换方向；松手、触摸取消或切到后台清除输入。游戏视口禁用文本选中、系统长按菜单、图片拖拽和触摸滚动，支持多指及旧版 Touch Events。
- 五心生命；黄瓜恢复一心，满血同样消耗；火箭加速飞行三秒，期间免疫所有石头，仍可左右移动。
- 蓝色企鹅会投石，命中扣一心；从上方下落踩中可击败并弹起。
- 发光金星从第 12 层开始，每隔 30 层出现。拾取后清除屏内企鹅及它们的投石、立即回满五心，并在 10 秒内阻止新企鹅生成或进入画面；暂停冻结倒计时，再次拾取刷新为 10 秒。
- 每十层累积音乐画面。落石使用白色轮廓，受伤使用透明局部故障条。
- 固定 120 Hz 物理，150 ms 跳跃缓冲、110 ms 土狼时间、连续碰撞；支持 3:4 至 9:20 竖屏，适配 Safari 可见高度与安全区。

## 发布

向 `main` 推送后，Actions 自动执行 `npm ci` → `npm run check` → 部署 `dist/`。玩家打开 Pages 地址即可开始游戏，不需要安装 Node.js 或登录账号。PR 只检查，不部署。

仓库不提交 `node_modules/`、`dist/`、旧发布包或临时预览。说明见 [GitHub Pages 部署](docs/DEPLOYMENT.md)，测试与实机验证边界见 [QA](docs/QA.md)。
