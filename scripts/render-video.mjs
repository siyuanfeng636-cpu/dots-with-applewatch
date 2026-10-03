// 用无头 Chromium 逐帧渲染 Canvas，再用 ffmpeg 编码成 MP4。
// 用法：npm run render [-- --fps 30 --out media/dots-applewatch.mp4]
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const { values } = parseArgs({
  options: {
    fps: { type: 'string', default: '30' },
    out: { type: 'string', default: 'media/dots-applewatch.mp4' },
    poster: { type: 'string', default: 'media/poster.png' },
  },
});
const fps = Number(values.fps);

const { server, port } = await startServer(0);
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/index.html?export`);
  await page.evaluate(() => window.__dotsReady);
  const duration = await page.evaluate(() => window.__dots.DURATION);

  const frame = (t) =>
    page.evaluate((time) => {
      window.__dots.render(time);
      return window.__dots.canvas.toDataURL('image/png').split(',')[1];
    }, t);

  await mkdir(dirname(values.out), { recursive: true });
  const ffmpeg = spawn(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', values.out],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const done = new Promise((ok, fail) => {
    ffmpeg.on('error', fail);
    ffmpeg.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg 退出码 ${code}`))));
  });

  const total = Math.round(duration * fps);
  for (let i = 0; i <= total; i++) {
    const buf = Buffer.from(await frame(i / fps), 'base64');
    if (!ffmpeg.stdin.write(buf)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
    if (i % fps === 0) process.stdout.write(`\r渲染中 ${i}/${total} 帧`);
  }
  ffmpeg.stdin.end();
  await done;
  console.log(`\n视频：${values.out}`);

  await writeFile(values.poster, Buffer.from(await frame(7.8), 'base64'));
  console.log(`封面：${values.poster}`);
} finally {
  await browser.close();
  server.close();
}
