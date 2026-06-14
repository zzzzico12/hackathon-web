import sharp from "sharp";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

// SVG icon: black circle + white triangle (play/forward arrow)
function makeSvg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const triSize = size * 0.38;
  // Equilateral-ish triangle pointing up, centered
  const tx = cx;
  const ty = cy + triSize * 0.1;
  const p1 = `${tx},${ty - triSize * 0.7}`;
  const p2 = `${tx + triSize * 0.65},${ty + triSize * 0.55}`;
  const p3 = `${tx - triSize * 0.65},${ty + triSize * 0.55}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${cx}" fill="#111111"/>
  <polygon points="${p1} ${p2} ${p3}" fill="white"/>
</svg>`;
}

async function generate(size, filename) {
  const svg = Buffer.from(makeSvg(size));
  await sharp(svg).png().toFile(join(publicDir, filename));
  console.log(`Generated ${filename} (${size}x${size})`);
}

await generate(192, "icon-192.png");
await generate(512, "icon-512.png");
await generate(180, "apple-touch-icon.png");
console.log("Done.");
