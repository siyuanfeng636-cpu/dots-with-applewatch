// Apple Watch 上的 Dots 动画。
// render(t) 是纯函数：同一个 t 永远画出同一帧，所以既能实时播放，也能逐帧导出视频。

export const WIDTH = 1080;
export const HEIGHT = 1080;
export const DURATION = 9; // 秒

const TAU = Math.PI * 2;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (a, b, x) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// watchOS 风格的图标配色
const PALETTE = [
  '#FF453A', '#FF9F0A', '#FFD60A', '#30D158', '#63E6E2', '#40C8E0',
  '#64D2FF', '#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#8E8E93',
];

const FONT = '-apple-system, "SF Pro Display", "PingFang SC", "Helvetica Neue", "WenQuanYi Zen Hei", Arial, sans-serif';

// 表的几何尺寸（画布坐标）
const WATCH = { cx: 540, cy: 540, w: 500, h: 600, r: 128 };
const SCREEN = { w: 440, h: 540, r: 100 };
const HW = SCREEN.w / 2;
const HH = SCREEN.h / 2;

// 蜂窝网格
const GRID_RADIUS = 4;
const SPACING = 92;
const DOT_R = 40;

function hash(q, r) {
  let h = Math.imul(q + 101, 73856093) ^ Math.imul(r + 211, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function buildGrid() {
  const dots = [];
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    const rMin = Math.max(-GRID_RADIUS, -q - GRID_RADIUS);
    const rMax = Math.min(GRID_RADIUS, -q + GRID_RADIUS);
    for (let r = rMin; r <= rMax; r++) {
      const h = hash(q, r);
      dots.push({
        q,
        r,
        x: SPACING * (q + r / 2),
        y: SPACING * (r * Math.sqrt(3)) / 2,
        ring: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)),
        color: PALETTE[h % PALETTE.length],
        glyph: (h >>> 8) % 6,
        jitter: ((h >>> 16) % 100) / 100,
        isCenter: q === 0 && r === 0,
      });
    }
  }
  return dots;
}

const GRID = buildGrid();

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex, amt) {
  // amt > 0 往白色混，amt < 0 往黑色混
  const [r, g, b] = hexToRgb(hex);
  const target = amt > 0 ? 255 : 0;
  const k = Math.abs(amt);
  return `rgb(${Math.round(lerp(r, target, k))},${Math.round(lerp(g, target, k))},${Math.round(lerp(b, target, k))})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 镜头轨迹：模拟转动表冠滚动网格
function panOffset(t) {
  const A = { x: -150, y: -120 };
  const B = { x: 130, y: 100 };
  if (t < 3.4) return { x: 0, y: 0 };
  if (t < 4.4) {
    const k = easeInOutCubic(prog(t, 3.4, 4.4));
    return { x: lerp(0, A.x, k), y: lerp(0, A.y, k) };
  }
  if (t < 5.2) {
    const k = easeInOutCubic(prog(t, 4.4, 5.2));
    return { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k) };
  }
  const k = easeInOutCubic(prog(t, 5.2, 5.8));
  return { x: lerp(B.x, 0, k), y: lerp(B.y, 0, k) };
}

// watchOS 的边缘鱼眼：越靠近屏幕边缘，圆点越小、越往里收
function fisheye(x, y) {
  const d0 = Math.pow(Math.pow(Math.abs(x / HW), 4) + Math.pow(Math.abs(y / HH), 4), 0.25);
  const pull = 1 - 0.3 * smooth(0.35, 1.5, d0);
  const px = x * pull;
  const py = y * pull;
  const d = Math.pow(Math.pow(Math.abs(px / HW), 4) + Math.pow(Math.abs(py / HH), 4), 0.25);
  return { x: px, y: py, s: 1 - 0.8 * smooth(0.4, 1.02, d) };
}

function drawGlyph(ctx, x, y, r, type) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.14;
  switch (type) {
    case 0: // 圆环
      ctx.beginPath();
      ctx.arc(x, y, r * 0.38, 0, TAU);
      ctx.stroke();
      break;
    case 1: // 实心点
      ctx.beginPath();
      ctx.arc(x, y, r * 0.2, 0, TAU);
      ctx.fill();
      break;
    case 2: // 两条横杠
      ctx.beginPath();
      ctx.moveTo(x - r * 0.35, y - r * 0.16);
      ctx.lineTo(x + r * 0.35, y - r * 0.16);
      ctx.moveTo(x - r * 0.35, y + r * 0.16);
      ctx.lineTo(x + r * 0.2, y + r * 0.16);
      ctx.stroke();
      break;
    case 3: // 播放三角
      ctx.beginPath();
      ctx.moveTo(x - r * 0.2, y - r * 0.3);
      ctx.lineTo(x + r * 0.32, y);
      ctx.lineTo(x - r * 0.2, y + r * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case 4: // 心率波形
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y);
      ctx.lineTo(x - r * 0.18, y);
      ctx.lineTo(x - r * 0.05, y - r * 0.3);
      ctx.lineTo(x + r * 0.1, y + r * 0.28);
      ctx.lineTo(x + r * 0.22, y);
      ctx.lineTo(x + r * 0.45, y);
      ctx.stroke();
      break;
    default:
      break; // 纯色圆点
  }
  ctx.restore();
}

function drawDot(ctx, dot, x, y, r, alpha) {
  if (r < 0.5 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, shade(dot.color, 0.35));
  g.addColorStop(0.6, dot.color);
  g.addColorStop(1, shade(dot.color, -0.18));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  if (r > 10) drawGlyph(ctx, x, y, r, dot.glyph);
  ctx.restore();
}

function drawImageDot(ctx, img, x, y, r, alpha, glow, size = r * 2.12, dy = 0) {
  if (r < 0.5 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow > 0) {
    ctx.shadowColor = `rgba(139, 207, 90, ${0.85 * glow})`;
    ctx.shadowBlur = 40 * glow;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  // 用原图背景同款的蓝→薄荷绿渐变垫底，过渡时看不到图片的方形边缘
  const bg = ctx.createLinearGradient(x - size / 2, y + dy - size / 2, x + size / 4, y + dy + size / 2);
  bg.addColorStop(0, 'rgb(174,223,251)');
  bg.addColorStop(1, 'rgb(212,251,219)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.clip();
  // 默认稍微放大，让角色撑满圆；App 打开后改为整张图适配屏幕
  ctx.drawImage(img, x - size / 2, y + dy - size / 2, size, size);
  ctx.restore();
}

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, WIDTH * 0.4, HEIGHT);
  g.addColorStop(0, '#b3e0fb');
  g.addColorStop(1, '#d2f7dd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawBand(ctx, top) {
  const { cx, cy, h } = WATCH;
  const bw = 360;
  const y0 = top ? -40 : cy + h / 2 - 60;
  const y1 = top ? cy - h / 2 + 60 : HEIGHT + 40;
  const g = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
  g.addColorStop(0, '#5fae3c');
  g.addColorStop(0.5, '#8fd36a');
  g.addColorStop(1, '#5fae3c');
  ctx.fillStyle = g;
  roundRect(ctx, cx - bw / 2, y0, bw, y1 - y0, 40);
  ctx.fill();
  if (!top) {
    ctx.fillStyle = 'rgba(40, 90, 30, 0.45)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy + h / 2 + 70 + i * 52, 9, 0, TAU);
      ctx.fill();
    }
  }
}

function drawCase(ctx, crownPhase) {
  const { cx, cy, w, h, r } = WATCH;
  const x = cx - w / 2;
  const y = cy - h / 2;

  // 表冠与侧键
  const crownX = x + w - 8;
  const crownY = cy - 140;
  ctx.fillStyle = '#2a2c30';
  roundRect(ctx, crownX, crownY, 34, 84, 10);
  ctx.fill();
  ctx.save();
  roundRect(ctx, crownX, crownY, 34, 84, 10);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  const step = 7;
  const off = ((crownPhase % step) + step) % step;
  for (let yy = crownY - step + off; yy < crownY + 84 + step; yy += step) {
    ctx.beginPath();
    ctx.moveTo(crownX + 12, yy);
    ctx.lineTo(crownX + 34, yy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#ff6b35'; // 表冠上的橙色小点
  ctx.beginPath();
  ctx.arc(crownX + 30, crownY + 42, 4, 0, TAU);
  ctx.fill();

  ctx.fillStyle = '#2a2c30';
  roundRect(ctx, x + w - 6, cy + 10, 18, 110, 9);
  ctx.fill();

  // 表壳
  ctx.save();
  ctx.shadowColor = 'rgba(20, 60, 50, 0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#4a4d53');
  g.addColorStop(0.5, '#25272b');
  g.addColorStop(1, '#16171a');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r - 2);
  ctx.stroke();
}

function screenPath(ctx) {
  roundRect(ctx, WATCH.cx - HW, WATCH.cy - HH, SCREEN.w, SCREEN.h, SCREEN.r);
}

function drawScreen(ctx, t, img) {
  const { cx, cy } = WATCH;

  ctx.save();
  screenPath(ctx);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.clip();
  ctx.translate(cx, cy);

  const pan = panOffset(t);
  const press = Math.sin(Math.PI * prog(t, 5.85, 6.15)) * 0.12;
  const open = easeInOutCubic(prog(t, 6.1, 6.8));

  // 先画外圈，最后画中间的黄瓜
  for (const dot of GRID) {
    if (dot.isCenter) continue;
    const start = 1.5 + dot.ring * 0.32 + dot.jitter * 0.12;
    const pop = easeOutBack(prog(t, start, start + 0.45));
    if (pop <= 0) continue;
    const spread = 1 + 0.9 * open;
    const f = fisheye((dot.x + pan.x) * spread, (dot.y + pan.y) * spread);
    drawDot(ctx, dot, f.x, f.y, DOT_R * f.s * pop * (1 + 0.4 * open), 1 - open);
  }

  const centerPop = easeOutBack(prog(t, 1.0, 1.6));
  if (centerPop > 0) {
    const f = fisheye(pan.x, pan.y);
    const baseR = DOT_R * f.s * centerPop * (1 - press);
    const coverR = Math.hypot(HW, HH) + 8;
    const r = lerp(baseR, coverR, open);
    const x = lerp(f.x, 0, open);
    const y = lerp(f.y, 0, open);
    const glow = Math.sin(Math.PI * prog(t, 1.0, 2.2)) * (1 - open);
    const size = lerp(baseR * 2.12, SCREEN.h + 20, open);
    drawImageDot(ctx, img, x, y, r, 1, glow, size, 30 * open);
  }

  drawAppChrome(ctx, prog(t, 6.75, 7.2), prog(t, 7.2, 7.7));

  // 屏幕亮起前的黑幕
  const wake = prog(t, 0.8, 1.05);
  if (wake < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - wake})`;
    ctx.fillRect(-HW, -HH, SCREEN.w, SCREEN.h);
  }

  ctx.restore();

  // 玻璃反光
  ctx.save();
  screenPath(ctx);
  ctx.clip();
  const gl = ctx.createLinearGradient(cx - HW, cy - HH, cx + HW * 0.2, cy + HH * 0.3);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)');
  gl.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  gl.addColorStop(0.46, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(cx - HW, cy - HH, SCREEN.w, SCREEN.h);
  ctx.restore();
}

// App 打开后的顶部标题、时间和底部“已生成”提示
function drawAppChrome(ctx, a, b) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.textBaseline = 'middle';
  ctx.font = `700 34px ${FONT}`;
  ctx.fillStyle = '#2f7d32';
  ctx.textAlign = 'left';
  ctx.fillText('Dots', -HW + 64, -HH + 50);
  ctx.textAlign = 'right';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = '#1d3b2a';
  ctx.fillText('10:09', HW - 64, -HH + 50);
  ctx.restore();

  if (b <= 0) return;
  const k = easeOutBack(b);
  ctx.save();
  ctx.globalAlpha *= b;
  const pw = 230;
  const ph = 60;
  const py = HH - 70 + (1 - k) * 30;
  ctx.fillStyle = 'rgba(29, 59, 42, 0.88)';
  roundRect(ctx, -pw / 2, py - ph / 2, pw, ph, ph / 2);
  ctx.fill();
  ctx.fillStyle = '#8fd36a';
  ctx.beginPath();
  ctx.arc(-pw / 2 + 32, py, 16, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#1d3b2a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-pw / 2 + 24, py);
  ctx.lineTo(-pw / 2 + 30, py + 6);
  ctx.lineTo(-pw / 2 + 40, py - 6);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Dots 已生成', -pw / 2 + 60, py + 1);
  ctx.restore();
}

export function createScene(canvas, img) {
  const ctx = canvas.getContext('2d');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  function render(t) {
    t = clamp(t, 0, DURATION);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawBackground(ctx);

    const intro = easeOutCubic(prog(t, 0, 0.9));
    const pan = panOffset(t);
    const crownPhase = (pan.x * 0.03 + pan.y * 0.12) * 4;

    ctx.save();
    ctx.globalAlpha = intro;
    ctx.translate(WATCH.cx, WATCH.cy + (1 - intro) * 70);
    const s = lerp(0.94, 1, intro);
    ctx.scale(s, s);
    ctx.translate(-WATCH.cx, -WATCH.cy);
    drawBand(ctx, true);
    drawBand(ctx, false);
    drawCase(ctx, crownPhase);
    drawScreen(ctx, t, img);
    ctx.restore();
  }

  return { render };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`图片加载失败：${src}`));
    img.src = src;
  });
}
