# 漫卷 · MangaRoll

- 单页面网页漫画阅读器。
- 全部代码由AI完成。

## 运行方式

1. 进入目录打开服务器`npm run preview`
2. 打包`npm run build`然后部署到任意服务器

## 支持格式

1. 图片：'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'ico', 'jxl'。其中jxl由于浏览器未完全支持，尚未确认。
2. 文件结构：文件夹、文件目录、zip、manifest.json（未测试）、WebDAV（未测试）。
3. 弹幕：niconico漫画弹幕（需要自己转换为标准格式，见niconico.js）

## 后端

1. OCR功能在yolo文件夹，需要python3.13，启动本地服务器`python backend/main.py`
