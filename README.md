# Virtual Camera (Fixed Image)

一个 Chrome 扩展：把网页 `getUserMedia` 摄像头流替换为一张固定图片，常用于在线会议、招聘面试、远程办公等场景下规避真实摄像头出图。

## 支持的素材类型

| 类型 | 状态 | 说明 |
| --- | --- | --- |
| 图片 | ✅ 已支持 | 支持 PNG / JPEG / WebP / GIF（仅首帧）等浏览器可解码的静态图片格式。超过 1920px 的边长会自动按比例压缩为 JPEG，再按目标分辨率等比居中并以黑边填充输出 |
| 视频 | ⏳ 未支持 | 计划支持本地视频文件（MP4 / WebM 等）作为循环播放的虚拟摄像头源，当前版本暂未提供 |

## 功能特性

- 把任意网页通过 `navigator.mediaDevices.getUserMedia` 请求到的视频流替换为本地图片
- 自动按目标分辨率等比居中，黑边填充，避免拉伸变形
- 支持自定义分辨率（640×480 / 1280×720 / 1920×1080 / 跟随原图）和帧率（15 / 24 / 30 / 60 fps）
- 图片历史：最近 10 张已选图片自动保留，可通过 `‹` / `›` 或键盘 `←` / `→` 切换
- 音频轨道透传：若页面同时请求音频，会调用真实麦克风并合并到虚拟流中
- 兼容 `enumerateDevices`：当系统无视频输入时，注入一个名为 `Virtual Camera (Fixed Image)` 的虚拟设备

## 安装

1. 克隆或下载本仓库到本地
2. 打开 Chrome，访问 `chrome://extensions`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目根目录
5. 扩展图标出现在工具栏后即可使用

## 使用

1. 点击工具栏的扩展图标打开 popup
2. 点击「选择图片」，可单选或多选本地图片（自动加入历史）
3. 顶部开关切换到「开启」状态
4. **刷新目标页面**（重要：注入需要在页面加载时生效）
5. 在页面里触发摄像头调用（视频会议、`getUserMedia` 测试页等），即可看到固定图片画面

### Popup 控件

| 控件 | 行为 |
| --- | --- |
| 顶部开关 | 全局启停虚拟摄像头 |
| `‹` / `›` | 在历史图片之间循环切换（最多 10 张） |
| `← / →` 键 | 等同于上一张/下一张按钮 |
| 计数器 `i / n` | 当前图片序号 / 历史总数 |
| 选择图片 | 添加新图片到历史；超出 10 张自动淘汰最早一张 |
| 删除当前 | 从历史中移除当前图片，自动切到相邻图片 |
| 清空全部 | 清除所有历史图片 |
| 分辨率 | 输出画布尺寸；`跟随图片` 使用图片本身分辨率 |
| 帧率 | 重绘频率（受浏览器 `requestAnimationFrame`/`setInterval` 调度影响） |

## 项目结构

```
virtual-uvc-extension/
├── manifest.json          # MV3 清单，声明 storage / unlimitedStorage 权限和内容脚本
├── popup/
│   ├── popup.html         # 扩展弹窗 UI
│   ├── popup.css          # 弹窗样式
│   └── popup.js           # 图片历史管理 + 持久化逻辑
└── src/
    ├── bridge.js          # ISOLATED world：监听 chrome.storage 变化，postMessage 给 inject.js
    └── inject.js          # MAIN world：劫持 mediaDevices.getUserMedia / enumerateDevices
```

## 工作原理

1. `popup.js` 把图片读成 dataURL（超过 1920px 自动按比例压缩为 JPEG），写入 `chrome.storage.local`
2. `bridge.js` 运行在 ISOLATED world，能访问 `chrome.storage`；监听存储变化后通过 `window.postMessage` 把最新状态发到页面
3. `inject.js` 运行在 MAIN world，可重写页面的 `navigator.mediaDevices.getUserMedia`：
   - 在内存中创建 `<canvas>`，按目标分辨率把图片等比绘制并填充黑边
   - 用 `canvas.captureStream(frameRate)` 拿到 `MediaStream`
   - 如果约束里同时请求了 `audio: true`，回退到原生 `getUserMedia` 取真实音轨并合并到流中
   - track 调用 `stop()` 时清理重绘 `setInterval`

## 已知限制

- 必须 **刷新目标页面** 后劫持才会生效（内容脚本在 `document_start` 注入）
- 部分严格 CSP 站点可能阻止 `MAIN world` 注入，此时无法生效
- `dataURL` 存储在 `chrome.storage.local`，已声明 `unlimitedStorage` 权限；但大图叠加多张历史仍会占空间，必要时点「清空全部」
- 不支持视频文件，仅支持静态图片

## 调试

- 打开 `chrome://extensions` → 找到本扩展 → 点「检查视图：popup.html」调试弹窗
- 在目标页面打开 DevTools，Console 里若出现 `[VirtualCamera] failed to build virtual stream` 之类警告说明虚拟流构造失败、已回退到真实摄像头

## License

MIT
