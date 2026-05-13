'use strict';
// 生成 assets/icon.ico（包含 16x16、32x32、48x48、256x256 四种尺寸）
const fs   = require('fs');
const path = require('path');

function makeIcoBitmap(size) {
  const cx = size / 2, cy = size / 2, r2 = (size * 0.42) ** 2;

  // BITMAPINFOHEADER（40 字节）
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40,       0);  // 头部大小
  header.writeInt32LE(size,      4);  // 宽
  header.writeInt32LE(size * 2,  8);  // 高 × 2（ICO 规范：含 AND mask）
  header.writeUInt16LE(1,       12);  // 颜色平面数
  header.writeUInt16LE(32,      14);  // 位深：32bpp BGRA

  // 像素数据（BGRA，BMP 逐行底部到顶部存储）
  const pixels = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = size - 1 - y;          // BMP 行序反转
      const off = (row * size + x) * 4;
      if ((x - cx) ** 2 + (y - cy) ** 2 < r2) {
        pixels[off]     = 0xD4; // B  (#0078D4 Windows 蓝)
        pixels[off + 1] = 0x78; // G
        pixels[off + 2] = 0x00; // R
        pixels[off + 3] = 0xFF; // A
      }
    }
  }

  // AND mask（1bpp，每行对齐 4 字节，全 0 = 完全可见）
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(size * maskRowBytes, 0);

  return Buffer.concat([header, pixels, mask]);
}

function buildIco(sizes) {
  const bitmaps   = sizes.map(makeIcoBitmap);
  const dataStart = 6 + 16 * sizes.length;

  // 计算每张图片的偏移量
  const offsets = [];
  let cur = dataStart;
  for (const bmp of bitmaps) { offsets.push(cur); cur += bmp.length; }

  // ICO 文件头（6 字节）
  const fileHeader = Buffer.alloc(6);
  fileHeader.writeUInt16LE(0,            0); // 保留
  fileHeader.writeUInt16LE(1,            2); // 类型 1 = ICO
  fileHeader.writeUInt16LE(sizes.length, 4); // 图片数量

  // 图片目录（每条 16 字节）
  const dirs = sizes.map((s, i) => {
    const d = Buffer.alloc(16);
    // ICO 规范：宽/高字段为 byte，256 用 0 表示
    d[0] = s >= 256 ? 0 : s;
    d[1] = s >= 256 ? 0 : s;
    d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1,               4); // 颜色平面数
    d.writeUInt16LE(32,              6); // 位深
    d.writeUInt32LE(bitmaps[i].length, 8);  // 数据大小
    d.writeUInt32LE(offsets[i],      12); // 数据偏移
    return d;
  });

  return Buffer.concat([fileHeader, ...dirs, ...bitmaps]);
}

const outPath = path.join(__dirname, '..', 'assets', 'icon.ico');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buildIco([16, 32, 48, 256]));
console.log('生成成功：assets/icon.ico');
