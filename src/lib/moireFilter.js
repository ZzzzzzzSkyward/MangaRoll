// 摩尔纹去噪：WebGL1 双边滤波（空间高斯 × 范围（亮度差）高斯），保留边缘的同时抹平网点纹理。
// 返回处理后的 Blob，WebGL 不可用时返回 null。

const VERT = `
precision mediump float;
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // 显式翻转 y：不依赖 UNPACK_FLIP_Y_WEBGL（对 ImageBitmap 上传部分浏览器不生效），
  // 保证屏幕顶部采样源顶部，避免输出上下颠倒。
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const MAX_R = 5

function fragSource(r) {
  return `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_texSize;
varying vec2 v_uv;
const float SIGMA_RANGE = 0.055; // 亮度差容差（0~1），越小越保护边缘
void main() {
  vec3 center = texture2D(u_tex, v_uv).rgb;
  float sum = 0.0;
  vec3 sumc = vec3(0.0);
  for (int i = -${MAX_R}; i <= ${MAX_R}; i++) {
    for (int j = -${MAX_R}; j <= ${MAX_R}; j++) {
      float d2 = float(i*i + j*j);
      if (d2 > float(${r} * ${r})) continue;
      vec2 off = vec2(float(i), float(j)) / u_texSize;
      vec3 c = texture2D(u_tex, v_uv + off).rgb;
      float w = exp(-d2 * 0.5);
      float md = max(abs(c.r - center.r), max(abs(c.g - center.g), abs(c.b - center.b)));
      w *= exp(-(md * md) / (2.0 * SIGMA_RANGE * SIGMA_RANGE));
      sum += w;
      sumc += c * w;
    }
  }
  gl_FragColor = vec4(sumc / max(sum, 1e-6), 1.0);
}
`
}

// 迭代二分降采样：每步只缩一半，避免单步大倍率 drawImage 的混叠摩尔纹。
function downsampleByHalving(srcCanvas, srcW, srcH, dstW, dstH) {
  let cur = srcCanvas
  let cw = srcW
  let ch = srcH
  while (cw > dstW * 1.6 || ch > dstH * 1.6) {
    const nw = Math.max(dstW, Math.ceil(cw / 2))
    const nh = Math.max(dstH, Math.ceil(ch / 2))
    const step = document.createElement('canvas')
    step.width = nw
    step.height = nh
    step.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh)
    cur = step
    cw = nw
    ch = nh
  }
  if (cw === dstW && ch === dstH) return cur
  const out = document.createElement('canvas')
  out.width = dstW
  out.height = dstH
  out.getContext('2d').drawImage(cur, 0, 0, cw, ch, 0, 0, dstW, dstH)
  return out
}

function createGL(canvas) {
  return (
    canvas.getContext('webgl', { premultipliedAlpha: true }) ||
    canvas.getContext('experimental-webgl', { premultipliedAlpha: true })
  )
}

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('shader: ' + err)
  }
  return sh
}

// 按半径缓存 program 不可行：program 与创建它的 GL 上下文绑定，跨画布复用会失效。
// 这里每次处理重新编译一次（一次约几毫秒，经 moireCache 串行队列分摊）。
function makeProgram(gl, r) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSource(r))
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog)
    throw new Error('program link failed')
  }
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  return prog
}

/**
 * @param {Blob|File} blob 原图
 * @param {number} radius 邻域半径（2~5），约等于滤波强度
 * @param {number} [maxDim] 按显示分辨率处理：长边上限（px）。给定后先等比缩小到该分辨率
 *  再滤波，避免浏览器二次降采样把残余网点混叠成可见摩尔纹（如 50% 倍率下）。
 * @returns {Promise<Blob|null>} 处理后的 JPEG Blob，失败/不支持返回 null
 */
export async function applyMoire(blob, radius = 2, maxDim = 0) {
  const r = Math.max(1, Math.min(MAX_R, Math.round(radius)))
  let bmp
  try {
    bmp = await createImageBitmap(blob)
  } catch {
    return null
  }
  const w = bmp.width
  const h = bmp.height
  if (!w || !h) {
    bmp.close?.()
    return null
  }
  let tw = w
  let th = h
  if (maxDim && Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h)
    tw = Math.max(1, Math.round(w * scale))
    th = Math.max(1, Math.round(h * scale))
  }

  // 源画布：先等比缩小。注意不能一步 drawImage 缩到位——大倍率单步降采样会
  // 把高频网点（半色调）混叠成低频摩尔纹（50% 倍率下尤其明显），浏览器关闭开关时
  // 反而比开关后更干净。改为迭代二分降采样，每一步只缩一半，等效多次低通平均。
  const start = document.createElement('canvas')
  start.width = w
  start.height = h
  start.getContext('2d').drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  let src
  if (tw === w && th === h) {
    src = start
  } else {
    src = downsampleByHalving(start, w, h, tw, th)
  }

  const out = document.createElement('canvas')
  out.width = tw
  out.height = th
  const gl = createGL(out)
  if (!gl) return null

  let tex = null
  let buf = null
  let prog = null
  try {
    tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)

    prog = makeProgram(gl, r)
    gl.useProgram(prog)

    buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0)
    gl.uniform2f(gl.getUniformLocation(prog, 'u_texSize'), tw, th)
    gl.viewport(0, 0, tw, th)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // 输出到 canvas，再 toBlob（canvas 本身就是 render target，直接读取像素）
    return await new Promise((resolve) => {
      out.toBlob(resolve, 'image/jpeg', 0.9)
    })
  } finally {
    // WebGL 对象（纹理/缓冲/程序）没有 delete() 方法，必须经 GL 上下文显式释放；
    // 上下文通过 WEBGL_lose_context 归还 GPU 内存（设 width/height=0 只清帧缓冲，不释放上下文）。
    // 全部资源放 finally，编译/链接失败等异常路径也不泄漏。
    if (prog) gl.deleteProgram(prog)
    if (buf) gl.deleteBuffer(buf)
    if (tex) gl.deleteTexture(tex)
    out.width = 0
    out.height = 0
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext()
  }
}