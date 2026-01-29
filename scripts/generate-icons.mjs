import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const iconDir = join(projectRoot, 'public', 'icon');

// Blue-600 from Tailwind (#2563eb)
const BLUE_COLOR = { r: 37, g: 99, b: 235 };

const sizes = [16, 32, 48, 128];

async function generateIcon(size) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="rgb(${BLUE_COLOR.r}, ${BLUE_COLOR.g}, ${BLUE_COLOR.b})" rx="${Math.round(size * 0.15)}"/>
      <text
        x="50%"
        y="55%"
        dominant-baseline="middle"
        text-anchor="middle"
        fill="white"
        font-family="Arial, sans-serif"
        font-weight="bold"
        font-size="${Math.round(size * 0.5)}px"
      >AI</text>
    </svg>
  `;

  const outputPath = join(iconDir, `icon-${size}.png`);
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);

  console.log(`Generated: icon-${size}.png`);
}

async function main() {
  await mkdir(iconDir, { recursive: true });

  for (const size of sizes) {
    await generateIcon(size);
  }

  console.log('All icons generated successfully!');
}

main().catch(console.error);
