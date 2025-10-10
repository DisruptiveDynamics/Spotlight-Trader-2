import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join } from 'path';

const brandDir = join(process.cwd(), 'public/brand');
const logoMarkSvg = readFileSync(join(brandDir, 'logo-mark.svg'));

const sizes = [
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 180, name: 'icon-180.png' },
  { size: 32, name: 'icon-32.png' },
  { size: 16, name: 'icon-16.png' },
];

async function generateIcons() {
  console.log('🎨 Generating raster icons from logo-mark.svg...');

  for (const { size, name } of sizes) {
    await sharp(logoMarkSvg).resize(size, size).png().toFile(join(brandDir, name));
    console.log(`✓ Generated ${name} (${size}x${size})`);
  }

  // Generate favicon.ico fallback (PNG format, widely supported)
  // Note: Sharp doesn't support ICO format, but modern browsers accept PNG
  await sharp(logoMarkSvg).resize(32, 32).png().toFile(join(brandDir, 'favicon.ico'));
  console.log('✓ Generated favicon.ico (32x32 PNG format)');

  // Generate Open Graph image (1200x630 with centered logo)
  const ogWidth = 1200;
  const ogHeight = 630;
  const logoSize = 200;

  const ogSvg = `
    <svg width="${ogWidth}" height="${ogHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${ogWidth}" height="${ogHeight}" fill="#0B0F14"/>
      <g transform="translate(${(ogWidth - logoSize) / 2}, ${(ogHeight - logoSize) / 2 - 40})">
        ${logoMarkSvg
          .toString()
          .replace(/<svg[^>]*>/, '')
          .replace('</svg>', '')
          .replace(/width="[^"]*"/, `width="${logoSize}"`)
          .replace(/height="[^"]*"/, `height="${logoSize}"`)
          .replace(/viewBox="[^"]*"/, `viewBox="0 0 48 48"`)}
      </g>
      <text x="${ogWidth / 2}" y="${ogHeight - 120}" font-family="system-ui, sans-serif" font-size="48" font-weight="700" fill="#F3AE3D" text-anchor="middle">SPOT LIGHT TRADER</text>
      <text x="${ogWidth / 2}" y="${ogHeight - 70}" font-family="system-ui, sans-serif" font-size="24" fill="#8B949E" text-anchor="middle">Real-time AI Trading Coach</text>
    </svg>
  `;

  await sharp(Buffer.from(ogSvg)).png().toFile(join(brandDir, 'og-base.png'));
  console.log(`✓ Generated og-base.png (${ogWidth}x${ogHeight})`);

  console.log('✨ All brand assets generated successfully!');
}

generateIcons().catch(console.error);
