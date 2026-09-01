/**
 * GVSI SLI Tracker - Automated Database Management v8
 * 
 * FIBERX NEW REPORT format:
 *   AREA | BF | INC | TOTAL | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | RJO THIS MO. | RJO REDISPATCHED | TOTAL RJO | CARRY OVER | MTD | TARGET | %
 *   Cols: A  B    C     D       E                     F                    G
 *         H              I              J              K           L     M      N
 *
 * RAW DATA format (continuous table):
 *   Date | AREA | BF | INC | Total Jo | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | RJO INCOMING | RJO REDISPATCHED | TOTAL RJO | Carry Over | MTD | TARGET | %
 *   Cols: A     B     C    D     E         F                     G                   H
 *         I               J              K           L           M      N       O
 *
 * MTD format:
 *   AREA | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | THIS MO. RJO | PREV MOS. RJO | TOTAL RJO | LAST MTD | TARGET | LAST %
 *   Cols: A    B                     C                   D
 *         E               F              G           H        I       J
 */

const FIBERX_SHEET_NAME = 'FIBERX NEW REPORT';
const RAW_DATA_SHEET_NAME = 'RAW DATA';
const MTD_SHEET_NAME = 'MTD';

// Areas are now dynamically detected from RAW DATA — no hardcoded list needed

const RAW_HEADER = [
  'Date', 'AREA', 'BF', 'INC', 'Total Jo',
  'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'RJO INCOMING', 'RJO REDISPATCHED', 'TOTAL RJO',
  'Carry Over', 'MTD', 'TARGET', '%'
];

const MTD_HEADER = [
  'AREA', 'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'THIS MO. RJO', 'PREV MOS. RJO', 'TOTAL RJO',
  'LAST MTD', 'TARGET', 'LAST %'
];

// ==================== IMPORT ====================

function importFiberxToRawData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fiberxSheet = ss.getSheetByName(FIBERX_SHEET_NAME);
  var rawSheet = ss.getSheetByName(RAW_DATA_SHEET_NAME);
  
  if (!fiberxSheet || !rawSheet) {
    try { SpreadsheetApp.getUi().alert('Error: Sheet not found.'); } catch(e) {}
    return;
  }
  
  // Clear ALL data in RAW DATA
  rawSheet.clear();
  
  // Write single header in row 1
  rawSheet.getRange(1, 1, 1, RAW_HEADER.length).setValues([RAW_HEADER]);
  rawSheet.getRange(1, 1, 1, RAW_HEADER.length).setFontWeight(true);
  
  // Read FIBERX data
  var fiberxData = fiberxSheet.getDataRange().getValues();
  var allRows = [];
  var currentDate = '';
  
  for (var i = 0; i < fiberxData.length; i++) {
    var row = fiberxData[i];
    var firstCell = String(row[0]).trim();
    
    // Detect block header
    if (firstCell.includes('SLI DAILY TRACKING REPORT as of')) {
      var dateMatch = firstCell.match(/__(.+?)__/);
      if (!dateMatch) dateMatch = firstCell.match(/as of\s+(.+?)$/);
      if (dateMatch) {
        currentDate = formatExportDate(dateMatch[1].trim());
      }
      continue;
    }
    
    // Skip non-data rows
    if (firstCell === 'FIBERX' || firstCell === '' || firstCell === 'AREA') continue;
    if (firstCell.includes('FROM TOTAL') || firstCell === 'BF') continue;
    if (firstCell.startsWith(',,,,')) continue;
    
    if (!currentDate) continue;
    
    // FIBERX columns: AREA(0) BF(1) INC(2) TOTAL(3) COMP_FROM_TOTAL(4) COMP_FROM_RJO(5)
    //   TOTAL_COMPLETED(6) RJO_THIS_MO(7) RJO_REDISPATCHED(8) TOTAL_RJO(9)
    //   CARRY_OVER(10) MTD(11) TARGET(12) %(13)
    var bf = cleanNum(row[1]);
    var inc = cleanNum(row[2]);
    var total = cleanNum(row[3]);
    var fromTotal = cleanNum(row[4]);
    var fromRjo = cleanNum(row[5]);
    var completedTotal = cleanNum(row[6]);
    var rjoThisMo = cleanNum(row[7]);
    var rjoRedispatched = cleanNum(row[8]);
    var totalRjo = cleanNum(row[9]);
    var carryOver = cleanNum(row[10]);
    var mtd = cleanNum(row[11]);
    var target = cleanNum(row[12]);
    var pct = String(row[13] || '0.00%').trim();
    
    var areaName = '';
    if (firstCell === 'OVER ALL TOTAL') {
      areaName = 'OVER ALL TOTAL';
    } else if (firstCell.length > 0) {
      areaName = firstCell;
    }
    
    if (areaName) {
      // RAW DATA columns: Date(0) AREA(1) BF(2) INC(3) TotalJo(4)
      //   CompFromTotal(5) CompFromRjo(6) TotalCompleted(7)
      //   RjoIncoming(8) RjoRedispatched(8) TotalRjo(9)
      //   CarryOver(10) MTD(11) Target(12) %(13)
      allRows.push([
        currentDate, areaName, bf, inc, total,
        fromTotal, fromRjo, completedTotal,
        rjoThisMo, rjoRedispatched, totalRjo,
        carryOver, mtd, target, pct
      ]);
    }
  }
  
  // Write all data rows starting at row 2
  if (allRows.length > 0) {
    rawSheet.getRange(2, 1, allRows.length, RAW_HEADER.length).setValues(allRows);
  }
  
  // Apply formatting
  applyRawDataFormat(rawSheet);
  applyOverAllTotalFormatting(rawSheet);
  
  try { SpreadsheetApp.getUi().alert('Import Complete!\n\nImported ' + allRows.length + ' data rows.'); } catch(e) {}
}

function formatExportDate(dateStr) {
  var cleaned = dateStr.replace(/\./g, '').replace(/,/g, '').replace(/__/g, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned;
}

function applyRawDataFormat(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var dataRows = lastRow - 1;
  // C-O (cols 3-15): numbers with comma
  sheet.getRange(2, 3, dataRows, 13).setNumberFormat('#,##0');
  // P (col 16 — actually col 15 = %): percentage
  sheet.getRange(2, 15, dataRows, 1).setNumberFormat('0.00%');
}

/**
 * Format OVER ALL TOTAL rows with black background and white bold text
 */
function applyOverAllTotalFormatting(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var data = sheet.getRange(2, 1, lastRow - 1, RAW_HEADER.length).getValues();
  
  for (var i = 0; i < data.length; i++) {
    var areaCell = String(data[i][1]).trim(); // Column B = AREA
    if (areaCell === 'OVER ALL TOTAL') {
      var rowNum = i + 2;
      var rowRange = sheet.getRange(rowNum, 1, 1, RAW_HEADER.length);
      rowRange.setBackground('#000000');
      rowRange.setFontColor('#FFFFFF');
      rowRange.setFontWeight('bold');
    }
  }
}

// ==================== MTD REPORT ====================

function generateMTDReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = ss.getSheetByName(RAW_DATA_SHEET_NAME);
  var mtdSheet = ss.getSheetByName(MTD_SHEET_NAME);
  
  if (!mtdSheet) mtdSheet = ss.insertSheet(MTD_SHEET_NAME);
  else mtdSheet.clear();
  
  if (!rawSheet) {
    try { SpreadsheetApp.getUi().alert('RAW DATA sheet not found.'); } catch(e) {}
    return;
  }
  
  var rawData = rawSheet.getDataRange().getValues();
  var dailyData = parseRawData(rawData);
  
  if (dailyData.length === 0) {
    try { SpreadsheetApp.getUi().alert('No data found in RAW DATA.'); } catch(e) {}
    return;
  }
  
  var monthlyData = groupByMonth(dailyData);
  var currentRow = 1;
  
  // Title row
  mtdSheet.getRange(currentRow, 1).setValue('SLI MTD TRACKING REPORT');
  mtdSheet.getRange(currentRow, 1).setFontWeight(true).setFontSize(14);
  currentRow += 2;
  
  var months = Object.keys(monthlyData).sort();
  
  for (var m = 0; m < months.length; m++) {
    var monthKey = months[m];
    var monthData = monthlyData[monthKey];
    var parts = monthKey.split('-');
    var monthName = getMonthName(parseInt(parts[1]));
    var monthYearLabel = monthName + ' ' + parts[0];
    
    // Month Year row — Lexend, white text, bold, purple bg
    var monthRowRange = mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length);
    monthRowRange.setValue(monthYearLabel);
    monthRowRange.setFontFamily('Lexend');
    monthRowRange.setFontColor('#FFFFFF');
    monthRowRange.setFontWeight('bold');
    monthRowRange.setBackground('#9900FF');
    monthRowRange.merge();
    currentRow++;
    
    // MTD header row
    mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setValues([MTD_HEADER]);
    mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setFontWeight(true);
    currentRow++;
    
    var lastDay = monthData[monthData.length - 1];
    
    // Dynamically discover all areas from the last day's data
    var dynamicAreas = Object.keys(lastDay.areas).sort();
    
    for (var a = 0; a < dynamicAreas.length; a++) {
      var area = dynamicAreas[a];
      var areaData = lastDay.areas[area];
      if (!areaData) continue;
      
      // Sum across all days in the month
      var totalCompFromTotal = 0, totalCompFromRjo = 0, totalComp = 0;
      var totalRjoIncoming = 0, totalRjoRedispatched = 0;
      for (var d = 0; d < monthData.length; d++) {
        var ad = monthData[d].areas[area];
        if (ad) {
          totalCompFromTotal += ad.compFromTotal || 0;
          totalCompFromRjo += ad.compFromRjo || 0;
          totalComp += ad.totalCompleted || 0;
          totalRjoIncoming += ad.rjoIncoming || 0;
          totalRjoRedispatched += ad.rjoRedispatched || 0;
        }
      }
      
      var totalRjo = totalRjoIncoming + totalRjoRedispatched;
      
      mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setValues([[
        area, totalCompFromTotal, totalCompFromRjo, totalComp,
        totalRjoIncoming, totalRjoRedispatched, totalRjo,
        areaData.mtd, areaData.target, areaData.pct
      ]]);
      currentRow++;
    }
    
    // OVER ALL TOTAL
    var tCompFromTotal = 0, tCompFromRjo = 0, tComp = 0;
    var tRjoIncoming = 0, tRjoRedispatched = 0;
    for (var d = 0; d < monthData.length; d++) {
      var da = Object.values(monthData[d].areas);
      for (var aa = 0; aa < da.length; aa++) {
        tCompFromTotal += da[aa].compFromTotal || 0;
        tCompFromRjo += da[aa].compFromRjo || 0;
        tComp += da[aa].totalCompleted || 0;
        tRjoIncoming += da[aa].rjoIncoming || 0;
        tRjoRedispatched += da[aa].rjoRedispatched || 0;
      }
    }
    
    var tTotalRjo = tRjoIncoming + tRjoRedispatched;
    
    var lt = lastDay.overallTotal;
    var lm = lt ? lt.mtd : 0;
    var ltarget = lt ? lt.target : 0;
    var lpct = ltarget > 0 ? (lm / ltarget) : 0;
    
    // OVER ALL TOTAL row — Lexend, black text, bold italic, teal bg
    var totalRowRange = mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length);
    totalRowRange.setValues([[
      'OVER ALL TOTAL', tCompFromTotal, tCompFromRjo, tComp,
      tRjoIncoming, tRjoRedispatched, tTotalRjo,
      lm, ltarget, lpct
    ]]);
    totalRowRange.setFontFamily('Lexend');
    totalRowRange.setFontColor('#000000');
    totalRowRange.setFontWeight('bold');
    totalRowRange.setFontStyle('italic');
    totalRowRange.setBackground('#87C5D0');
    currentRow += 3;
  }
  
  // Apply number formatting to data rows
  applyMTDFormatting(mtdSheet);
  
  for (var c = 1; c <= MTD_HEADER.length; c++) mtdSheet.autoResizeColumn(c);
  
  try { SpreadsheetApp.getUi().alert('MTD Report Generated!'); } catch(e) {}
}

/**
 * Apply number formatting to MTD data rows (skip title, month headers, and sub-headers)
 */
function applyMTDFormatting(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 4) return;
  
  // Scan for data rows (skip title row 1, skip month/year merged rows, skip header rows)
  for (var r = 1; r <= lastRow; r++) {
    var cellA = String(sheet.getRange(r, 1).getValue()).trim();
    
    // Skip title, month headers, area headers, and empty rows
    if (cellA === 'SLI MTD TRACKING REPORT' || cellA === '' || cellA === 'AREA') continue;
    if (cellA.includes('202') && cellA.length < 20) continue; // month year rows like "September 2026"
    
    // Check if this is a data row (has a number or area name)
    var cellB = sheet.getRange(r, 2).getValue();
    if (typeof cellB === 'number' || cellB === 0) {
      // B-F (cols 2-6): COMPLETED FROM TOTAL, COMPLETED FROM RJO, TOTAL COMPLETED, THIS MO. RJO, PREV MOS. RJO → #,##0
      sheet.getRange(r, 2, 1, 5).setNumberFormat('#,##0');
      // G (col 7): TOTAL RJO → #,##0
      sheet.getRange(r, 7).setNumberFormat('#,##0');
      // H (col 8): LAST MTD → #,##0
      sheet.getRange(r, 8).setNumberFormat('#,##0');
      // I (col 9): TARGET → #,##0
      sheet.getRange(r, 9).setNumberFormat('#,##0');
      // J (col 10): LAST % → 0.00%
      sheet.getRange(r, 10).setNumberFormat('0.00%');
    }
  }
}

// ==================== PARSING ====================

function parseRawData(rawData) {
  var dailyData = [];
  var currentBlock = null;
  
  for (var i = 1; i < rawData.length; i++) {
    var row = rawData[i];
    var dateStr = String(row[0]).trim();  // Column A = Date
    var areaStr = String(row[1]).trim();  // Column B = AREA
    
    if (!dateStr && !areaStr) continue;
    
    if (dateStr && (!currentBlock || currentBlock.dateStr !== dateStr)) {
      if (currentBlock) dailyData.push(currentBlock);
      currentBlock = { date: parseExportDate(dateStr), dateStr: dateStr, areas: {}, overallTotal: null };
    }
    
    if (!currentBlock) continue;
    
    // RAW DATA v8 columns:
    // Date(0) AREA(1) BF(2) INC(3) TotalJo(4) CompFromTotal(5) CompFromRjo(6) TotalCompleted(7)
    // RjoIncoming(8) RjoRedispatched(9) TotalRjo(10) CarryOver(11) MTD(12) TARGET(13) %(14)
    var entry = {
      bf: cleanNum(row[2]), inc: cleanNum(row[3]), totalJo: cleanNum(row[4]),
      compFromTotal: cleanNum(row[5]), compFromRjo: cleanNum(row[6]), totalCompleted: cleanNum(row[7]),
      rjoIncoming: cleanNum(row[8]), rjoRedispatched: cleanNum(row[9]), totalRjo: cleanNum(row[10]),
      carryOver: cleanNum(row[11]), mtd: cleanNum(row[12]),
      target: cleanNum(row[13]), pct: String(row[14]).trim()
    };
    
    if (areaStr === 'OVER ALL TOTAL') {
      currentBlock.overallTotal = entry;
    } else if (areaStr && areaStr !== 'AREA') {
      // Use the exact area name from RAW DATA — no hardcoded filtering
      currentBlock.areas[areaStr] = entry;
    }
  }
  
  if (currentBlock) dailyData.push(currentBlock);
  return dailyData;
}

function cleanNum(val) {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    var cleaned = val.replace(/["',\s]/g, '');
    var num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

function parseExportDate(dateStr) {
  var months = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
  var match = dateStr.match(/(\w+)\s+(\d+),?\s*(\d{4})/);
  if (match) return new Date(parseInt(match[3]), months[match[1].substring(0, 3)], parseInt(match[2]));
  // Also handle "Aug 1 2026" format (no comma)
  var match2 = dateStr.match(/(\w+)\s+(\d+)\s+(\d{4})/);
  if (match2) return new Date(parseInt(match2[3]), months[match2[1].substring(0, 3)], parseInt(match2[2]));
  return null;
}

function groupByMonth(dailyData) {
  var grouped = {};
  for (var i = 0; i < dailyData.length; i++) {
    var day = dailyData[i];
    if (!day.date) continue;
    var monthKey = day.date.getFullYear() + '-' + String(day.date.getMonth() + 1).padStart(2, '0');
    if (!grouped[monthKey]) grouped[monthKey] = [];
    grouped[monthKey].push(day);
  }
  return grouped;
}

function getMonthName(monthNum) {
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthNum - 1] || '';
}

// ==================== TRIGGERS & MENU ====================

function setupAutoTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('autoSync').timeBased().everyMinutes(5).create();
  try { SpreadsheetApp.getUi().alert('Auto-trigger installed!\n\nSyncs every 5 minutes.'); } catch(e) {}
}

function autoSync() {
  importFiberxToRawData();
  generateMTDReport();
}

function stopAutoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoSync') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  try { SpreadsheetApp.getUi().alert('Auto-trigger stopped.'); } catch(e) {}
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GVSI Auto-DB')
    .addItem('Import FIBERX to RAW DATA', 'importFiberxToRawData')
    .addItem('Generate MTD Report', 'generateMTDReport')
    .addSeparator()
    .addItem('Full Sync (Import + MTD)', 'fullSync')
    .addItem('Setup Auto-Trigger (Every 5 min)', 'setupAutoTrigger')
    .addItem('Stop Auto-Trigger', 'stopAutoTrigger')
    .addToUi();
}

function fullSync() {
  importFiberxToRawData();
  generateMTDReport();
}
