# OpenCode Token Overlay

一个面向 macOS 的轻量 Electron 桌面悬浮窗，实时展示 OpenCode V2 当日 Token 总消耗。

## 功能

- 透明、无边框、置顶并可拖拽
- 自动发现本地 OpenCode V2 后台服务
- 通过 HTTP API 汇总当天 Token
- 订阅 `/api/event` 实时接收 Usage 更新
- 卡通怪兽吞食 Token 动画
- 显示值最高以 50,000 Token/秒追赶真实值
- 无增量时停止动画和计数

## 运行

要求：macOS、Node.js、正在运行的 OpenCode V2 服务。

```bash
npm install
npm start
```

检查 JavaScript 语法：

```bash
npm run check
```

## 数据口径

启动时通过 `/api/session` 和 `/api/session/{id}/message` 汇总本地时区当天用量，随后订阅 `/api/event` 中的 `session.usage.updated` 事件。首次加载直接显示今日基线，后续增量进入动画队列。
