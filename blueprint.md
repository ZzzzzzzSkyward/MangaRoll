# Comic Reader — 功能扩展蓝图 (Blueprint)

> 依据 README 与现有源码（importer.js / store.js / ReaderView.vue / VirtualStrip.vue /
> PageSlot.vue / Toolbar.vue / useStripLayout.js 等）梳理的八个功能扩展计划。
> 状态：**功能 2–8 已全部实施，仅功能 1（CBZ / CBR / CB7 / PDF 格式支持）待实施。**
> 各功能小节标注「✅ 已实施」或「⏳ 待实施」，已实施部分与实际源码对应，仅作参考。

## 约束与前置

- 本机 `npm` / `node` 环境不可用（README「重要规则」）：依赖安装与构建必须由用户**手动执行**。
- 新增依赖后用户需执行：`npm install`，构建验证：`npm run dev` / `npm run build`。
- 技术栈：Vue 3 (Composition API + `<script setup>`) + Vite 6；所有新模块沿用现有
  纯前端、本地优先、无构建期 Node 插件依赖的风格。

---

## 功能 1：漫画专用格式 CBZ / CBR / CB7 / PDF

> ⏳ **待实施**（尚未落地：`package.json` 无 `libarchivejs` / `pdfjs-dist`，`importer.js` 无对应解压 / PDF 渲染路径，`FilePicker.vue` accept 仍仅 `.zip`）

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

## 功能 4：云端 OCR（日文气泡文本叠加）

> ✅ **已实施**（`lib/ocr/`：ocrConfig / ocrAzure / ocrGeneric / ocrClient；`PageSlot.vue` 视口内自动识别 + 包围盒叠加；`SettingsDialog.vue` OCR 页签；`store.toggleOcr`；快捷键动作 `toggleOCR`）
>
> **已确认方案**：云端 OCR API + 整页识别 + 文本包围盒叠加（不做气泡 CV 检测）。

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

## 功能 8：远程 URL 加载（NAS / WebDAV 协同）

> ✅ **已实施**（`remoteSource.js` + `RemoteDialog.vue` + `store.importRemote`；`PageSlot.vue` 远程页 URL 直读、懒回填尺寸；`blobUrlCache` 不感知远程条目）
>
> **方案**：支持两种远程来源，页面记录标记 `remote: true` 后走「URL 直读」路径，
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
