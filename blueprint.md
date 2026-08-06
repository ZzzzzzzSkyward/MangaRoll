# Comic Reader — 功能扩展蓝图 (Blueprint)

## 约束与前置

- 本机 `npm` / `node` 环境不可用（README「重要规则」）：依赖安装与构建必须由用户**手动执行**。
- 新增依赖后用户需执行：`npm install`，构建验证：`npm run dev` / `npm run build`。
- 技术栈：Vue 3 (Composition API + `<script setup>`) + Vite 6；所有新模块沿用现有
  纯前端、本地优先、无构建期 Node 插件依赖的风格。

---

## 功能 1：漫画专用格式 CBZ / CBR / CB7 / PDF

> ⏳ **待实施**（尚未落地：`package.json` 无 `libarchivejs` / `pdfjs-dist`，`importer.js` 无对应解压 / PDF 渲染路径，`FilePicker.vue` accept 仍仅 `.zip`）

**新增依赖**：`libarchivejs`（RAR / 7z 解压，浏览器 WASM）、`pdfjs-dist`（PDF 渲染）。
ZIP / CBZ 继续使用现有 unzipit（CBZ 即 ZIP 改名，只需扩展识别）。

**导入分发链路**（`store.js:handleEntries` 按扩展名分流）：

| 扩展名                        | 处理模块                                   | 说明                 |
| ----------------------------- | ------------------------------------------ | -------------------- |
| `.zip` / `.cbz`           | 现有 `unzip()` (unzipit)                 | 不变，仅扩展识别     |
| `.cbr` / `.cb7` / `.7z` | 新增 `unarchiveArchive()` (libarchivejs) | 解压出图片条目       |
| `.pdf`                      | 新增 `extractPdf()` (pdfjs-dist)         | 逐页渲染为 JPEG 条目 |
| 文件夹                        | 现有 walkItems                             | 不变                 |

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
