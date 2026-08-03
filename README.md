# Comic Reader

一个纯前端实现的单页面漫画阅读器，基于 **Vue 3 + Vite**，支持拖入文件夹 / ZIP 导入图片、纵向 / 横向 / 右左三种阅读模式、鼠标拖拽与触屏手势、虚拟渲染性能优化，并带有弹幕系统。

## 功能

- **拖拽导入**：将文件夹或 ZIP 压缩包拖入页面即可打开其中的图片，无需上传
  - 支持通过按钮选择文件夹（`webkitdirectory`）或 ZIP 文件
  - ZIP 使用 [JSZip](https://stuk.github.io/jszip/) 在浏览器内解压
  - 文件夹 / ZIP 内的弹幕 JSON 会被自动识别并加载（优先自动打开名称带 `danmaku` / `弹幕` 的 JSON 文件）
- **图片格式支持**
  - 位图格式：`.jpg` / `.jpeg` / `.png` / `.gif` / `.webp` / `.bmp` / `.avif` / `.ico`
  - 按文件名自然排序（`1.jpg, 2.jpg, 10.jpg`），非图片文件自动跳过
- **三种阅读模式**
  - **纵向阅读**：图片自上而下纵向排列，连续滚动浏览（Webtoon 卷轴式）
  - **横向阅读**：图片自左向右横向排列，连续滚动浏览（条带式）
  - **右左阅读**：图片自右向左横向排列（右侧起页，适配日式漫画阅读习惯）
  - 切换模式自动回到当前页，进度按模式记忆
- **鼠标 / 触屏交互**
  - 鼠标按住拖拽即可滚动页面（自动切换抓取光标）
  - 横向 / 右左模式下点击页面左 / 右三分之一区域翻页
  - 滚轮在横向模式下直接驱动横向滚动
- **平板模式**（工具栏可开关）
  - 拖拽松手后带惯性滑动（含阻尼衰减）
  - 双指捏合缩放（0.5× – 3×）
  - 横向模式滚轮带惯性滚动
- **弹幕系统 v2**：漫画页面上方叠加快可开关弹幕层，每张图片拥有独立弹幕池，弹幕横向滚动并循环回收，轨道无重叠、视口感知暂停（见下文格式）
- **性能优化**
  - 虚拟渲染（Virtualization）：仅渲染视口附近 ±1.5 屏的页面节点，支持超长漫画
  - 图片懒加载：`blob` URL 按需创建、移出视口后延迟 `revokeObjectURL` 释放
  - 导入阶段：`Image` 解码使用并发池（默认 4 并发），进度条实时反馈，不阻塞 UI
  - 滚动、缩放动画使用 `requestAnimationFrame` 驱动，弹幕由 Web Animations API（合成器线程）处理，避免主线程卡顿
  - 缩放时以视口中心为锚点平滑过渡，保证阅读位置不漂移
- **阅读工具栏**
  - 「远程」：打开远程来源对话框（Manifest / WebDAV）；「弹幕」：单独导入弹幕 JSON
  - 模式切换（纵向 / 横向 / 右左）、页码跳转
  - 缩放：放大 / 缩小 / 适应宽度 / 适应高度
  - 自动裁边开关、弹幕开关、透明度滑杆、速度调节（0.5× – 2×）
  - 平板模式开关、「设置」按钮（渲染 / 快捷键 / OCR 分页）
  - 工具栏可整体收起为右上角浮动按钮（10 秒无操作自动淡化）
- **快捷键**
  - `←` / `→` / `↑` / `↓`：横向 / 右左模式翻页，纵向模式上下滚动
  - `Space`：下一页；`PageUp` / `PageDown`：滚动一屏
  - `Home` / `End`：首页 / 末页；`D`：弹幕开关；`F`：全屏
- **阅读进度记忆**：自动记录当前位置与模式（`localStorage`，500ms 节流），下次打开同一漫画自动恢复
- **智能裁边**：导入时逐页分析四周白 / 黑边并记录裁剪矩形，渲染用 `clip-path` 无损裁掉，可开关（工具栏 / 快捷键 / 设置）
- **最大渲染尺寸限制**：导入阶段将长边超上限的图片等比缩小并重新编码（JPEG，带透明通道转 PNG），降低解码与渲染开销，重新导入后生效
- **摩尔纹去噪**：WebGL1 双边滤波（空间 × 亮度差双权重），保留线条锐度同时抹平印刷网点，可见页按需处理并缓存复用，不阻塞滚动
- **自定义快捷键**：工具栏「设置 → 快捷键」为每个动作绑定任意组合键（Ctrl / Alt / Shift / Meta 前缀），Enter 确认、Esc 取消、冲突检测、可恢复默认
- **远程 URL 加载**：支持 Manifest JSON 与 WebDAV 目录两种远程来源（需对方开启 CORS），远程页 URL 直读、不建 blob 缓存（见「远程来源」）
- **云端 OCR 文本叠加**：Azure AI Vision Read / 自定义 JSON 端点，进入视口的页面自动识别并叠加文本包围盒，支持开关与配置（见「设置项」）

## 开发运行

```bash
npm install
npm run dev       # 开发调试 http://localhost:5173
npm run build     # 产物输出到 dist/
npm run preview   # 预览构建产物
```

## 重要规则

> 本项目所在机器的 `npm` / `node` 环境不可用（安装异常，无法由 AI 直接执行）。
> 任何需要用到 npm / node 的操作（如 `npm install`、`npm run dev`、`npm run build`、`npm run preview` 等），
> 必须提醒用户**手动执行**，AI 不得自行运行 npm / node 相关命令。

## 目录结构

```
comicreader/
├── index.html
├── vite.config.js
└── src/
    ├── main.js              # 入口
    ├── App.vue              # 布局、全局拖拽、加载层、Toast
    ├── store.js             # 响应式状态：导入、模式、缩放、弹幕、平板模式、进度记忆
    ├── style.css            # 全局样式与主题变量
    ├── lib/
    │   ├── importer.js      # 文件夹递归遍历、ZIP 解压、图片尺寸提取、最大尺寸缩小、自然排序
    │   ├── danmakuParser.js # 通用弹幕格式解析（规范见 spec_danmaku.json）
    │   ├── modes.js         # 阅读模式常量
    │   ├── cropDetect.js    # 智能裁边：白 / 黑边检测，返回裁剪矩形
    │   ├── moireFilter.js   # 摩尔纹去噪：WebGL1 双边滤波
    │   ├── moireCache.js    # 去网纹结果缓存（按 page.key，延迟 revoke）
    │   ├── blobUrlCache.js  # blob URL 缓存与延迟释放
    │   ├── keybindings.js   # 快捷键动作注册表、组合键序列化与分发
    │   ├── settings.js      # 统一设置存储（裁边 / 摩尔纹 / 最大尺寸 / OCR / 快捷键）
    │   ├── uiState.js       # 全局 UI 状态（对话框、工具栏收起）
    │   ├── remoteSource.js  # 远程来源：Manifest JSON / WebDAV PROPFIND 解析
    │   └── ocr/
    │       ├── ocrConfig.js    # OCR provider 配置与持久化
    │       ├── ocrAzure.js     # Azure AI Vision Read 4.0 适配
    │       ├── ocrGeneric.js   # 自定义 JSON 端点适配
    │       └── ocrClient.js    # OCR 客户端：分析图生成、缓存、单并发限流
    ├── types/
    │   └── danmaku.ts       # 弹幕数据模型（DanmakuItem 等）
    ├── composables/
    │   ├── useGestureScroll.js      # 拖拽 / 惯性滚动
    │   ├── usePinch.js              # 双指缩放
    │   ├── useStripLayout.js        # 虚拟滚动布局
    │   ├── useTrackScheduler.ts     # 弹幕轨道调度（无重叠）
    │   ├── useRandomScheduler.ts    # 弹幕随机发射（指数分布 / 突发）
    │   └── useVisibilityControl.ts  # 弹幕视口感知（IntersectionObserver）
    ├── utils/
    │   ├── measureText.ts        # 弹幕文本宽度测量（OffscreenCanvas）
    │   └── danmakuHelpers.ts     # 弹幕数据转换 / 随机回收
    └── components/
        ├── Toolbar.vue      # 工具栏（含收起 / 浮动按钮，打开远程 / 设置）
        ├── DropZone.vue     # 拖放提示区 / 拖放遮罩
        ├── FilePicker.vue   # 隐藏文件选择器（文件夹 / ZIP / 弹幕 JSON）
        ├── ReaderView.vue   # 阅读器容器、键盘与点击翻页（快捷键查表分发）
        ├── VirtualStrip.vue # 虚拟滚动核心（纵向 / 横向 / 右左复用）+ 拖拽 / 惯性 / 双指缩放 / Ctrl+滚轮单图缩放
        ├── PageSlot.vue     # 单页节点：图片懒加载、URL 生命周期、裁边、去网纹、OCR 叠加、弹幕挂载
        ├── DanmakuLayer.vue # 弹幕层 v2：独立弹幕池 + WAAPI 动画 + 自动回收
        ├── SettingsDialog.vue # 设置对话框（渲染 / 快捷键 / OCR 三个分页）
        └── RemoteDialog.vue # 远程来源对话框（Manifest / WebDAV）
```

## 弹幕文件格式

弹幕数据为一个独立 JSON 文件，遵循**通用弹幕格式**（完整规范见 `spec_danmaku.json`），可随文件夹 / ZIP 一起拖入（自动加载），或通过工具栏「弹幕」按钮单独选择：

```json
{
  "format": "comic-danmaku",
  "version": 1,
  "danmaku": [
    {
      "page": 1,
      "text": "哈哈哈哈哈哈",
      "color": "#ff5722"
    },
    {
      "page": 2,
      "text": "泪目"
    }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |
| `page` | number | 是 | 所属页码（从 1 开始） |
| `text` | string | 是 | 弹幕内容 |
| `color` | string | 否 | 文字颜色，默认白色 |
| `size` | string | 否 | `small` / `normal` / `large`，默认 `normal` |
| `fontSize` | number | 否 | 直接指定字号（像素），优先于 `size` |
| `position` | string | 否 | `scroll`（滚动）/ `top`（顶部固定）/ `bottom`（底部固定），默认 `scroll` |
| `weight` | string | 否 | 字重，默认 `bold` |
| `shadow` | string | 否 | 文字阴影，默认 `0 0 4px rgba(0,0,0,0.8)` |
| `extra` | object | 否 | 源特有属性扩展容器，解析器保留但不解析其内容 |

体积约定：除 `page` / `text` 外均为可选字段，省略即使用默认值；为空的可选对象（如 `meta` / `extra`）整体省略。转换器输出省略默认值字段并压缩为单行 JSON，以最小化文件体积。

可扩展性约定：未知字段一律忽略，解析失败仅丢弃无效条目（`page` 非 ≥1 整数或 `text` 为空），`format` / `version` 用于格式标识与版本兼容；多来源弹幕可由转换工具统一转换为本格式。详见 `spec_danmaku.json`。

行为约定（v2）：

- 弹幕仅在纵向阅读模式下显示
- 每张图片拥有**独立弹幕池**：弹幕从池中取出发射，移出屏幕后自动回收进池尾（随机位置插入打乱顺序），循环播放，无需外部补充
- 轨道防重叠：轨道数 = 图片高度 / 字号，同一时刻同一轨道最多一条弹幕；发射间隔服从指数分布，支持突发模式（默认概率 0.25）
- 数量补足：当某页弹幕数量少于轨道数时，自动按倍数复制弹幕池（`ceil(轨道数/数量)`），避免弹幕过于稀疏
- 弹幕层 `pointer-events: none`，不干扰阅读交互；弹幕随页面一起滚动，不固定在视口
- 视口感知：使用 `IntersectionObserver`（可见比例 ≥ 10% 视为可见），图片离开视口即暂停发射与动画，节省 CPU
- 后台暂停：标签页隐藏（`visibilitychange`）时自动暂停所有弹幕发射与动画，切回前台自动恢复
- `position`（顶部 / 底部固定）字段在 v2 中不再区分，统一按滚动弹幕播放

## 技术方案

| 模块 | 方案 |
| ---- | ---- |
| 框架 | Vue 3（Composition API + `<script setup>`）+ Vite 6 |
| 图片加载 | `URL.createObjectURL()` 本地预览，按需创建 / 延迟释放 |
| ZIP 解压 | JSZip（npm 依赖） |
| 文件夹选择 | `webkitdirectory` 属性 + 拖拽 `webkitGetAsEntry()` 递归遍历 |
| 虚拟渲染 | 绝对定位 + 前缀和布局 + 二分查找视口区间（含右左模式的反向前缀和） |
| 拖拽 / 惯性 | Pointer Events + `requestAnimationFrame` 惯性衰减 |
| 双指缩放 | Touch Events 距离比映射缩放值 |
| 弹幕渲染 | DOM + Web Animations API（`translateX` 合成器动画）+ 独立对象池回收 |
| 弹幕调度 | 指数分布随机发射 + 无重叠轨道调度 + IntersectionObserver 视口感知 |
| 智能裁边 | 导入时缩略图采样四角与边行 / 列纯色检测，渲染期 `clip-path: inset()` |
| 摩尔纹去噪 | WebGL1 双边滤波 shader（空间 × 范围高斯），可见页按需处理 + 缓存复用 |
| 最大渲染尺寸 | 导入阶段 canvas 等比缩小重编码（透明通道保留 PNG），仅约束长边 |
| 快捷键 | `e.code` 序列化（Ctrl / Alt / Shift / Meta）+ localStorage 持久化查表分发 |
| 远程来源 | `index.json` Manifest 或 WebDAV `PROPFIND`（`Depth:1`）解析，URL 直读 |
| OCR | 生成分析图（长边 ≤2000 JPEG）→ Azure Read 4.0 / 自定义端点 → 归一化包围盒叠加 |
| 进度记忆 | `localStorage`（key 为漫画标题） |

## 待办（Roadmap）

- [x] 页面骨架与拖拽导入（文件夹 / ZIP / 弹幕 JSON）
- [x] 图片列表解析与自然排序
- [x] 纵向 / 横向 / 右左虚拟滚动阅读
- [x] 缩放与快捷键
- [x] 弹幕解析、计时调度与开关
- [x] 阅读进度记忆
- [x] 鼠标拖拽滚动与平板模式（惯性、双指缩放）
- [x] 自定义快捷键（工具栏「设置」→ 快捷键）
- [x] 智能裁边（白 / 黑边，导入时分析）
- [x] Ctrl + 滚轮以光标为锚点缩放
- [x] 远程 URL 加载（Manifest JSON / WebDAV）
- [x] 最大渲染尺寸限制 + 摩尔纹去噪（WebGL 双边滤波）
- [x] 云端 OCR 文本叠加（Azure / 自定义端点）
- [ ] 横向模式下按页预取 / 翻页式单页模式
- [ ] 支持 `.rar` / `.cbz` 等更多格式
- [ ] 弹幕字幕（.ass / .srt）导入

## 设置项（工具栏「设置」按钮）

- **渲染**：最大渲染尺寸（重新导入后生效）、摩尔纹开关与强度、自动裁边开关
- **快捷键**：为每个动作绑定任意组合键（Ctrl / Alt / Shift / Meta 前缀），Enter 确认、Esc 取消，可一键恢复默认
- **OCR**：选择服务商（Azure AI Vision Read / 自定义 JSON 端点）、填 Endpoint 与 API Key（仅存本机 localStorage），开启后进入视口的页面自动识别

## 远程来源（工具栏「远程」按钮）

两种来源，均要求对方服务器开启 CORS：

1. **Manifest JSON**（推荐）：目录下提供 `index.json`
   ```json
   {
     "title": "漫画名",
     "pages": [
       { "url": "001.jpg", "w": 900, "h": 1270 },
       { "name": "002.jpg" }
     ]
   }
   ```
   `url` / `name` 的相对路径以目录 URL 解析为绝对地址；`w` / `h` 可省略，加载后自动回填。

2. **WebDAV 目录**：输入目录 URL，客户端发 `PROPFIND`（`Depth:1`）解析 `href`，按图片扩展名过滤并自然排序。

远程页走 URL 直读（不创建 blob URL、不缓存不 revoke），阅读位置同样记录在 `localStorage`。
