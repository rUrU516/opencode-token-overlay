# OpenCode Token Overlay

一个面向 macOS 的轻量 Electron 桌面悬浮窗，实时展示 OpenCode V2 当日 Token 总消耗。

<p align="center">
  <img src="assets/opencode-token-overlay-demo.gif" alt="OpenCode Token Overlay 动效预览" width="536" />
  <br />
  <sub>演示数据仅用于展示动画；正式运行时只显示 OpenCode V2 返回的真实 Usage。</sub>
</p>

## 功能

- 透明、无边框、置顶并可拖拽
- 自动发现本地 OpenCode V2 后台服务
- 通过 HTTP API 汇总当天 Token
- 订阅 `/api/event` 实时接收 Usage 更新
- 1980 年代街机像素 HUD、随机主题色、呼吸和爆满动画
- 每 100,000 Token 填满一轮进度条
- 显示值最高以 10,000 Token/秒追赶真实值
- 右上角显示当天缓存命中率
- 火柴跑者跟随真实进度奔跑，满条后被风吹回起点
- 正常增长时显示随机风线、像素木屑与命中火花
- 可直接回答 Question，并审批 `ONCE / ALWAYS / REJECT` Permission

## 源码安装

要求：

- macOS
- Node.js 22.12.0 或更高版本
- 已安装并运行过 OpenCode V2

```bash
git clone https://github.com/rUrU516/opencode-token-overlay.git
cd opencode-token-overlay
npm ci
npm run launch
```

`npm run launch` 会将悬浮窗作为独立后台进程启动，终端可以直接关闭。重复执行不会创建第二个实例。

前台调试运行：

```bash
npm start
```

将鼠标移到悬浮窗上，点击左下角出现的 `×` 可以退出。

也可以在仓库目录执行：

```bash
npm run stop
npm run restart
```

## 更新

在仓库目录执行：

```bash
git pull --ff-only
npm ci
npm run restart
```

## 排查

如果 HUD 变灰，先检查 OpenCode V2 后台服务：

```bash
opencode2 service status
opencode2 api get /api/health
```

必要时重启服务：

```bash
opencode2 service restart
```

检查悬浮窗 JavaScript：

```bash
npm run check
```

## 数据口径

启动时通过 `/api/session` 和 `/api/session/{id}/message` 汇总本地时区当天用量，随后订阅 `/api/event` 中的 `session.usage.updated` 事件。首次加载直接显示今日基线，后续增量进入动画队列。

当天缓存命中率按提示词缓存的通用口径计算：

```text
cache read / (input + cache read + cache write)
```

普通输入和缓存写入均属于本次没有直接命中缓存的输入 Token；输出与推理 Token 不参与计算。
