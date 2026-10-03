// Apple Watch Ultra 上的语音助手界面：中间是黄瓜侦探头像，依次经历 聆听 → 思考 → 回答。
// render(t) 是纯函数：同一个 t 永远画出同一帧，实时预览和逐帧导出共用。

export const WIDTH = 1080;
export const HEIGHT = 1350;
export const DURATION = 10; // 秒

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
// 进入 a~b 区间淡入、c~d 区间淡出
const window4 = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t));

const FONT = '"SF Pro Rounded", "SF Pro Text", -apple-system, "Inter", "PingFang SC", "Noto Sans CJK SC", sans-serif';

// 时间轴（秒）
const T = {
  wake: [0.2, 1.0], // 屏幕亮起
  avatar: [0.7, 1.5], // 头像弹出
  listen: [1.4, 3.8],
  think: [3.8, 6.6],
  speak: [6.6, 9.6],
};

// 几何尺寸（画布坐标）
const CX = 540;
const CY = 690;
const CASE = { w: 560, h: 664, r: 150 };
const SCREEN = { w: 486, h: 590, r: 112 };
const AVATAR_R = 112;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 简单的确定性噪声，用来模拟说话时的音量起伏
function voice(t) {
  return (
    0.5 +
    0.22 * Math.sin(t * 13.1) +
    0.16 * Math.sin(t * 7.3 + 1.2) +
    0.12 * Math.sin(t * 21.7 + 0.4)
  );
}

// ---------- 背景：户外虚化草地 ----------
function drawBackground(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, '#9fb08a');
  g.addColorStop(0.35, '#5f8a3e');
  g.addColorStop(0.7, '#3f6d2a');
  g.addColorStop(1, '#2c5320');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 光斑
  const blobs = [
    [180, 120, 260, 'rgba(235,238,215,0.55)'],
    [880, 90, 220, 'rgba(220,226,200,0.45)'],
    [620, 260, 300, 'rgba(150,190,90,0.35)'],
    [80, 620, 280, 'rgba(110,160,60,0.45)'],
    [980, 760, 260, 'rgba(120,170,70,0.40)'],
    [260, 1180, 320, 'rgba(70,120,40,0.50)'],
    [860, 1240, 300, 'rgba(200,190,140,0.30)'],
  ];
  for (const [x, y, r, c] of blobs) {
    const dx = Math.sin(t * 0.35 + x) * 14;
    const dy = Math.cos(t * 0.3 + y) * 10;
    const rg = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
    rg.addColorStop(0, c);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  // 小光点
  for (let i = 0; i < 18; i++) {
    const x = (i * 197 + 60) % WIDTH;
    const y = (i * 331 + 40) % HEIGHT;
    const r = 18 + (i % 5) * 9;
    const a = 0.08 + 0.06 * Math.sin(t * 0.8 + i);
    ctx.fillStyle = `rgba(255,252,230,${a})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 0.4 + i) * 8, y, r, 0, TAU);
    ctx.fill();
  }
}

// ---------- 表带：编织回环式 ----------
function drawBand(ctx, top) {
  const w = 404;
  const x = CX - w / 2;
  const y0 = top ? -40 : CY + CASE.h / 2 - 40;
  const y1 = top ? CY - CASE.h / 2 + 40 : HEIGHT + 40;
  const h = y1 - y0;

  ctx.save();
  roundRect(ctx, x, y0, w, h, 26);
  ctx.clip();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#8d7f62');
  g.addColorStop(0.15, '#c2b28d');
  g.addColorStop(0.5, '#d2c39e');
  g.addColorStop(0.85, '#bdad88');
  g.addColorStop(1, '#85775b');
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, w, h);
  // 编织纹
  for (let y = y0; y < y1; y += 9) {
    ctx.fillStyle = 'rgba(80,66,40,0.16)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = 'rgba(255,248,225,0.10)';
    ctx.fillRect(x, y + 4, w, 2);
  }
  // 两侧的灰色收边
  for (const sx of [x, x + w - 22]) {
    ctx.fillStyle = 'rgba(120,118,110,0.55)';
    ctx.fillRect(sx, y0, 22, h);
  }
  // 靠近表壳处的阴影
  const sg = top
    ? ctx.createLinearGradient(0, y1 - 120, 0, y1)
    : ctx.createLinearGradient(0, y0 + 120, 0, y0);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y0, w, h);
  ctx.restore();
}

// ---------- 钛金属表壳 ----------
function drawCase(ctx) {
  const x = CX - CASE.w / 2;
  const y = CY - CASE.h / 2;

  // 落在表带上的阴影
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, x, y, CASE.w, CASE.h, CASE.r);
  ctx.fillStyle = '#9a9a96';
  ctx.fill();
  ctx.restore();

  // 侧边按键：右侧表冠 + 护肩 + 侧键，左侧橙色操作按钮
  const crownX = x + CASE.w - 6;
  ctx.fillStyle = '#b9b8b3';
  roundRect(ctx, crownX - 6, CY - 170, 40, 150, 18); // 护肩
  ctx.fill();
  const cg = ctx.createLinearGradient(crownX, 0, crownX + 52, 0);
  cg.addColorStop(0, '#7d7d79');
  cg.addColorStop(0.5, '#d9d8d3');
  cg.addColorStop(1, '#8a8a86');
  ctx.fillStyle = cg;
  roundRect(ctx, crownX + 14, CY - 148, 40, 104, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,60,58,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const yy = CY - 140 + i * 8;
    ctx.beginPath();
    ctx.moveTo(crownX + 18, yy);
    ctx.lineTo(crownX + 50, yy);
    ctx.stroke();
  }
  ctx.fillStyle = '#b4b3ae';
  roundRect(ctx, crownX - 4, CY + 30, 22, 120, 10); // 侧键
  ctx.fill();
  ctx.fillStyle = '#ff6a1a';
  roundRect(ctx, x - 16, CY - 150, 24, 104, 10); // 操作按钮
  ctx.fill();

  // 表壳本体
  roundRect(ctx, x, y, CASE.w, CASE.h, CASE.r);
  const g = ctx.createLinearGradient(x, y, x + CASE.w, y + CASE.h);
  g.addColorStop(0, '#e7e6e1');
  g.addColorStop(0.3, '#a9a8a3');
  g.addColorStop(0.55, '#d6d5cf');
  g.addColorStop(0.8, '#8f8e8a');
  g.addColorStop(1, '#c9c8c3');
  ctx.fillStyle = g;
  ctx.fill();

  // 凸起的表圈
  const bx = CX - (SCREEN.w + 34) / 2;
  const by = CY - (SCREEN.h + 34) / 2;
  roundRect(ctx, bx, by, SCREEN.w + 34, SCREEN.h + 34, SCREEN.r + 16);
  const bg = ctx.createLinearGradient(bx, by, bx, by + SCREEN.h + 34);
  bg.addColorStop(0, '#cfcec9');
  bg.addColorStop(0.5, '#8d8c88');
  bg.addColorStop(1, '#b5b4af');
  ctx.fillStyle = bg;
  ctx.fill();

  // 黑色玻璃边
  roundRect(ctx, CX - SCREEN.w / 2 - 10, CY - SCREEN.h / 2 - 10, SCREEN.w + 20, SCREEN.h + 20, SCREEN.r + 8);
  ctx.fillStyle = '#050608';
  ctx.fill();
}

function screenPath(ctx) {
  roundRect(ctx, CX - SCREEN.w / 2, CY - SCREEN.h / 2, SCREEN.w, SCREEN.h, SCREEN.r);
}

// ---------- 屏幕上的小部件 ----------
function circleButton(ctx, x, y, r, fill, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function drawMenuIcon(ctx, x, y) {
  ctx.strokeStyle = '#e8e8ec';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const dy of [-9, 0, 9]) {
    ctx.beginPath();
    ctx.moveTo(x - 14, y + dy);
    ctx.lineTo(x + 14, y + dy);
    ctx.stroke();
  }
}

function drawMoreIcon(ctx, x, y) {
  ctx.fillStyle = '#e8e8ec';
  for (const dx of [-11, 0, 11]) {
    ctx.beginPath();
    ctx.arc(x + dx, y, 3.6, 0, TAU);
    ctx.fill();
  }
}

function drawMic(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  roundRect(ctx, -7, -16, 14, 22, 7);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, -3, 12, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.lineTo(0, 16);
  ctx.moveTo(-6, 16);
  ctx.lineTo(6, 16);
  ctx.stroke();
  ctx.restore();
}

function drawHangUp(ctx, x, y) {
  // 横放的听筒
  ctx.save();
  ctx.translate(x, y + 4);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-22, -2);
  ctx.quadraticCurveTo(0, -20, 22, -2);
  ctx.lineTo(20, 8);
  ctx.lineTo(10, 8);
  ctx.lineTo(9, 0);
  ctx.quadraticCurveTo(0, -5, -9, 0);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-20, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBulb(ctx, x, y, glow, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow > 0.01) {
    const rg = ctx.createRadialGradient(x, y - 6, 0, x, y - 6, 52);
    rg.addColorStop(0, `rgba(255,214,90,${0.65 * glow})`);
    rg.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y - 6, 52, 0, TAU);
    ctx.fill();
  }
  // 灯泡玻璃
  const on = lerp(0.25, 1, glow);
  ctx.fillStyle = `rgba(${Math.round(lerp(120, 255, glow))},${Math.round(lerp(110, 205, glow))},${Math.round(lerp(90, 90, glow))},${on})`;
  ctx.beginPath();
  ctx.arc(x, y - 10, 15, Math.PI * 0.8, Math.PI * 2.2);
  ctx.lineTo(x + 7, y + 6);
  ctx.lineTo(x - 7, y + 6);
  ctx.closePath();
  ctx.fill();
  // 灯座
  ctx.fillStyle = '#9a9aa2';
  roundRect(ctx, x - 8, y + 7, 16, 5, 2);
  ctx.fill();
  roundRect(ctx, x - 7, y + 13, 14, 5, 2);
  ctx.fill();
  ctx.restore();
}

// ---------- 头像 ----------
function drawAvatar(ctx, img, t, appear) {
  if (appear <= 0) return;
  const listen = window4(t, T.listen[0], T.listen[0] + 0.4, T.listen[1] - 0.2, T.listen[1] + 0.2);
  const think = window4(t, T.think[0], T.think[0] + 0.4, T.think[1] - 0.2, T.think[1] + 0.2);
  const speak = window4(t, T.speak[0], T.speak[0] + 0.3, T.speak[1] - 0.3, T.speak[1]);

  const v = voice(t);
  const breathe = 1 + 0.015 * Math.sin(t * 2.4);
  const talk = 1 + speak * 0.045 * v;
  const scale = easeOutBack(appear) * breathe * talk;
  const r = AVATAR_R * scale;
  const tilt = think * 0.09 * Math.sin(t * 2.2);
  const bob = listen * 4 * Math.sin(t * 5);

  ctx.save();
  ctx.translate(CX, CY - 18 + bob);

  // 外圈：聆听时的声波环
  if (listen > 0.01) {
    const bars = 48;
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * TAU;
      const amp = 0.5 + 0.5 * Math.sin(t * 9 + i * 0.7) * Math.sin(t * 3.1 + i * 0.23);
      const len = (8 + 16 * amp) * listen;
      const r0 = r + 14;
      ctx.strokeStyle = `rgba(160,236,120,${0.75 * listen})`;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len));
      ctx.stroke();
    }
  }

  // 思考时绕行的三个小点
  if (think > 0.01) {
    for (let i = 0; i < 3; i++) {
      const a = t * 2.6 + (i * TAU) / 3;
      const rr = r + 24;
      ctx.fillStyle = `rgba(190,245,150,${0.9 * think})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 7 - i * 1.2, 0, TAU);
      ctx.fill();
    }
  }

  // 回答时向外扩散的波纹
  if (speak > 0.01) {
    for (let i = 0; i < 3; i++) {
      const p = ((t - T.speak[0]) * 0.8 + i / 3) % 1;
      const rr = r + 6 + p * 90;
      ctx.strokeStyle = `rgba(150,230,110,${(1 - p) * 0.55 * speak})`;
      ctx.lineWidth = 6 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.stroke();
    }
  }

  // 柔光
  const glow = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.5);
  glow.addColorStop(0, 'rgba(140,220,90,0.35)');
  glow.addColorStop(1, 'rgba(140,220,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, TAU);
  ctx.fill();

  // 圆形头像本体
  ctx.rotate(tilt);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.clip();
  const size = r * 2.7; // 放大到上身充满圆形，帽尖和脚略出框
  ctx.drawImage(img, -size * 0.53, -size * 0.47, size, size);
  // 球面高光
  const hl = ctx.createRadialGradient(-r * 0.35, -r * 0.45, 0, -r * 0.35, -r * 0.45, r * 1.1);
  hl.addColorStop(0, 'rgba(255,255,255,0.22)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0)');
  hl.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = hl;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.5, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function statusText(t) {
  if (t < T.listen[0]) return '';
  if (t < T.think[0]) return 'Listening';
  if (t < T.speak[0]) {
    const n = Math.floor((t * 3) % 4);
    return 'Thinking' + '.'.repeat(n);
  }
  return 'Speaking';
}

function drawScreen(ctx, t, img) {
  const on = smooth(T.wake[0], T.wake[1], t);
  ctx.save();
  screenPath(ctx);
  ctx.clip();

  // 底色：深海军蓝
  const bg = ctx.createRadialGradient(CX, CY - 40, 40, CX, CY, SCREEN.h * 0.7);
  bg.addColorStop(0, `rgb(${Math.round(18 * on)},${Math.round(30 * on)},${Math.round(52 * on)})`);
  bg.addColorStop(1, `rgb(${Math.round(6 * on)},${Math.round(10 * on)},${Math.round(22 * on)})`);
  ctx.fillStyle = bg;
  ctx.fillRect(CX - SCREEN.w / 2, CY - SCREEN.h / 2, SCREEN.w, SCREEN.h);

  const top = CY - SCREEN.h / 2;
  const bottom = CY + SCREEN.h / 2;
  const left = CX - SCREEN.w / 2;
  const right = CX + SCREEN.w / 2;

  // 顶栏
  const chrome = smooth(T.wake[0] + 0.2, T.wake[1] + 0.2, t);
  circleButton(ctx, left + 82, top + 72, 34, '#2a2d36', chrome);
  drawMenuIcon(ctx, left + 82, top + 72);
  circleButton(ctx, right - 82, top + 72, 34, '#2a2d36', chrome);
  drawMoreIcon(ctx, right - 82, top + 72);

  ctx.globalAlpha = chrome;
  // 录音中的橙色指示
  const recPulse = 0.75 + 0.25 * Math.sin(t * 4);
  ctx.fillStyle = `rgba(255,120,40,${recPulse})`;
  ctx.beginPath();
  ctx.arc(CX - 62, top + 70, 13, 0, TAU);
  ctx.fill();
  drawMic(ctx, CX - 62, top + 71, 0.5, '#1a1208');
  ctx.fillStyle = '#f2f2f5';
  ctx.font = `600 34px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('10:09', CX - 40, top + 72);

  // 灯泡：思考时点亮
  const thinkGlow = window4(t, T.think[0] + 0.3, T.think[0] + 0.9, T.think[1] - 0.1, T.think[1] + 0.4);
  const flicker = thinkGlow * (0.85 + 0.15 * Math.sin(t * 17));
  drawBulb(ctx, right - 92, CY - 150, flicker, chrome);
  ctx.globalAlpha = 1;

  // 头像
  const appear = smooth(T.avatar[0], T.avatar[1], t);
  drawAvatar(ctx, img, t, appear);

  // 状态文字
  const label = statusText(t);
  const labelA = smooth(T.listen[0], T.listen[0] + 0.4, t);
  ctx.globalAlpha = labelA;
  ctx.fillStyle = '#f4f4f7';
  ctx.font = `500 38px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(label.replace(/\.+$/, ''), CX, CY + 178);
  // 省略号单独画，避免文字左右跳
  const dots = (label.match(/\.+$/) || [''])[0];
  if (dots) {
    const w = ctx.measureText(label.replace(/\.+$/, '')).width;
    ctx.textAlign = 'left';
    ctx.fillText(dots, CX + w / 2 + 2, CY + 178);
  }
  ctx.globalAlpha = 1;

  // 底部按钮
  const listenOn = window4(t, T.listen[0], T.listen[0] + 0.3, T.listen[1] - 0.2, T.listen[1] + 0.1);
  circleButton(ctx, left + 92, bottom - 86, 40, listenOn > 0.5 ? '#3d4250' : '#2a2d36', chrome);
  if (listenOn > 0.01) {
    ctx.globalAlpha = chrome * listenOn * 0.5;
    ctx.strokeStyle = '#9ff07a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(left + 92, bottom - 86, 44 + 4 * Math.sin(t * 6), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = chrome;
  drawMic(ctx, left + 92, bottom - 84, 1, '#e8e8ec');
  circleButton(ctx, right - 92, bottom - 86, 44, '#ff3b4a', chrome);
  drawHangUp(ctx, right - 92, bottom - 88);
  ctx.globalAlpha = 1;

  // 玻璃反光
  const gl = ctx.createLinearGradient(left, top, right, bottom);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)');
  gl.addColorStop(0.35, 'rgba(255,255,255,0)');
  gl.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.fillStyle = gl;
  ctx.fillRect(left, top, SCREEN.w, SCREEN.h);

  ctx.restore();
}

export function createScene(canvas, img) {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  function render(t) {
    t = clamp(t, 0, DURATION);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    drawBackground(ctx, t);

    // 镜头缓慢推近
    const zoom = lerp(1.0, 1.06, smooth(0, DURATION, t));
    ctx.translate(CX, CY);
    ctx.scale(zoom, zoom);
    ctx.rotate(-0.025);
    ctx.translate(-CX, -CY);

    drawBand(ctx, true);
    drawBand(ctx, false);
    drawCase(ctx);
    drawScreen(ctx, t, img);
  }

  return { render };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
