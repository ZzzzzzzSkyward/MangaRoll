# Comic Reader — 功能扩展蓝图 (Blueprint)

> 依据 README 与现有源码（importer.js / store.js / ReaderView.vue / VirtualStrip.vue /
> PageSlot.vue / Toolbar.vue / useStripLayout.js 等）梳理的四个功能扩展计划。
> 状态：已确认方案，待实施。

## 约束与前置

- 本机 `npm` / `node` 环境不可用（README「重要规则」）：依赖安装与构建必须由用户**手动执行**。
- 新增依赖后用户需执行：`npm install`，构建验证：`npm run dev` / `npm run build`。
- 技术栈：Vue 3 (Composition API + `<script setup>`) + Vite 6；所有新模块沿用现有
  纯前端、本地优先、无构建期 Node 插件依赖的风格。

---

## 功能 1：漫画专用格式 CBZ / CBR / CB7 / PDF

**新增依赖**：`libarchivejs`（RAR / 7z 解压，浏览器 WASM）、`pdfjs-dist`（PDF 渲染）。
ZIP / CBZ 继续使用现有 JSZip（CBZ 即 ZIP 改名，只需扩展识别）。

**导入分发链路**（`store.js:handleEntries` 按扩展名分流）：
| 扩展名 | 处理模块 | 说明 |
| ---- | ---- | ---- |
| `.zip` / `.cbz` | 现有 `unzip()` (JSZip) | 不变，仅扩展识别 |
| `.cbr` / `.cb7` / `.7z` | 新增 `unarchiveArchive()` (libarchivejs) | 解压出图片条目 |
| `.pdf` | 新增 `extractPdf()` (pdfjs-dist) | 逐页渲染为 JPEG 条目 |
| 文件夹 | 现有 walkItems | 不变 |

**文件改动**：
- `src/lib/importer.js`：新增 `isComicArchive(name)`、`isPdf(name)`；
  新增 `unarchiveArchive(file, onProgress)`（libarchive 打开 → 过滤图片 → `extractFile()`
  产 blob，复用 unzip 的进度与过滤逻辑）；
  新增 `extractPdf(file, onProgress)`（`getDocument` → 逐页 canvas 渲染，长边 ≤2000px，
  `canvas.toBlob('image/jpeg')` 输出 `page_001.jpg` 等，逐页回报进度，并发 1–2 防内存暴涨）。
- `vite.config.js` / 入口：worker 静态资源 ——
  `pdfjs-dist`：`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`；
  `libarchivejs`：`import workerUrl from 'libarchive.js/dist/worker-bundle.js?url'`，
  Vite 自动拷贝至产物。
- `src/store.js:handleEntries`：按扩展名分流，加载文案区分（解压中… / 解析 PDF 中…）；
  标题取文件名去扩展名；仅取第一个匹配的档案文件（沿用现有策略）。
- `src/components/FilePicker.vue`：accept 扩为 `.zip,.cbz,.cbr,.cb7,.7z,.pdf`。
- `src/components/Toolbar.vue`：按钮「ZIP」改「档案」，或新增「PDF」独立按钮。

**边界**：PDF 一页 = 一漫画页，按页序输出；超长 PDF 关注内存与进度反馈（池化渲染）。

---

## 功能 2：智能裁剪白/黑边

**方案**：无损 —— 导入时分析一次，记录每页裁剪矩形 `p.crop`；渲染时用 CSS `clip-path`
裁掉，可开关、不重新编码。

**文件改动**：
- 新增 `src/lib/cropDetect.js`：
  - `detectCrop(blob)`：绘制缩略 canvas（长边 ≤512）读取像素；背景类型按平均亮度判定
    （≥230 白 / ≤15 黑，阈值可配）；「边行/列 ≥95% 像素为纯色」判定为空白边，从四边向内收缩。
  - 返回自然像素坐标 `{ top, right, bottom, left }`；整页纯色返回 `null`（不裁剪）。
- `src/lib/importer.js`：在 `readDims` / `extractDims` 同一 worker 线程内顺带计算 crop
  （复用解码位图，不额外解码），写入 `p.crop`。
- `src/store.js`：新增 `state.cropEnabled`（默认 false，localStorage 记忆）+ `toggleCrop()`。
- `src/composables/useStripLayout.js`：新增 `getCrop: () => state.cropEnabled` getter 并纳入
  `layout` computed 依赖；尺寸改用有效边 `pw = p.w - l - r`、`ph = p.h - t - b`。
- `src/components/PageSlot.vue`：开启时对 img 应用 `clip-path: inset(t r b l)`，
  缩放系数 `scaleX = 槽宽 / 裁剪宽`（含 object-fit contain 换算），裁剪内容与槽精确贴合。
- `src/components/Toolbar.vue`：新增「自动裁边」开关按钮。

**边界**：防裁没（整页纯色跳过）；开关切换触发布局重算与当前页位置保持。

---

## 功能 3：高度自定义快捷键

**文件改动**：
- 新增 `src/lib/keybindings.js`：
  - 动作注册表：`nextPage / prevPage / scrollDown / scrollUp / goStart / goEnd /
    toggleDanmaku / toggleFullscreen / zoomIn / zoomOut / fitWidth / fitHeight /
    toggleTablet / toggleCrop / cycleMode / toggleToolbar / toggleOCR`，各带默认键。
  - `normalizeKey(e)` 序列化（含 Ctrl/Alt/Shift/Meta 前缀，如 `Shift+D`）；
    `resolveAction(key)` 查表分发；`load/saveKeybindings()` 持久化到 localStorage `comicreader:keys`。
- `src/components/ReaderView.vue`：删除硬编码 switch，改为查表分发；保留
  打字输入（INPUT / TEXTAREA / SELECT）时跳过快捷键的逻辑。
- `src/store.js`：补充 `cycleMode()`，复用 `toggleCrop` / `toggleOCR` 等动作。
- 新增 `src/components/Keybindings.vue`（模态，Toolbar「快捷键」按钮打开）：
  动作列表 + 当前键展示；点击捕获新键（提示组合键，Enter 确认、Esc 取消、
  冲突检测提示）；「恢复默认」按钮。

**边界**：捕获面板打开时全局屏蔽快捷键分发；纯修饰键不可单独绑定；
判定基于 `e.code` 以避免输入法组合干扰。

---

## 功能 4：云端 OCR（日文气泡文本叠加）

**已确认方案**：云端 OCR API + 整页识别 + 文本包围盒叠加（不做气泡 CV 检测）。

**文件改动**：
- 新增 `src/lib/ocr/ocrConfig.js`：provider 配置 `{ type, apiKey, endpoint }`，
  localStorage 持久化；`ocrEnabled` 全局开关。
- 新增 `src/lib/ocr/ocrAzure.js`：Azure AI Vision Read 4.0 ——
  `POST {endpoint}/computervision/read:analyze?language=ja` → 轮询结果 →
  `lines[].text + polygon` 包围盒；浏览器直连（CORS 支持，key 放请求头）。
- 新增 `src/lib/ocr/ocrGeneric.js`：自定义 JSON 端点适配器（返回
  `[{ text, x, y, w, h }]`，分析图坐标），预留 Google Vision（经自定义代理）扩展接口。
- 新增 `src/lib/ocr/ocrClient.js`：`runOcr(page)` —— 生成分析图（长边 2000px JPEG）→
  调 provider → 归一化为自然像素包围盒；内存 `Map` 按 `page.key` 缓存，避免重复请求。
- `src/store.js`：新增 `state.ocrEnabled` / `state.ocrBusy` / `state.ocrConfig`；
  页面对象 `p.ocr` 存结果。
- `src/components/PageSlot.vue`：新增 OCR 叠加层 —— 绝对定位 box 按
  「自然坐标 × (显示宽 / 自然宽)」映射；白字黑描边/半透明底；`pointer-events: none`
  不干扰翻页；页面进入视口时自动触发 OCR（忙时排队，1 并发限流）。
- `src/components/Toolbar.vue`：OCR 开关 + 「OCR 设置」按钮。
- 新增 `src/components/OcrSettings.vue`：provider 选择、API key、endpoint 配置弹窗。
- `src/lib/keybindings.js`：注册 `toggleOCR` 动作。

**边界**：失败页面显示占位并支持重试；API key 仅存 localStorage（提示安全风险）；
压缩后上传控制流量；注意云服务配额与限流。

---

---

## 功能 5：Ctrl + 滚轮缩放单张图片

**方案**：按住 Ctrl 滚轮时不再滚动页面，而是以**光标所在位置为锚点**缩放（光标下的图片
内容保持不漂移），并阻止浏览器默认整页缩放。复用现有 `animateZoomTo` 缩放动画框架，
只需支持自定义锚点。

**文件改动**：
- `src/components/VirtualStrip.vue`：
  - 新增独立 wheel 监听（先于 `gesture.onWheel` 判断）：`e.ctrlKey` → `preventDefault()`，
    计算缩放增量（乘法式 `zoom *= exp(-deltaY * k)`，钳制 0.5×–3×，复用 `setZoomValue`），
    计算光标沿轴坐标 → 调用 `strip.animateZoomTo(zoom, anchorFrac)`；
    否则原样转交 `gesture.onWheel`（保持现有横向滚动 / 惯性逻辑）。
  - 在 `onMounted` / `onBeforeUnmount` 中成对挂载 / 移除该监听（passive: false）。
- `src/composables/useStripLayout.js`：
  - `animateZoomTo(target, anchorFrac)` 增加可选参数；缺省保持现有「视口中心锚点」行为。
  - 锚点换算：沿轴内容坐标 = 当前滚动位置 + (光标 client 坐标 − scroller 左上角)，
    除以 `layout.total` 得 0–1 比例；横 / 右左模式用 x 轴，纵向用 y 轴。
- `src/store.js`：`setZoomValue` 已有钳制逻辑，直接复用。

**边界**：平板触屏无 Ctrl，不受影响；Ctrl 按住期间连续缩放以光标为锚；
缩放动画中锚点按现有 `lastSet` 偏差检测继续微调。

---

## 功能 6：摩尔纹降噪（去网纹）

**方案**：纯前端 WebGL1 实现**双边滤波**（邻近像素加权平均、按亮度差保护边缘），
保留线条锐度的同时抹平印刷网点产生的摩尔纹；输入原图 → shader → canvas →
`toBlob` 缓存复用。无新 npm 依赖（WebGL 为浏览器原生）。

**文件改动**：
- 新增 `src/lib/moireFilter.js`：
  - `applyMoire(blob, { radius, edgeTolerance })`：`createImageBitmap` 解码 →
    WebGL 纹理 → 双边滤波 shader（N×N 邻域 + 亮度差权重）→ 输出 canvas →
    `toBlob('image/jpeg')` 返回处理后的 Blob / 对象 URL；WebGL 不可用时返回 null。
  - 半径默认 2，与强度滑杆联动（2–5 可选）；纯 canvas 2D 逐像素实现太慢，不做回退。
- 新增 `src/lib/moireCache.js`：`Map` 按 `page.key` 缓存处理结果 + 延迟 revoke，
  仿照 `blobUrlCache.js` 的生命周期模式；`flushMoireCache()` 在重新导入时调用。
- `src/components/PageSlot.vue`：`state.moireEnabled` 开启且页面无缓存时，
  懒处理当前可见页（单并发队列 + 每页小加载指示），处理完成后更新 `img` 的 `src`。
- `src/store.js`：新增 `state.moireEnabled` / `state.moireRadius`，localStorage 记忆。

**边界**：处理在视口内按需进行，避免整本预处理的 CPU/内存开销；大图处理期间
不阻塞滚动（WebGL 在 GPU 执行，主线程仅等待解码 / toBlob）；
图片为纯矢量/无网点时降噪几乎无感，属预期。

---

## 功能 7：最大图片渲染尺寸

**方案**：导入阶段（`extractDims` 的 worker 内）检查每张图，超过配置上限的
长边则缩小到上限并**重新编码替换原 blob**（JPEG 0.9；带透明通道转 PNG），
同时更新 `p.w / p.h` —— 布局、裁剪、OCR 映射自动沿用处理后的尺寸，无需改渲染链路。

**文件改动**：
- `src/lib/importer.js`：`readDims` 之后追加 `downscaleIfNeeded(e.file, w, h, maxDim)`：
  `canvas.drawImage` 等比缩放 → `toBlob` → 替换 `e.file` 并返回新 `w/h`；
  上限通过 `extractDims(entries, onProgress, concurrency, maxDim)` 参数传入。
- `src/store.js`：
  - 新增 `state.maxRenderSize`（`0` = 不限制，或 `2048 / 4096 / 8192`），
    localStorage 记忆；导入时传入 `extractDims`。
  - 重新导入后设置才生效（设置项旁给提示文案）。
- 渲染设置 UI（与功能 6、3、4 统一收纳）：新增 `src/components/SettingsDialog.vue`
  「设置」模态，分组收纳：
  - **渲染**：最大渲染尺寸下拉、摩尔纹开关 + 强度滑杆；
  - **快捷键**：原计划 `Keybindings.vue` 的面板移入本模态（`keybindings` 分组）；
  - **OCR**：原计划 `OcrSettings.vue` 的配置移入本模态（`ocr` 分组）。
  - 工具栏新增「设置」按钮（并注册 `toggleSettings` 快捷键动作）。

**边界**：上限仅约束长边、保持宽高比；`ico` 等小图不受影响；
缩放重编码属一次性成本，进度已由现有导入进度条覆盖。

---

## 功能 8：远程 URL 加载（NAS / WebDAV 协同）

**方案**：支持两种远程来源，页面记录标记 `remote: true` 后走「URL 直读」路径，
不再创建 blob URL。依赖对方服务器开启 CORS（UI 中提示）。

**两种来源**：
1. **Manifest JSON**（推荐，兼容性最好）：`GET {baseUrl}/index.json`，
   格式 `{ "title"?, "pages": [{ "url" | "name", "w"?, "h"? }] }`；相对路径
   以 baseUrl 解析为绝对 URL。
2. **WebDAV 目录**：`fetch(url, { method: 'PROPFIND', headers: { Depth: '1' } })`
   → 解析 multistatus XML 的 `d:href` / `d:getcontentlength` → 过滤图片扩展名 →
   自然排序。

**文件改动**：
- 新增 `src/lib/remoteSource.js`：
  - `loadManifest(baseUrl)` / `loadWebDav(url)` → 统一输出页面条目
    `{ remote: true, src, name, w?, h? }`；URL 合法性校验（同源 / https）。
  - 尺寸未知时的处理：`w/h` 缺省用占位比例（如 1.41），懒加载解码后回填。
- `src/store.js`：
  - 新增 `importRemote(mode, url)`：走 `runImport` 类似流程（loading 层 + 竞态防护），
    完成后 `state.title` 取 manifest title 或 URL 末段目录名；`progressKey` 记 URL。
  - `releasePages()` 时对远程条目无需 blob revoke。
- `src/components/PageSlot.vue`：`page.remote` 时跳过 `getBlobUrl`，
  `<img :src="page.src" crossorigin="anonymous">`；`onload` 后若尺寸未知则
  `createImageBitmap` 读取并回填 `p.w / p.h`（触发布局 computed 重算，
  位置微调一次可接受，首图加载后即稳定）。
- 新增 `src/components/RemoteDialog.vue`：模式选择（Manifest / WebDAV）、URL 输入、
  「载入」按钮；Toolbar「远程」按钮打开；内置 CORS 与 WebDAV 配置提示。
- `src/lib/blobUrlCache.js`：不感知远程条目（按 `page.key` 逻辑不变，远程页不调用）。

**边界**：跨域必须由服务器配置 CORS 头；WebDAV 需服务器支持 PROPFIND 且允许
CORS；远程页不做对象 URL 缓存与 revoke；弹幕 JSON 可通过 manifest 的
`danmakuUrl?` 扩展（v1 不实现，留字段）；懒解码回填尺寸仅对未知尺寸页发生一次。

---

## 实施顺序

1. 格式支持（功能 1，含依赖安装提醒）→ 2. 快捷键（功能 3，独立低风险）
→ 3. 智能裁剪（功能 2，涉及布局）→ 4. Ctrl+滚轮缩放（功能 5，小改动，依赖布局锚点）
→ 5. 最大渲染尺寸 + 摩尔纹（功能 7 → 功能 6，共用设置面板与缓存基建）
→ 6. 远程 URL 加载（功能 8，独立）→ 7. OCR（功能 4，依赖最重、需用户配置 key）。

## 用户手动执行的命令

```bash
npm install                      # 功能 1 新增 libarchivejs / pdfjs-dist（功能 5–8 无新增依赖）
npm run dev / npm run build      # 验证
```
