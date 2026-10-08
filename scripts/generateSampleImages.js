const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

const sampleDir = path.join(__dirname, 'public', 'sample_images');
if (!fs.existsSync(sampleDir)) fs.mkdirSync(sampleDir, { recursive: true });

function generateFlameImage(fileName, style = 'structural') {
  const width = 640;
  const height = 480;
  const frameData = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Distance from center of flame
      const centerX = width * 0.5 + (Math.sin(y / 30) * 20);
      const centerY = height * 0.65;
      const dx = (x - centerX) / (width * 0.28);
      const dy = (y - centerY) / (height * 0.35);
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Noise factor for flame flicker
      const noise = (Math.sin(x * 0.08) * Math.cos(y * 0.08) + Math.sin(x * 0.02 + y * 0.04)) * 0.35;

      let r = 25, g = 25, b = 30; // Dark night/structure background

      if (style === 'sunset') {
        // Smooth gradient, no flame turbulence
        const sunDist = Math.sqrt(Math.pow((x - width / 2) / 300, 2) + Math.pow((y - height / 2) / 200, 2));
        r = Math.min(255, Math.max(50, Math.floor(255 - sunDist * 120)));
        g = Math.min(200, Math.max(20, Math.floor(130 - sunDist * 90)));
        b = Math.min(180, Math.max(40, Math.floor(50 + sunDist * 60)));
      } else {
        // Flame Core
        const flameValue = Math.max(0, 1 - dist + noise);

        if (flameValue > 0.6) {
          // White-hot / bright yellow flame core
          r = 255;
          g = Math.min(245, Math.floor(210 + flameValue * 40));
          b = Math.min(200, Math.floor(100 + flameValue * 100));
        } else if (flameValue > 0.35) {
          // Intense Orange flame
          r = Math.min(255, Math.floor(230 + flameValue * 40));
          g = Math.min(180, Math.floor(100 + flameValue * 120));
          b = Math.min(60, Math.floor(flameValue * 40));
        } else if (flameValue > 0.15) {
          // Red flame edge
          r = Math.min(240, Math.floor(180 + flameValue * 100));
          g = Math.min(80, Math.floor(flameValue * 120));
          b = 20;
        } else if (y < height * 0.45 && Math.abs(x - centerX) < width * 0.4) {
          // Dark Smoke Plume billowing upward
          const smokeDense = Math.max(0, 1 - Math.abs(x - centerX) / (width * 0.35)) * (1 - y / (height * 0.45));
          const gray = Math.floor(65 + smokeDense * 55 + noise * 15);
          r = gray + 10;
          g = gray;
          b = gray - 5;
        } else {
          // Background silhouettes (buildings/trees)
          if (style === 'wildfire' && y > height * 0.7) {
            r = 35; g = 50; b = 25; // forest floor
          } else if (style === 'industrial') {
            r = 40; g = 45; b = 55; // metal scaffolding
          } else {
            r = 30; g = 32; b = 38; // city concrete
          }
        }
      }

      frameData[idx] = Math.min(255, Math.max(0, r));
      frameData[idx + 1] = Math.min(255, Math.max(0, g));
      frameData[idx + 2] = Math.min(255, Math.max(0, b));
      frameData[idx + 3] = 255;
    }
  }

  const jpegImageData = jpeg.encode({ data: frameData, width, height }, 85);
  const targetPath = path.join(sampleDir, fileName);
  fs.writeFileSync(targetPath, jpegImageData.data);
  console.log(`Generated sample image: ${targetPath}`);
}

generateFlameImage('sample_structural_fire.jpg', 'structural');
generateFlameImage('sample_wildfire.jpg', 'wildfire');
generateFlameImage('sample_chemical_fire.jpg', 'industrial');
generateFlameImage('sample_sunset_safe.jpg', 'sunset');
