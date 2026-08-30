/**
 * GVSI SLI Tracker - Automated Database Management v7
 * 
 * RAW DATA format (continuous table):
 *   Date | AREA | BF | INC | Total Jo | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED | RJO | Carry Over | MTD | TARGET | %
 * 
 * MTD format (new):
 *   AREA | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED | TOTAL RJO | LAST MTD | TARGET | LAST %
 */

const FIBERX_SHEET_NAME = 'FIBERX NEW REPORT';
const RAW_DATA_SHEET_NAME = 'RAW DATA';
const MTD_SHEET_NAME = 'MTD';

const AREAS = [
  'Benguet', 'Ilocos Sur', 'Ilocos Norte', 'Nueva Vizcaya',
  'Isabela', 'Quirino', 'Cagayan', 'Kalinga', 'Abra',
  'Ifugao', 'Apayao', 'Mountain Province'
];

const RAW_HEADER = [
  'Date', 'AREA', 'BF', 'INC', 'Total Jo',
  'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'RJO', 'Carry Over', 'MTD', 'TARGET', '%'
];

const MTD_HEADER = [
  'AREA', 'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO',
  'TOTAL COMPLETED', 'TOTAL RJO', 'LAST MTD', 'TARGET', 'LAST %'
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
    
    var bf = row[1] || 0;
    var inc = row[2] || 0;
    var total = row[3] || 0;
    var fromTotal = row[4] || 0;
    var fromRjo = row[5] || 0;
    var completedTotal = row[6] || 0;
    var rjo = row[7] || 0;
    var carryOver = row[8] || 0;
    var mtd = row[9] || 0;
    var target = row[10] || 0;
    var pct = row[11] || '0.00%';
    
    var areaName = '';
    if (firstCell === 'OVER ALL TOTAL') {
      areaName = 'OVER ALL TOTAL';
    } else if (firstCell.length > 0) {
      areaName = firstCell;
    }
    
    if (areaName) {
      allRows.push([currentDate, areaName, bf, inc, total, fromTotal, fromRjo, completedTotal, rjo, carryOver, mtd, target, pct]);
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
  // C-L (cols 3-12): numbers with comma
  sheet.getRange(2, 3, dataRows, 10).setNumberFormat('#,##0');
  // M (col 13): percentage
  sheet.getRange(2, 13, dataRows, 1).setNumberFormat('0.00%');
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
      var rowNum = i + 2; // +2 because: 1-indexed + header row
      var rowRange = sheet.getRange(rowNum, 1, 1, RAW_HEADER.length);
      rowRange.setBackground('#000000'); // Black background
      rowRange.setFontColor('#FFFFFF');  // White text
      rowRange.setFontWeight('bold');    // Bold
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
  
  mtdSheet.getRange(currentRow, 1).setValue('SLI MTD TRACKING REPORT');
  mtdSheet.getRange(currentRow, 1).setFontWeight(true).setFontSize(14);
  currentRow += 2;
  
  var months = Object.keys(monthlyData).sort();
  
  for (var m = 0; m < months.length; m++) {
    var monthKey = months[m];
    var monthData = monthlyData[monthKey];
    var parts = monthKey.split('-');
    var monthName = getMonthName(parseInt(parts[1]));
    
    mtdSheet.getRange(currentRow, 1).setValue(monthName + ' ' + parts[0]);
    mtdSheet.getRange(currentRow, 1).setFontWeight(true).setFontSize(12);
    currentRow++;
    
    // New MTD header format
    mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setValues([MTD_HEADER]);
    mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setFontWeight(true);
    currentRow++;
    
    var lastDay = monthData[monthData.length - 1];
    
    for (var a = 0; a < AREAS.length; a++) {
      var area = AREAS[a];
      var areaData = lastDay.areas[area];
      if (!areaData) continue;
      
      // Sum completed from total and completed from RJO across all days
      var totalCompFromTotal = 0, totalCompFromRjo = 0, totalComp = 0, totalRjo = 0;
      for (var d = 0; d < monthData.length; d++) {
        var ad = monthData[d].areas[area];
        if (ad) {
          totalCompFromTotal += ad.compFromTotal || 0;
          totalCompFromRjo += ad.compFromRjo || 0;
          totalComp += ad.totalCompleted || 0;
          totalRjo += ad.rjo || 0;
        }
      }
      
      mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setValues([[
        area, totalCompFromTotal, totalCompFromRjo, totalComp, totalRjo,
        areaData.mtd, areaData.target, areaData.pct
      ]]);
      currentRow++;
    }
    
    // OVER ALL TOTAL
    var tCompFromTotal = 0, tCompFromRjo = 0, tComp = 0, tRjo = 0;
    for (var d = 0; d < monthData.length; d++) {
      var da = Object.values(monthData[d].areas);
      for (var aa = 0; aa < da.length; aa++) {
        tCompFromTotal += da[aa].compFromTotal || 0;
        tCompFromRjo += da[aa].compFromRjo || 0;
        tComp += da[aa].totalCompleted || 0;
        tRjo += da[aa].rjo || 0;
      }
    }
    
    var lt = lastDay.overallTotal;
    var lm = lt ? lt.mtd : 0;
    var ltarget = lt ? lt.target : 0;
    var lpct = ltarget > 0 ? (lm / ltarget) : 0;
    
    mtdSheet.getRange(currentRow, 1, 1, MTD_HEADER.length).setValues([[
      'OVER ALL TOTAL', tCompFromTotal, tCompFromRjo, tComp, tRjo,
      lm, ltarget, lpct
    ]]);
    mtdSheet.getRange(currentRow, 1).setFontWeight(true);
    currentRow += 3;
  }
  
  // Apply MTD formatting
  var lastDataRow = currentRow - 4;
  if (lastDataRow > 4) {
    // B-F (cols 2-6): numbers with comma
    mtdSheet.getRange(5, 2, lastDataRow - 4, 5).setNumberFormat('#,##0');
    // G (col 7): LAST MTD
    mtdSheet.getRange(5, 7, lastDataRow - 4, 1).setNumberFormat('#,##0');
    // H (col 8): TARGET
    mtdSheet.getRange(5, 8, lastDataRow - 4, 1).setNumberFormat('#,##0');
    // I (col 9): LAST % — wait, let me recount
    // MTD_HEADER: AREA(0), COMP FROM TOTAL(1), COMP FROM RJO(2), TOTAL COMP(3), TOTAL RJO(4), LAST MTD(5), TARGET(6), LAST %(7)
    // Columns: A=1, B=2, C=3, D=4, E=5, F=6, G=7, H=8
    // B-F = cols 2-6 = COMP FROM TOTAL, COMP FROM RJO, TOTAL COMP, TOTAL RJO, LAST MTD → #,##0
    // G = col 7 = TARGET → #,##0
    // H = col 8 = LAST % → 0.00%
    mtdSheet.getRange(5, 2, lastDataRow - 4, 5).setNumberFormat('#,##0');
    mtdSheet.getRange(5, 7, lastDataRow - 4, 1).setNumberFormat('#,##0');
    mtdSheet.getRange(5, 8, lastDataRow - 4, 1).setNumberFormat('0.00%');
  }
  
  for (var c = 1; c <= MTD_HEADER.length; c++) mtdSheet.autoResizeColumn(c);
  
  try { SpreadsheetApp.getUi().alert('MTD Report Generated!'); } catch(e) {}
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
    
    // RAW DATA: Date(0), AREA(1), BF(2), INC(3), TotalJo(4), CompFromTotal(5), CompFromRjo(6), TotalCompleted(7), RJO(8), CarryOver(9), MTD(10), TARGET(11), %(12)
    var entry = {
      bf: cleanNum(row[2]), inc: cleanNum(row[3]), totalJo: cleanNum(row[4]),
      compFromTotal: cleanNum(row[5]), compFromRjo: cleanNum(row[6]), totalCompleted: cleanNum(row[7]),
      rjo: cleanNum(row[8]), carryOver: cleanNum(row[9]), mtd: cleanNum(row[10]),
      target: cleanNum(row[11]), pct: String(row[12]).trim()
    };
    
    if (areaStr === 'OVER ALL TOTAL') {
      currentBlock.overallTotal = entry;
    } else if (areaStr) {
      for (var a = 0; a < AREAS.length; a++) {
        if (areaStr.includes(AREAS[a])) {
          currentBlock.areas[AREAS[a]] = entry;
          break;
        }
      }
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
