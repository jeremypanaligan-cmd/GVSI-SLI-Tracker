const fs = require('fs')
const path = require('path')

// Minimal 192x192 PNG with cyan "SLI" text on dark background
// Using a simple solid color PNG generator (no dependencies)

function createPNG(size, r, g, b) {
  // Create a minimal valid PNG file
  const width = size
  const height = size

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 2  // color type: RGB
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace
  const ihdr = createChunk('IHDR', ihdrData)

  // IDAT chunk - create image data with a gradient-like pattern
  const rawData = []
  for (let y = 0; y < height; y++) {
    rawData.push(0) // filter byte: None
    for (let x = 0; x < width; x++) {
      // Create a rounded rectangle background
      const cx = width / 2
      const cy = height / 2
      const rx = width * 0.42
      const ry = height * 0.42
      const cornerR = width * 0.12

      const dx = Math.abs(x - cx) - (rx - cornerR)
      const dy = Math.abs(y - cy) - (ry - cornerR)

      let inShape = false
      if (dx <= 0 && dy <= 0) {
        inShape = true
      } else if (dx > 0 && dy > 0) {
        inShape = (dx * dx + dy * dy) <= cornerR * cornerR
      } else {
        inShape = (dx <= 0 || dy <= 0)
      }

      if (inShape) {
        // Cyan gradient background
        const t = y / height
        const cr = Math.round(6 + t * 0)
        const cg = Math.round(182 - t * 40)
        const cb = Math.round(212 - t * 30)
        rawData.push(cr, cg, cb)

        // Draw "SLI" text area (center rectangle)
        const textLeft = width * 0.2
        const textRight = width * 0.8
        const textTop = height * 0.3
        const textBottom = height * 0.7

        if (x >= textLeft && x <= textRight && y >= textTop && y <= textBottom) {
          // Dark text area
          const inTextRegion = true
          // Simple letter shapes for S, L, I
          const letterWidth = (textRight - textLeft) / 3
          const sLeft = textLeft
          const sRight = textLeft + letterWidth * 0.8
          const lLeft = textLeft + letterWidth * 1.1
          const lRight = textLeft + letterWidth * 1.9
          const iLeft = textLeft + letterWidth * 2.2
          const iRight = textLeft + letterWidth * 2.8

          const relY = (y - textTop) / (textBottom - textTop)
          const letterThickness = 0.15

          let isLetter = false

          // S
          if (x >= sLeft && x <= sRight) {
            if (relY < letterThickness || (relY > 0.5 - letterThickness/2 && relY < 0.5 + letterThickness/2) || relY > 1 - letterThickness) {
              isLetter = true
            }
            if (relY >= 0 && relY < 0.5 && x < sLeft + letterWidth * 0.3) isLetter = true
            if (relY > 0.5 && relY <= 1 && x > sRight - letterWidth * 0.3) isLetter = true
          }

          // L
          if (x >= lLeft && x <= lRight) {
            if (x < lLeft + letterThickness * letterWidth) isLetter = true
            if (relY > 1 - letterThickness) isLetter = true
          }

          // I
          if (x >= iLeft && x <= iRight) {
            if (relY < letterThickness || relY > 1 - letterThickness) isLetter = true
            if (x > iLeft + letterWidth * 0.3 && x < iRight - letterWidth * 0.3 + letterWidth * 0.1) isLetter = true
          }

          if (isLetter) {
            rawData.push(2, 6, 23) // Dark text color
          }
        }
      } else {
        // Transparent-ish dark background (use dark)
        rawData.push(2, 6, 23)
      }
    }
  }

  const compressed = require('zlib').deflateSync(Buffer.from(rawData))
  const idat = createChunk('IDAT', compressed)

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function createChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)

  const typeBuffer = Buffer.from(type, 'ascii')
  const crcData = Buffer.concat([typeBuffer, data])

  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcData), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(buf) {
  let c = 0xffffffff
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let cval = n
    for (let k = 0; k < 8; k++) {
      cval = (cval & 1) ? (0xedb88320 ^ (cval >>> 1)) : (cval >>> 1)
    }
    table[n] = cval
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

const publicDir = path.join(__dirname, '..', 'public')

const png192 = createPNG(192, 6, 182, 212)
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192)
console.log('Created icon-192.png')

const png512 = createPNG(512, 6, 182, 212)
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512)
console.log('Created icon-512.png')
