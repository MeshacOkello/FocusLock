const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const color = { r: 13, g: 148, b: 136 };

async function generate() {
  const iconsDir = path.join(__dirname, '..', 'icons');
  if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir);

  for (const size of sizes) {
    const buffer = await sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
  }
  console.log('Icons generated successfully');
}

generate().catch(console.error);
