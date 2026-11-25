// Joins several pictures into one sprite sheet (.webp), each scaled to the same tile size.
// The Mac has no cwebp/ImageMagick, so this uses the Chromium inside Electron.
// Usage: npx electron scripts/make-sprite.cjs <output.webp> <tileWidth> <tileHeight> <columns> <quality 0-1> <input1> <input2> ...
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const [output, tw, th, cols, q, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) { console.error('Usage: electron scripts/make-sprite.cjs <output.webp> <tileW> <tileH> <columns> <quality> <inputs...>'); process.exit(1); }

app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const sources = inputs.map(f => {
    const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
    return `data:image/${ext};base64,` + fs.readFileSync(f).toString('base64');
  });
  const result = await win.webContents.executeJavaScript(`(async () => {
    const sources = ${JSON.stringify(sources)};
    const tw = ${Number(tw)}, th = ${Number(th)}, cols = ${Number(cols)};
    const rows = Math.ceil(sources.length / cols);
    const c = document.createElement('canvas'); c.width = tw * cols; c.height = th * rows;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < sources.length; i++) {
      const img = new Image(); img.src = sources[i]; await img.decode();
      ctx.drawImage(img, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
    }
    return { w: c.width, h: c.height, data: c.toDataURL('image/webp', ${Number(q)}) };
  })()`);
  fs.writeFileSync(output, Buffer.from(result.data.split(',')[1], 'base64'));
  console.log(`${output}: ${result.w} x ${result.h}, ${inputs.length} tiles, ${Math.round(fs.statSync(output).size / 1024)} KB`);
  app.quit();
});
