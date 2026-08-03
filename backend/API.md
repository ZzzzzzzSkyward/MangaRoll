# API 接口文档

服务默认地址: `http://localhost:5017`，交互式文档: `/docs` (Swagger UI)。

所有接口已启用 CORS (`allow_origins=*`)，前端可直接跨域调用。

## 输入支持范围

所有接口均通过统一解码网关处理图片，**支持**：

| 输入类型 | 说明 |
| --- | --- |
| png / jpg | 按 magic bytes 判定真实格式，与文件名/content-type 无关 |
| 单色图 (1-bit) | 自动转为 RGB |
| 灰度图 (L) | 自动转为 RGB |
| 内置色板 (P) | 调色板索引图按调色板转 RGB |
| 含透明度 (RGBA/LA/PA) | 白底 alpha 合成（配置 `ALPHA_BACKGROUND`） |
| 内嵌 ICC 色彩配置 | 转换为 sRGB（配置 `ENABLE_ICC`，失败不中断） |
| JPEG EXIF 方向 | 自动旋转修正 |
| 超过 1600px | 解码尺寸不限，推理时 letterbox 等比缩放 |
| 超大图保护 | 像素数超过 `MAX_PIXELS`(默认 1 亿) 时拒绝 (400) |

## GET /health

服务健康检查。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | str | `ok` |
| `app` | str | 服务名称 |
| `version` | str | 服务版本 |
| `model` | str | 模型文件名 |
| `provider` | str | 推理后端 (`CPUExecutionProvider` / `CUDAExecutionProvider`) |
| `classes` | list[str] | 类别名列表 |

## POST /detect

上传漫画图片，返回气泡区域检测结果 JSON。

### 参数

| 名称 | 位置 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `file` | form | file | 必填 | 漫画图片 (jpg/png/webp/bmp...) |
| `conf_threshold` | query | float | `0.25` | 置信度阈值 0~1 |
| `visualize` | query | bool | `false` | 为 `true` 时在响应中附带 base64 标注图 (PNG) |
| `merge` | query | bool | `true` | 是否自动合并重叠/嵌套区域 (为 `false` 时返回模型原始输出) |
| `ocr` | query | bool | `false` | 为 `true` 时对每个检测框执行 manga-ocr 日文识别并填充 `text` |

> `ocr` 说明：需要安装 `transformers` 且存在 `ocr/manga-ocr-base/` 模型
> （约 444MB，首次调用懒加载，占用约 1-2GB 内存）。模型缺失/依赖未安装时
> `ocr=true` 自动退化为普通检测（`ocr_enabled=false`）。仅支持日文识别。
> CPU 下逐框识别较慢（每框约 1-2s），大图建议用 GPU 或分批识别。

### 响应 200

```json
{
  "success": true,
  "image": { "width": 1440, "height": 2160 },
  "count": 4,
  "conf_threshold": 0.25,
  "latency_ms": 253.0,
  "ocr_enabled": true,
  "ocr_latency_ms": 8200.5,
  "detections": [
    {
      "class_id": 3,
      "class_name": "changfangtiao",
      "confidence": 0.904,
      "bbox": { "x1": 156.79, "y1": 1100.53, "x2": 623.49, "y2": 1157.70 },
      "center": { "x": 390.14, "y": 1129.12 },
      "width": 466.70,
      "height": 57.17,
      "text": "あなたの　素敵な\n言葉"
    }
  ],
  "visualized_image_base64": null
}
```

| 字段 | 说明 |
| --- | --- |
| `image` | 输入图像宽高 |
| `count` | 检出数量 |
| `latency_ms` | 推理耗时 (毫秒) |
| `detections[].class_id` | 类别 id (0~5) |
| `detections[].class_name` | 类别名称 |
| `detections[].confidence` | 置信度 |
| `detections[].bbox` | 检测框，**原图像素坐标** |
| `detections[].center` | 中心点坐标 |
| `detections[].text` | manga-ocr 日文识别文本；`ocr=true` 且识别成功时非空，否则为 `null` |
| `ocr_enabled` | 本次请求是否实际启用了 OCR (模型可用且 `ocr=true`) |
| `ocr_latency_ms` | OCR 总耗时 (毫秒)；未启用时为 `0` |
| `visualized_image_base64` | 标注图 (PNG) base64，仅 `visualize=true` 时返回 |

### 错误 400

无效图片: `{"error": "无法解析图片，请上传有效的图片文件 (...)"}`

### 后处理说明

模型输出默认（`merge=true`）会经过后处理，将相互**重叠**（IoU ≥ 阈值）或
**嵌套**（一方大部分被另一方包含）的检测框自动合并为一个区域，合并框取
各组并集、类别与置信度取组内最高者。阈值可在 `backend/config.py` 中通过
`MERGE_IOU_THRESHOLD` 与 `MERGE_CONTAINMENT_RATIO` 调整；传 `merge=false`
则返回模型原始输出。

### 错误 422

参数校验失败（如 `conf_threshold` 超出 0~1）。

## POST /visualize 上传图片，直接返回带标注框的 JPEG/PNG

参数同 `/detect`（`file`、`conf_threshold`、`merge`），另支持:

| 名称 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `format` | query | `jpg` | 输出格式: `jpg` 或 `png`（无损标注图） |

| 响应头 | 说明 |
| --- | --- |
| `Content-Type` | `image/jpeg` 或 `image/png` |
| `X-Detection-Count` | 检测数量 |

## POST /mask 上传图片，返回气泡区域单色遮罩

| 名称 | 位置 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `file` | form | file | 必填 | 漫画图片 |
| `conf_threshold` | query | float | `0.25` | 置信度阈值 0~1 |
| `mode` | query | str | `binary` | `binary`=单色遮罩(气泡白/背景黑)；`class`=按类别灰阶 (class_id+1) |
| `format` | query | str | `jpg` | 输出格式: `jpg` 或 `png`（无损遮罩） |
| `merge` | query | bool | `true` | 是否自动合并重叠/嵌套区域 |

输出尺寸与原图一致，单通道灰度。

| 响应头 | 说明 |
| --- | --- |
| `Content-Type` | `image/jpeg` 或 `image/png` |
| `X-Detection-Count` | 检测数量 |
| `X-Mask-Mode` | `binary` / `class` |

> 注意: JPG 为有损格式，遮罩边缘存在轻微压缩伪影；像素级精确遮罩请使用 `format=png`。

## 调用示例

```python
import requests
import base64

with open("manga.jpg", "rb") as f:
    data = f.read()

# 1) JSON 结果
r = requests.post("http://localhost:5017/detect",
                  files={"file": ("manga.jpg", data, "image/jpeg")},
                  params={"conf_threshold": 0.25, "visualize": "true"})
result = r.json()
for d in result["detections"]:
    print(d["class_name"], d["confidence"], d["bbox"])

# 1b) 日文 OCR: /detect?ocr=true, 读取 Detection.text
r = requests.post("http://localhost:5017/detect",
                  files={"file": ("manga.jpg", data, "image/jpeg")},
                  params={"ocr": "true"})
for d in r.json()["detections"]:
    print(d["class_name"], d.get("text"))

# 保存标注图
open("annotated.png", "wb").write(base64.b64decode(result["visualized_image_base64"]))

# 2) 直接获取标注图
r = requests.post("http://localhost:5017/visualize",
                  files={"file": ("manga.jpg", data, "image/jpeg")})
open("annotated.jpg", "wb").write(r.content)

# 3) 获取气泡区域单色遮罩 (JPG, 白=气泡/黑=背景)
r = requests.post("http://localhost:5017/mask",
                  files={"file": ("manga.jpg", data, "image/jpeg")})
open("mask.jpg", "wb").write(r.content)
```

curl 等价命令:

```bash
curl -X POST http://localhost:5017/detect \
  -F "file=@manga.jpg" \
  -F "conf_threshold=0.25"
```