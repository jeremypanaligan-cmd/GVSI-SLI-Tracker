// Quick test to verify MTD column mapping
const https = require('https')

const MTD_URL = 'https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/export?format=csv&gid=1061751267'

https.get(MTD_URL, (res) => {
  let data = ''
  res.on('data', chunk => data += chunk)
  res.on('end', () => {
    const lines = data.split('\n').map(l => l.trim()).filter(l => l)
    
    // Find the OVER ALL TOTAL row in August 2026 section
    let inAug = false
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split(',')
      
      if (cells[0] && cells[0].includes('August 2026')) {
        inAug = true
        console.log('\n=== August 2026 Section ===')
        continue
      }
      if (cells[0] && cells[0].includes('September 2026')) {
        inAug = false
        continue
      }
      
      if (inAug && cells[0] && cells[0].includes('OVER ALL TOTAL')) {
        console.log('\n=== OVER ALL TOTAL Row (Aug) ===')
        console.log('Full line:', lines[i])
        console.log('Cell count:', cells.length)
        cells.forEach((c, idx) => {
          console.log(`  [${idx}] = "${c.trim()}"`)
        })
        
        // Show what buildMTDEntry would extract
        console.log('\n=== What buildMTDEntry(rawArr) would extract ===')
        console.log(`  rawArr[0] (area):      "${cells[0].trim()}"`)
        console.log(`  rawArr[1] (compTotal):  "${cells[1]?.trim()}"`)
        console.log(`  rawArr[2] (compRjo):    "${cells[2]?.trim()}"`)
        console.log(`  rawArr[3] (totalComp):  "${cells[3]?.trim()}"`)
        console.log(`  rawArr[4] (thisMoRjo):  "${cells[4]?.trim()}"`)
        console.log(`  rawArr[5] (prevMosRjo): "${cells[5]?.trim()}"`)
        console.log(`  rawArr[6] (totalRjo):   "${cells[6]?.trim()}"`)
        console.log(`  rawArr[7] (lastMtd):    "${cells[7]?.trim()}"`)
        console.log(`  rawArr[8] (target):     "${cells[8]?.trim()}"`)
        console.log(`  rawArr[9] (lastPct):    "${cells[9]?.trim()}"`)
        console.log(`  rawArr[10]:              "${cells[10]?.trim()}"`)
        break
      }
    }
    
    // Also show the header row
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('AREA,')) {
        console.log('\n=== Header Row ===')
        const hcells = lines[i].split(',')
        hcells.forEach((c, idx) => {
          console.log(`  [${idx}] = "${c.trim()}"`)
        })
        break
      }
    }
  })
}).on('error', console.error)
