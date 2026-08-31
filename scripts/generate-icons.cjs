#!/usr/bin/env node
/**
 * GVSI SLI Tracker — Icon Generator
 * 
 * Generates all required PWA icon sizes from icon-source.svg
 * 
 * Usage: node scripts/generate-icons.cjs
 * 
 * Requires: npm install sharp (or use the built-in fallback)
 */

const fs = require('fs')
const path = require('path')

const SIZES = [
  { size: 48, name: 'icon-48.png', purpose: 'any' },
  { size: 96, name: 'icon-96.png', purpose: 'any' },
  { size: 180, name: 'icon-180.png', purpose: 'apple-touch-icon' },
  { size: 192, name: 'icon-192.png', purpose: 'any' },
  { size: 512, name: 'icon-512.png', purpose: 'any' },
  { size: 512, name: 'icon-512-maskable.png', purpose: 'maskable' },
]

const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const SVG_SOURCE = path.join(PUBLIC_DIR, 'icon-source.svg')

async function generateWithSharp() {
  const sharp = require('sharp')
  const svgBuffer = fs.readFileSync(SVG_SOURCE)

  for (const { size, name } of SIZES) {
    const outputPath = path.join(PUBLIC_DIR, name)
    
    if (name.includes('maskable')) {
      // Maskable: add padding (10% safe zone on each side)
      const padded = Math.round(size * 1.2)
      await sharp(svgBuffer)
        .resize(padded, padded, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .resize(size, size, { fit: 'contain' })
        .png()
        .toFile(outputPath)
    } else {
      await sharp(svgBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 15, g: 23, b: 42, alpha: 1 } })
        .png()
        .toFile(outputPath)
    }
    
    console.log(`✅ Generated ${name} (${size}×${size})`)
  }
}

async function generateFallback() {
  console.log('⚠️  sharp not installed. Generating placeholder HTML for manual export...')
  console.log('   Run: npm install sharp && node scripts/generate-icons.cjs')
  console.log('')
  console.log('   Or open scripts/icon-preview.html in browser to export manually.')
  
  // Generate an HTML preview page for manual export
  const svgContent = fs.readFileSync(SVG_SOURCE, 'utf8')
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>GVSI SLI Tracker — Icon Export</title>
  <style>
    body { font-family: system-ui; background: #0F172A; color: white; padding: 2rem; }
    h1 { color: #00F2FE; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 2rem; }
    .card { background: #1E293B; border-radius: 12px; padding: 1.5rem; text-align: center; }
    .card img { max-width: 100%; border-radius: 8px; margin-bottom: 1rem; }
    .card p { font-size: 0.875rem; color: #94A3B8; }
    .card strong { color: #10B981; }
    canvas { display: none; }
  </style>
</head>
<body>
  <h1>GVSI SLI Tracker — Icon Export</h1>
  <p>Right-click each icon → "Save Image As" to download as PNG</p>
  <div class="grid" id="icons"></div>
  <script>
    const sizes = [
      { size: 48, label: 'Favicon (48×48)' },
      { size: 96, label: 'Standard (96×96)' },
      { size: 180, label: 'Apple Touch (180×180)' },
      { size: 192, label: 'Android (192×192)' },
      { size: 512, label: 'Splash Screen (512×512)' },
    ];
    
    const grid = document.getElementById('icons');
    const svgStr = ${JSON.stringify(svgContent)};
    
    sizes.forEach(({ size, label }) => {
      const card = document.createElement('div');
      card.className = 'card';
      
      const img = document.createElement('img');
      img.src = 'data:image/svg+xml;base64,' + btoa(svgStr);
      img.width = Math.min(size, 256);
      img.height = Math.min(size, 256);
      
      const p = document.createElement('p');
      p.innerHTML = '<strong>' + label + '</strong>';
      
      const btn = document.createElement('a');
      btn.href = '#';
      btn.textContent = 'Download PNG';
      btn.style.cssText = 'display:inline-block;margin-top:0.5rem;padding:0.5rem 1rem;background:#10B981;color:white;border-radius:6px;text-decoration:none;font-size:0.875rem;';
      btn.onclick = (e) => {
        e.preventDefault();
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        const img2 = new Image();
        img2.onload = () => {
          ctx.drawImage(img2, 0, 0, size, size);
          URL.revokeObjectURL(url);
          const a = document.createElement('a');
          a.download = 'icon-' + size + '.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
        };
        img2.src = url;
      };
      
      card.appendChild(img);
      card.appendChild(p);
      card.appendChild(btn);
      grid.appendChild(card);
    });
  </script>
</body>
</html>`
  
  fs.writeFileSync(path.join(__dirname, 'icon-preview.html'), html)
  console.log('✅ Created scripts/icon-preview.html — open in browser to export icons')
}

async function main() {
  console.log('🎨 GVSI SLI Tracker — Icon Generator\n')
  
  if (!fs.existsSync(SVG_SOURCE)) {
    console.error('❌ icon-source.svg not found in public/')
    process.exit(1)
  }
  
  try {
    await generateWithSharp()
    console.log('\n✅ All icons generated in public/')
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      await generateFallback()
    } else {
      throw e
    }
  }
}

main().catch(console.error)
