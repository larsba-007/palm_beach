// Converts an image (PNG/JPG) to .webp, keeping transparency.
// The Mac has no cwebp tool, so this uses the Chromium inside Electron (already installed for the Steam builds).
// Usage: npx electron scripts/png-to-webp.cjs <input> <output.webp> [quality 0-1, default 0.92] [width]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const [input, output, q = '0.92', width = ''] = process.argv.slice(2);
if (!input || !output) { console.error('Usage: electron scripts/png-to-webp.cjs <input> <output.webp> [quality] [width]'); process.exit(1); }

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const ext = path.extname(input).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const src = `data:image/${ext};base64,` + fs.readFileSync(input).toString('base64');
  const result = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    const w = ${Number(width) || 0} || img.naturalWidth;
    const h = Math.round(img.naturalHeight * w / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, w, h);
    return { w, h, data: c.toDataURL('image/webp', ${Number(q)}) };
  })()`);
  fs.writeFileSync(output, Buffer.from(result.data.split(',')[1], 'base64'));
  console.log(`${output}: ${result.w} x ${result.h}, ${Math.round(fs.statSync(output).size / 1024)} KB`);
  app.quit();
});
