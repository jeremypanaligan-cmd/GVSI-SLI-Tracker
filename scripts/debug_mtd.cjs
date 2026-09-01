// Quick verification of MTD CSV parsing
const { parseCSV } = require('../src/utils/csvParser.js')
// Won't work - ES modules. Use fetch instead.

const https = require('https')
const http = require('http')

const url = 'https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/export?format=csv&gid=1061751267'

function fetchUrl(u) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('https') ? https : http
    mod.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve, reject)
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

async function main() {
  const csvText = await fetchUrl(url)
  console.log('CSV length:', csvText.length)
  console.log('First 10 chars hex:', Buffer.from(csvText.substring(0, 10)).toString('hex'))
  
  // Manual parse (same as csvParser.js)
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const allRows = []
  let currentRow = []
  let currentCell = ''
  let inQuotes = false
  
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]
    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentCell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
      if (currentRow.length > 0) {
        allRows.push(currentRow)
      }
      currentRow = []
    } else {
      currentCell += char
    }
  }
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    allRows.push(currentRow)
  }
  
  console.log('\nTotal rows:', allRows.length)
  
  // Find header
  let headerIdx = 0
  for (let i = 0; i < allRows.length; i++) {
    const ne = allRows[i].filter(c => c !== '')
    if (ne.length >= 5) { headerIdx = i; break }
  }
  console.log('Header index:', headerIdx)
  console.log('Header:', allRows[headerIdx])
  
  // Find OVER ALL TOTAL for August 2026
  let inAug = false
  for (let i = 0; i < allRows.length; i++) {
    const first = String(allRows[i][0] || '').trim()
    if (first.includes('August 2026')) { inAug = true; continue }
    if (first.includes('September')) { inAug = false; continue }
    if (inAug && first.includes('OVER ALL')) {
      const arr = allRows[i]
      console.log('\n=== OVER ALL TOTAL (August) ===')
      console.log('Cell count:', arr.length)
      arr.forEach((c, idx) => console.log(`  [${idx}] = "${c}"`))
      
      console.log('\n=== buildMTDEntry mapping ===')
      console.log(`  lastMtd (rawArr[7]):   "${arr[7]}" → ${Number(String(arr[7]).replace(/,/g, ''))}`)
      console.log(`  target (rawArr[8]):    "${arr[8]}" → ${Number(String(arr[8]).replace(/,/g, ''))}`)
      console.log(`  lastPct (rawArr[9]):   "${arr[9]}"`)
      console.log(`  All cells beyond [9]:`, arr.slice(10))
      break
    }
  }
}

main().catch(console.error)
