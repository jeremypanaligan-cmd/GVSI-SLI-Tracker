/**
 * GVSI SLI Tracker - Automated Database Management v9
 * Areas are whatever the plan's NEW REPORT sheet lists — nothing is excluded in code.
 * 
 * FIBERX NEW REPORT format (Column J removed):

 *   AREA | BF | INC | TOTAL | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | RJO THIS MO. | RJO REDISPATCHED | CARRY OVER | MTD | TARGET | %
 *   Cols: A  B    C     D       E                     F                    G
 *         H              I              J           K     L      M
 *
 * RAW DATA format (continuous table):
 *   Date | AREA | BF | INC | Total Jo | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | RJO INCOMING | RJO REDISPATCHED | TOTAL RJO | Carry Over | MTD | TARGET | %
 *   Cols: A     B     C    D     E         F                     G                   H
 *         I               J              K           L           M      N       O
 *
 * MTD format:
 *   AREA | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | THIS MO. RJO | PREV MOS. RJO | TOTAL RJO | LAST MTD | TARGET | LAST % | TOTAL INCOMING
 *   Cols: A    B                     C                   D
 *         E               F              G           H        I       J
 */

const FIBERX_SHEET_NAME = 'FIBERX NEW REPORT';
const RAW_DATA_SHEET_NAME = 'RAW DATA';
const MTD_SHEET_NAME = 'MTD';

// ==================== AREAS (read from the NEW REPORT sheet) ====================
// There is no area list in this script, and nothing is excluded by name. Every row a
// daily block in FIBERX NEW REPORT carries is imported exactly as the sheet lists it, so
// a province is added or dropped by editing that sheet — the reports follow on the next
// Full Sync, with no code edit and no CONFIG value to remember.
//
// Keeping the import unfiltered is not cosmetic: a block's OVER ALL TOTAL row is copied
// from the sheet unchanged, and that row is the sum of the rows above it. Filtering a
// province out here left the total counting a row the report no longer listed, and the
// MTD generator takes its LAST MTD from that same total.
//
// The CONFIG tab still exists, for the archive settings the menu writes (ARCHIVE_*).
// Run 'Setup / Edit CONFIG Sheet' from the GVSI Auto-DB menu to create or inspect it.
const CONFIG_SHEET_NAME = 'CONFIG';

/**
 * Creates the CONFIG tab when it is missing, and reports the archive settings.
 *
 * Existing values are never overwritten. Seeding a missing key with its effective
 * default only makes the tab readable — those defaults are what the archive already
 * falls back to, so nothing about a run changes.
 */
function setupConfigSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  var created = false;

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    created = true;
  }

  var defaults = [
    [ARCHIVE_ENABLED_KEY, 'FALSE'],
    [ARCHIVE_AFTER_DAYS_KEY, String(ARCHIVE_DEFAULT_AFTER_DAYS)],
    [ARCHIVE_DRY_RUN_KEY, 'FALSE'],
    [ARCHIVE_PURGE_KEY, 'FALSE'],
    [ARCHIVE_TRIM_KEY, 'TRUE']
  ];

  var values = sheet.getDataRange().getValues();
  var present = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0]).trim().toUpperCase().replace(/\s+/g, '_');
    if (key) present[key] = true;
  }

  var seeded = [];
  for (var d = 0; d < defaults.length; d++) {
    if (present[defaults[d][0]]) continue;
    var row = sheet.getLastRow() + 1;
    if (row === 1) {
      sheet.getRange(1, 1, 1, 2).setValues([['SETTING', 'VALUE']]).setFontWeight('bold');
      row = 2;
    }
    sheet.getRange(row, 1, 1, 2).setValues([defaults[d]]);
    seeded.push(defaults[d][0]);
  }
  if (seeded.length) sheet.autoResizeColumns(1, 2);

  try {
    SpreadsheetApp.getUi().alert('CONFIG sheet ready!' + (created ? '\n\nCreated the CONFIG tab.' : '') +
      (seeded.length ? '\n\nIdinagdag: ' + seeded.join(', ') : '') +
      '\n\nWalang area list dito. Ang bawat row ng ' + PLAN_SHEET_NAME + ' block ang ' +
      'ipinapasok sa RAW DATA at MTD — walang lalawigan na itinatapon ng script.' +
      '\n\nAng CONFIG tab ay para sa ARCHIVE_* settings ng archiving.');
  } catch(e) {}
}

const RAW_HEADER = [
  'Date', 'AREA', 'BF', 'INC', 'Total Jo',
  'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'RJO INCOMING', 'RJO REDISPATCHED', 'TOTAL RJO',
  'Carry Over', 'MTD', 'TARGET', '%'
];

const MTD_HEADER = [
  'AREA', 'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'THIS MO. RJO', 'PREV MOS. RJO', 'TOTAL RJO',
  'LAST MTD', 'TARGET', 'LAST %', 'TOTAL INCOMING'
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
    
    // FIBERX columns (Column J removed): AREA(0) BF(1) INC(2) TOTAL(3) COMP_FROM_TOTAL(4) COMP_FROM_RJO(5)
    //   TOTAL_COMPLETED(6) RJO_THIS_MO(7) RJO_REDISPATCHED(8)
    //   CARRY_OVER(9) MTD(10) TARGET(11) %(12)
    var bf = cleanNum(row[1]);
    var inc = cleanNum(row[2]);
    var total = cleanNum(row[3]);
    var fromTotal = cleanNum(row[4]);
    var fromRjo = cleanNum(row[5]);
    var completedTotal = cleanNum(row[6]);
    var rjoThisMo = cleanNum(row[7]);
    var rjoRedispatched = cleanNum(row[8]);
    var totalRjo = rjoThisMo + rjoRedispatched; // Calculated: H + I

    var carryOver = cleanNum(row[9]);

    var mtd = cleanNum(row[10]);

    var target = cleanNum(row[11]);

    var pct = String(row[12] || '0.00%').trim();

    
    var areaName = '';
    if (firstCell === 'OVER ALL TOTAL') {
      areaName = 'OVER ALL TOTAL';
    } else if (firstCell.length > 0) {
      areaName = firstCell;
    }
    
    if (areaName) {
      // Every row the block lists is imported — the sheet is the area list. Filtering one
      // out here would leave the OVER ALL TOTAL row summing a row the report no longer
      // holds, and the MTD generator takes its LAST MTD from that row.
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

/**
 * Rebuilds the MTD sheet from RAW DATA.
 *
 * The whole report is composed in memory and written with a single setValues call. It
 * used to be written row by row — one sheet call per month row, header row, area row and
 * total row, so the sheet sat incomplete for the whole build (29 calls for a two-month
 * report). A concurrent archive that read MTD inside that window got zero rows, and then
 * purged a month whose figures had never been archived.
 *
 * The grid is also built BEFORE the sheet is touched, so a run that finds no RAW DATA
 * now leaves the previous report intact instead of wiping it.
 */
function generateMTDReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rawSheet = ss.getSheetByName(RAW_DATA_SHEET_NAME);

  if (!rawSheet) {
    try { SpreadsheetApp.getUi().alert('RAW DATA sheet not found.'); } catch(e) {}
    return;
  }

  var dailyData = parseRawData(rawSheet.getDataRange().getValues());

  if (dailyData.length === 0) {
    try { SpreadsheetApp.getUi().alert('No data found in RAW DATA.'); } catch(e) {}
    return;
  }

  var report = buildMtdReport(groupByMonth(dailyData));
  var width = MTD_HEADER.length;
  var sheet = ss.getSheetByName(MTD_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(MTD_SHEET_NAME);

  // One clear and one setValues, with nothing in between: the report is never absent
  // from the sheet for longer than a single round trip.
  sheet.clear();
  sheet.getRange(1, 1, report.values.length, width).setValues(report.values);

  // Band styling runs after the content is already on the sheet, so these calls cannot
  // open a blank window no matter how many of them there are.
  styleMtdRows_(sheet, [1], { weight: 'bold', size: 14 }, false, 1);
  styleMtdRows_(sheet, report.monthRows,
    { family: 'Lexend', color: '#FFFFFF', weight: 'bold', background: '#9900FF' }, true);
  styleMtdRows_(sheet, report.headerRows, { weight: 'bold' }, false);
  styleMtdRows_(sheet, report.totalRows,
    { family: 'Lexend', color: '#000000', weight: 'bold', style: 'italic', background: '#87C5D0' }, false);

  applyMTDFormatting(sheet);

  for (var c = 1; c <= width; c++) sheet.autoResizeColumn(c);

  try { SpreadsheetApp.getUi().alert('MTD Report Generated!'); } catch(e) {}
}

/**
 * Composes the whole MTD report as an in-memory grid.
 *
 * Returns the value grid plus the 1-based sheet rows that need band styling, so the
 * writer never has to scan the sheet again to find them.
 */
function buildMtdReport(monthlyData) {
  var width = MTD_HEADER.length;
  var values = [];
  var monthRows = [];
  var headerRows = [];
  var totalRows = [];

  var padToWidth = function (row) {
    while (row.length < width) row.push('');
    return row;
  };
  var blankRow = function () {
    var row = [];
    for (var i = 0; i < width; i++) row.push('');
    values.push(row);
  };

  // Title row, then one blank line before the first month.
  values.push(padToWidth(['SLI MTD TRACKING REPORT']));
  blankRow();

  var months = Object.keys(monthlyData).sort();

  for (var m = 0; m < months.length; m++) {
    var monthKey = months[m];
    var monthData = monthlyData[monthKey];
    var parts = monthKey.split('-');
    var monthYearLabel = getMonthName(parseInt(parts[1], 10)) + ' ' + parts[0];

    monthRows.push(values.length + 1);
    values.push(padToWidth([monthYearLabel]));

    headerRows.push(values.length + 1);
    values.push(MTD_HEADER.slice());

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
      var totalInc = 0;
      for (var d = 0; d < monthData.length; d++) {
        var ad = monthData[d].areas[area];
        if (ad) {
          totalCompFromTotal += ad.compFromTotal || 0;
          totalCompFromRjo += ad.compFromRjo || 0;
          totalComp += ad.totalCompleted || 0;
          totalRjoIncoming += ad.rjoIncoming || 0;
          totalRjoRedispatched += ad.rjoRedispatched || 0;
          totalInc += ad.inc || 0;
        }
      }

      values.push([
        area, totalCompFromTotal, totalCompFromRjo, totalComp,
        totalRjoIncoming, totalRjoRedispatched,
        totalRjoIncoming + totalRjoRedispatched,
        areaData.mtd, areaData.target, areaData.pct, totalInc
      ]);
    }

    // OVER ALL TOTAL
    var tCompFromTotal = 0, tCompFromRjo = 0, tComp = 0;
    var tRjoIncoming = 0, tRjoRedispatched = 0;
    var tInc = 0;
    for (var dd = 0; dd < monthData.length; dd++) {
      var da = Object.values(monthData[dd].areas);
      for (var aa = 0; aa < da.length; aa++) {
        tCompFromTotal += da[aa].compFromTotal || 0;
        tCompFromRjo += da[aa].compFromRjo || 0;
        tComp += da[aa].totalCompleted || 0;
        tRjoIncoming += da[aa].rjoIncoming || 0;
        tRjoRedispatched += da[aa].rjoRedispatched || 0;
        tInc += da[aa].inc || 0;
      }
    }

    var lt = lastDay.overallTotal;
    var lm = lt ? lt.mtd : 0;
    var ltarget = lt ? lt.target : 0;

    totalRows.push(values.length + 1);
    values.push([
      'OVER ALL TOTAL', tCompFromTotal, tCompFromRjo, tComp,
      tRjoIncoming, tRjoRedispatched,
      tRjoIncoming + tRjoRedispatched,
      lm, ltarget, ltarget > 0 ? (lm / ltarget) : 0, tInc
    ]);

    // The report separates one month from the next with two blank rows.
    if (m + 1 < months.length) { blankRow(); blankRow(); }
  }

  return { values: values, monthRows: monthRows, headerRows: headerRows, totalRows: totalRows };
}

/**
 * Applies one band style to a list of 1-based sheet rows.
 *
 * `cols` defaults to the full report width. The title row passes 1, so its weight and
 * size stay on A1 exactly where the row-by-row writer used to leave them.
 */
function styleMtdRows_(sheet, rows, style, merge, cols) {
  var width = cols || MTD_HEADER.length;
  for (var i = 0; i < rows.length; i++) {
    var range = sheet.getRange(rows[i], 1, 1, width);
    if (style.family) range.setFontFamily(style.family);
    if (style.color) range.setFontColor(style.color);
    if (style.weight) range.setFontWeight(style.weight);
    if (style.style) range.setFontStyle(style.style);
    if (style.size) range.setFontSize(style.size);
    if (style.background) range.setBackground(style.background);
    if (merge) range.merge();
  }
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
      // The exact area name as RAW DATA holds it — the import no longer filters any out.
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
//
// Managed triggers (ScriptApp). 'Setup Managed Triggers' reconciles ONLY the three
// rows below and never touches anything else:
//
//   autoSync            time-based   every 5 minutes   Import + MTD
//   archiveClosedMonths time-based   daily 02:00       Archive the closed month
//   fullSync            spreadsheet  on change         Import + MTD
//
// The on-change trigger is created by code ON PURPOSE. It used to be added by hand in
// the Triggers page, and the old setupAutoTrigger() deleted EVERY project trigger
// before installing its timer — so re-running setup silently removed it.

const ARCHIVE_ENABLED_KEY = 'ARCHIVE_ENABLED';
const ARCHIVE_AFTER_DAYS_KEY = 'ARCHIVE_AFTER_DAYS';
const ARCHIVE_DRY_RUN_KEY = 'ARCHIVE_DRY_RUN';
const ARCHIVE_PURGE_KEY = 'ARCHIVE_PURGE';
const ARCHIVE_TRIM_KEY = 'ARCHIVE_TRIM';
const ARCHIVE_LAST_KEY = 'LAST_ARCHIVE';
const ARCHIVE_DEFAULT_AFTER_DAYS = 7;
// Deleting from the sheet is opt-in. A month is copied to Supabase and then LEFT ALONE
// unless purge is asked for by name, because the copy is additive and easy to check while
// a delete is neither. With purge off the sheet stays the record of every month.
const ARCHIVE_DEFAULT_PURGE = false;
// Narrowing a MIRROR is a different act from deleting rows, and it is ON by default.
// The month is already verified in Supabase before the window moves, the move is one cell
// write instead of a row deletion, and 'Restore Full History' puts the window back — so a
// mirror can be kept lean without anyone opting in, which is the whole point of archiving.
// A hand-encoded tab is unaffected: it is `purge`, and that stays opt-in.
const ARCHIVE_DEFAULT_TRIM = true;
const ARCHIVE_BACKUP_SHEET = '_ARCHIVE_BACKUP';
const ARCHIVE_BATCH_SIZE = 500;

// Shrinking the workbook after a month is archived takes one of two shapes, decided by
// what PLAN_SHEET_NAME actually is:
//
//   hand-encoded  → the month's day blocks are DELETED      (purgeMonthFromNewReport_)
//   a mirror      → the IMPORTRANGE range's start row MOVES (trimPlanSheetFormula_)
//                   =IMPORTRANGE("…", "'BIDA DAILY'!A1:M")  →  …!A19:M
//
// A mirror cannot be deleted from: its rows are the output of an array formula, and
// removing them does not remove data — it tears the formula out of A1, which is what
// happened on 2026-09-21. Moving the range instead leaves the mirror a plain IMPORTRANGE,
// so every row still arrives with the sheet's own types and nothing needs re-parsing.
//
// Two switches have to agree before a window moves. PLAN_SHEET_TRIM_ENABLED is per plan
// and lives in this file, because a window may only narrow where that plan's months really
// are reaching Supabase — otherwise the app would lose a month from the sheet and the
// database at the same time. ARCHIVE_TRIM (CONFIG) is the runtime switch for the run.
// Neither of them is ARCHIVE_PURGE: that one governs row deletion on a hand-encoded tab.
const PLAN_SHEET_TRIM_ENABLED = false;
const PLAN_SHEET_TRIM_POLL_MS = 2000;
const PLAN_SHEET_TRIM_VERIFY_MS = 20000;

// Which plan this script belongs to. PLAN_ID must match the app's plan id
// (src/config/plans.js: fiberx | bida | sme).
const PLAN_ID = 'fiberx';
const PLAN_SHEET_NAME = FIBERX_SHEET_NAME;

const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_INDEX_ABBR = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// ==================== CONFIG (generic reads/writes) ====================

/** Every CONFIG row as { NORMALISED_KEY: value }; later rows win. */
function readConfigMap_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
  var map = {};
  if (!sheet) return map;

  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0]).trim().toUpperCase().replace(/\s+/g, '_');
    if (key) map[key] = values[i][1];
  }
  return map;
}

function configString_(map, key, fallback) {
  if (!(key in map)) return fallback;
  var value = map[key];
  value = (value === null || value === undefined) ? '' : String(value).trim();
  return value === '' ? fallback : value;
}

function configBool_(map, key, fallback) {
  var value = configString_(map, key, '');
  if (value === '') return fallback;
  value = value.toUpperCase();
  return value === 'TRUE' || value === 'YES' || value === 'Y' ||
         value === '1' || value === 'ON' || value === 'ENABLED';
}

function configNumber_(map, key, fallback) {
  var n = parseFloat(configString_(map, key, ''));
  return isNaN(n) ? fallback : n;
}

/** Writes one CONFIG value; every other row in the tab is untouched. */
function writeConfigValue_(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CONFIG_SHEET_NAME);

  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var existing = String(values[i][0]).trim().toUpperCase().replace(/\s+/g, '_');
    if (existing === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }

  var row = sheet.getLastRow() + 1;
  if (row === 1) {
    sheet.getRange(1, 1, 1, 2).setValues([['SETTING', 'VALUE']]).setFontWeight('bold');
    row = 2;
  }
  sheet.getRange(row, 1, 1, 2).setValues([[key, value]]);
}

// ==================== DATES ====================

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function monthKeyOf_(date) { return date.getFullYear() + '-' + pad2_(date.getMonth() + 1); }
function monthLabelOf_(date) { return MONTH_NAMES_FULL[date.getMonth()] + ' ' + date.getFullYear(); }
/** The app's canonical date key, e.g. 'September 1, 2026'. */
function dateLabelOf_(date) {
  return MONTH_NAMES_FULL[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
}

function todayMidnight_() {
  var now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Parses a sheet date (Date object, 'Sept 1 2026', 'September 1, 2026', ISO) → Date|null. */
function parseAnyDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime())
      ? null
      : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  var text = String(value).replace(/[._]/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

  var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10));

  var worded = text.match(/^([A-Za-z]+) (\d{1,2}) (\d{4})$/);
  if (worded) {
    var index = MONTH_INDEX_ABBR[worded[1].substring(0, 3).toLowerCase()];
    if (index === undefined) return null;
    return new Date(parseInt(worded[3], 10), index, parseInt(worded[2], 10));
  }
  return null;
}

/** The date of a NEW REPORT day block: 'SLI DAILY TRACKING REPORT as of __Sept. 1, 2026__'. */
function blockDateOf_(titleCell) {
  var text = String(titleCell || '');
  var wrapped = text.match(/__(.+?)__/);
  if (wrapped) return parseAnyDate_(wrapped[1]);
  var asOf = text.match(/as of\s+(.+)$/i);
  return asOf ? parseAnyDate_(asOf[1]) : null;
}

/** 'September 2026' → Date(2026, 8, 1), or null when the cell is not a month header. */
function parseMonthHeader_(text) {
  var trimmed = String(text || '').trim();
  for (var i = 0; i < MONTH_NAMES_FULL.length; i++) {
    var match = trimmed.match(new RegExp('^' + MONTH_NAMES_FULL[i] + '\\s+(\\d{4})$', 'i'));
    if (match) return new Date(parseInt(match[1], 10), i, 1);
  }
  return null;
}

function lastDayOfMonth_(monthDate) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
}

/** The first day a closed month may be archived: `afterDays` days into the next month. */
function archiveCutoff_(monthDate, afterDays) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, Math.max(1, Math.round(afterDays)));
}

/** Percent cells are stored as fractions; the app consumes the '0.00%' text form. */
function percentText_(value) {
  if (value === '' || value === null || value === undefined) return '';
  if (typeof value === 'number') return (value * 100).toFixed(2) + '%';

  var text = String(value).trim();
  if (text.indexOf('%') !== -1) return text;
  var n = parseFloat(text.replace(/[",\s]/g, ''));
  if (isNaN(n)) return text;
  return (n <= 1 ? n * 100 : n).toFixed(2) + '%';
}

function num_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var n = cleanNum(value);
  return isNaN(n) ? null : n;
}

// ==================== SUPABASE ====================
//
// The service_role key is NEVER kept in this file — it lives in Script Properties,
// set from the Apps Script editor: Project Settings → Script Properties.
//
//   SUPABASE_URL          https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_KEY  the service_role secret (Supabase → Project Settings → API keys)
//   ALERT_EMAIL           optional; archive failures are mailed here
//
// Read-only keys would not do: the anon key ships inside the public app bundle, so it
// must never be able to write archive rows.

function supabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/+$/, '');
  var key = String(props.getProperty('SUPABASE_SERVICE_KEY') || '');
  if (!url || !key) {
    throw new Error('Kulang ang SUPABASE_URL / SUPABASE_SERVICE_KEY sa Script Properties. ' +
      'Idagdag sa Apps Script editor: Project Settings → Script Properties.');
  }
  return { url: url, key: key };
}

function supabaseRequest_(path, options) {
  var opts = options || {};
  var config = supabaseConfig_();

  var headers = {
    apikey: config.key,
    Authorization: 'Bearer ' + config.key,
    'Content-Type': 'application/json'
  };
  if (opts.prefer) headers.Prefer = opts.prefer;
  if (opts.range) {
    headers.Range = opts.range;
    headers['Range-Unit'] = 'items';
  }

  var params = { method: opts.method || 'get', headers: headers, muteHttpExceptions: true };
  if (opts.body !== undefined) params.payload = JSON.stringify(opts.body);

  var response = UrlFetchApp.fetch(config.url + '/rest/v1/' + path, params);
  return {
    code: response.getResponseCode(),
    text: response.getContentText(),
    headers: response.getAllHeaders()
  };
}

function supabaseHeader_(headers, name) {
  if (!headers) return null;
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === name) return headers[keys[i]];
  }
  return null;
}

/**
 * Upsert (never plain insert) so a re-run over the same month is idempotent — the
 * unique key makes duplicates impossible.
 */
function supabaseUpsert_(table, rows, onConflict) {
  if (!rows.length) return;
  for (var i = 0; i < rows.length; i += ARCHIVE_BATCH_SIZE) {
    var chunk = rows.slice(i, i + ARCHIVE_BATCH_SIZE);
    var result = supabaseRequest_(table + '?on_conflict=' + onConflict, {
      method: 'post',
      body: chunk,
      prefer: 'resolution=merge-duplicates,return=minimal'
    });
    if (result.code < 200 || result.code >= 300) {
      throw new Error('Supabase upsert failed on ' + table + ' (HTTP ' + result.code + '): ' +
        String(result.text).slice(0, 300));
    }
  }
}

/** Exact row count for a query without downloading the rows (Content-Range / N). */
function supabaseCount_(table, query) {
  var result = supabaseRequest_(table + '?' + query, { prefer: 'count=exact', range: '0-0' });
  // 200/206 → 'Content-Range: 0-0/402' · 416 → 'Content-Range: */0'
  if (result.code !== 200 && result.code !== 206 && result.code !== 416) {
    throw new Error('Supabase count failed on ' + table + ' (HTTP ' + result.code + '): ' +
      String(result.text).slice(0, 200));
  }
  var header = supabaseHeader_(result.headers, 'content-range');
  var match = String(header || '').match(/\/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : -1;
}

function supabaseSum_(table, query, column) {
  var result = supabaseRequest_(table + '?' + query + '&select=' + column);
  if (result.code < 200 || result.code >= 300) {
    throw new Error('Supabase read failed on ' + table + ' (HTTP ' + result.code + '): ' +
      String(result.text).slice(0, 200));
  }
  var rows = JSON.parse(result.text || '[]');
  var sum = 0;
  for (var i = 0; i < rows.length; i++) sum += Number(rows[i][column] || 0);
  return sum;
}

// ==================== ARCHIVE: read the month ====================

/** RAW DATA rows belonging to one month, shaped for sli_raw_daily. */
function collectRawArchiveRows_(monthKey) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RAW_DATA_SHEET_NAME);
  if (!sheet) throw new Error('RAW DATA sheet not found.');

  var range = sheet.getDataRange();
  var values = range.getValues();
  var display = range.getDisplayValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {
    var date = parseAnyDate_(values[i][0]);
    if (!date || monthKeyOf_(date) !== monthKey) continue;

    var area = String(values[i][1] || '').trim();
    if (!area || area === 'AREA') continue;

    rows.push({
      plan: PLAN_ID,
      month_key: monthKey,
      report_date: monthKey + '-' + pad2_(date.getDate()),
      date_label: dateLabelOf_(date),
      area: area,
      // The daily OVER ALL TOTAL row is archived too, flagged rather than dropped:
      // the app's Daily To-Date card reads it, and it is not always equal to the sum
      // of the area rows (a stale total would silently change closed-month numbers).
      is_overall_total: area === 'OVER ALL TOTAL',
      bf: num_(values[i][2]),
      inc: num_(values[i][3]),
      total_jo: num_(values[i][4]),
      comp_from_total: num_(values[i][5]),
      comp_from_rjo: num_(values[i][6]),
      total_completed: num_(values[i][7]),
      rjo_incoming: num_(values[i][8]),
      rjo_redispatched: num_(values[i][9]),
      total_rjo: num_(values[i][10]),
      carry_over: num_(values[i][11]),
      mtd: num_(values[i][12]),
      target: num_(values[i][13]),
      // Display value, so '#DIV/0!' is stored verbatim exactly as the CSV export shows it.
      pct: String(display[i][14] === null || display[i][14] === undefined ? '' : display[i][14]).trim(),
      row_order: rows.length
    });
  }
  return rows;
}

/**
 * The month's MTD rows, computed from the month's RAW DATA rows.
 *
 * These are the same figures the MTD sheet holds: that sheet is built from RAW DATA by
 * summing each area across the month's days and taking LAST MTD / TARGET / LAST % from the
 * last day. Reading the sheet made the archive depend on the one tab that every fullSync
 * clears and rebuilds, so a read that landed inside the rebuild came back empty — which is
 * exactly what happened on 2026-09-21, twice, the second time caught by the gate before it
 * could purge a month whose MTD figures had never been archived.
 *
 * Two details are carried over from generateMTDReport deliberately:
 *   - the area list is the LAST day's areas, not the union of every day, because that is
 *     the set of areas the sheet lists;
 *   - the OVER ALL TOTAL sums every area on every day, listed or not, because that is how
 *     the sheet's total is built.
 */
function deriveMtdArchiveRows_(rawRows, monthKey, monthLabel) {
  var SUMS = [
    ['comp_from_total', 'comp_from_total'],
    ['comp_from_rjo', 'comp_from_rjo'],
    ['total_completed', 'total_completed'],
    ['this_mo_rjo', 'rjo_incoming'],
    ['prev_mos_rjo', 'rjo_redispatched'],
    ['total_incoming', 'inc']
  ];

  var lastDate = null;
  var i, f;

  for (i = 0; i < rawRows.length; i++) {
    var date = rawRows[i].report_date;
    if (!lastDate || date > lastDate) lastDate = date;
  }

  var perArea = {};
  var lastRowOfArea = {};
  var listed = {};
  var overallLast = null;
  var total = {
    comp_from_total: 0, comp_from_rjo: 0, total_completed: 0,
    this_mo_rjo: 0, prev_mos_rjo: 0, total_incoming: 0
  };

  var blankSums = function () {
    return {
      comp_from_total: 0, comp_from_rjo: 0, total_completed: 0,
      this_mo_rjo: 0, prev_mos_rjo: 0, total_incoming: 0
    };
  };

  for (i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];

    if (row.is_overall_total) {
      if (!overallLast || row.report_date >= overallLast.report_date) overallLast = row;
      continue;
    }

    var area = String(row.area);
    if (!perArea[area]) perArea[area] = blankSums();

    for (f = 0; f < SUMS.length; f++) {
      var value = Number(row[SUMS[f][1]] || 0);
      perArea[area][SUMS[f][0]] += value;
      total[SUMS[f][0]] += value;
    }

    if (!lastRowOfArea[area] || row.report_date >= lastRowOfArea[area].report_date) {
      lastRowOfArea[area] = row;
    }
    if (row.report_date === lastDate) listed[area] = true;
  }

  var areas = [];
  for (var name in listed) if (listed.hasOwnProperty(name)) areas.push(name);
  areas.sort();

  var rows = [];
  var optional = function (row, field) {
    return (row && row[field] !== null && row[field] !== undefined) ? row[field] : null;
  };

  for (i = 0; i < areas.length; i++) {
    var sums = perArea[areas[i]];
    var lastRow = lastRowOfArea[areas[i]];
    rows.push({
      plan: PLAN_ID,
      month_key: monthKey,
      month_label: monthLabel,
      area: areas[i],
      is_overall_total: false,
      comp_from_total: sums.comp_from_total,
      comp_from_rjo: sums.comp_from_rjo,
      total_completed: sums.total_completed,
      this_mo_rjo: sums.this_mo_rjo,
      prev_mos_rjo: sums.prev_mos_rjo,
      total_rjo: sums.this_mo_rjo + sums.prev_mos_rjo,
      last_mtd: optional(lastRow, 'mtd'),
      target: optional(lastRow, 'target'),
      total_incoming: sums.total_incoming,
      last_pct: percentText_(lastRow ? lastRow.pct : ''),
      row_order: rows.length
    });
  }

  // The sheet ends each month with its OVER ALL TOTAL, so the archive does too.
  if (overallLast) {
    var lm = overallLast.mtd || 0;
    var ltarget = overallLast.target || 0;
    rows.push({
      plan: PLAN_ID,
      month_key: monthKey,
      month_label: monthLabel,
      area: 'OVER ALL TOTAL',
      is_overall_total: true,
      comp_from_total: total.comp_from_total,
      comp_from_rjo: total.comp_from_rjo,
      total_completed: total.total_completed,
      this_mo_rjo: total.this_mo_rjo,
      prev_mos_rjo: total.prev_mos_rjo,
      total_rjo: total.this_mo_rjo + total.prev_mos_rjo,
      last_mtd: optional(overallLast, 'mtd'),
      target: optional(overallLast, 'target'),
      total_incoming: total.total_incoming,
      // A percentage, not the day's own LAST % text: that is what the sheet computes for
      // this row (lm / ltarget) and then renders with a 0.00% number format.
      last_pct: percentText_(ltarget > 0 ? (lm / ltarget) : 0),
      row_order: rows.length
    });
  }

  return rows;
}

function sumCompleted_(rows) {
  var sum = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].is_overall_total) sum += Number(rows[i].total_completed || 0);
  }
  return sum;
}

// ==================== ARCHIVE: which month is due ====================

/**
 * Every month that is (a) past its cutoff — month end + ARCHIVE_AFTER_DAYS — and
 * (b) complete, oldest first. Nothing is skipped when a run is missed: the next run
 * picks up the backlog.
 */
function eligibleMonths_(afterDays) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RAW_DATA_SHEET_NAME);
  if (!sheet) throw new Error('RAW DATA sheet not found.');

  var values = sheet.getDataRange().getValues();
  var seen = {};
  var overallLast = null;

  for (var i = 1; i < values.length; i++) {
    var date = parseAnyDate_(values[i][0]);
    if (!date) continue;

    if (!overallLast || date.getTime() > overallLast.getTime()) overallLast = date;

    var key = monthKeyOf_(date);
    if (!seen[key]) seen[key] = { first: date, last: date };
    if (date.getTime() < seen[key].first.getTime()) seen[key].first = date;
    if (date.getTime() > seen[key].last.getTime()) seen[key].last = date;
  }

  var today = todayMidnight_();
  var keys = Object.keys(seen).sort();
  var due = [];

  for (var k = 0; k < keys.length; k++) {
    var monthKey = keys[k];
    var monthDate = seen[monthKey].first;
    if (archiveCutoff_(monthDate, afterDays).getTime() > today.getTime()) continue;

    // Completeness guard: only freeze the month once its last calendar day has been
    // encoded, or once encoding has already moved on to a later month. A partial
    // month would otherwise be archived and purged as if it were final.
    var complete = seen[monthKey].last.getTime() >= lastDayOfMonth_(monthDate).getTime();
    if (!complete && overallLast && monthKeyOf_(overallLast) > monthKey) complete = true;
    if (!complete) continue;

    due.push({ key: monthKey, label: monthLabelOf_(monthDate), date: monthDate });
  }
  return due;
}

// ==================== ARCHIVE: purge NEW REPORT ====================

/** Copies the rows that are about to be deleted into a backup tab, values only. */
function backupPurgedRows_(values, ranges) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var backup = ss.getSheetByName(ARCHIVE_BACKUP_SHEET);
  if (!backup) backup = ss.insertSheet(ARCHIVE_BACKUP_SHEET);
  else backup.clear();

  var out = [['PRE-PURGE BACKUP', new Date().toISOString(), PLAN_ID]];
  out.push(['Pagkabura ng archived month, hindi na kailangan ang tab na ito — pwedeng i-delete.']);
  out.push([]);

  for (var r = 0; r < ranges.length; r++) {
    for (var i = 0; i < ranges[r].count; i++) {
      var source = values[ranges[r].start - 1 + i];
      if (source) out.push(source.slice());
    }
  }

  var width = RAW_HEADER.length;
  var padded = [];
  for (var p = 0; p < out.length; p++) {
    var copy = out[p].slice(0, width);
    while (copy.length < width) copy.push('');
    padded.push(copy);
  }
  backup.getRange(1, 1, padded.length, width).setValues(padded);
}

/**
 * Deletes every day block of `monthKey` from the plan's NEW REPORT.
 *
 * This is the only step that actually shrinks the spreadsheet. Clearing RAW DATA is
 * not enough: the import rebuilds it from NEW REPORT on every sync (every 5 minutes,
 * and on every edit), so an old month left in NEW REPORT always comes back.
 */
/**
 * True when the plan's report sheet is filled by a formula rather than by hand.
 *
 * `BIDA NEW REPORT` and its siblings are one `=IMPORTRANGE("…", "BIDA DAILY'!A:M")`
 * spilling the whole report. Their rows are the OUTPUT of an array formula, so purging
 * them does not delete data — Sheets either refuses, or the formula is torn out of A1 and
 * has to be pasted back by hand. Which is what happened on 2026-09-21.
 *
 * A month like that is retired by MOVING the range instead — see trimPlanSheetFormula_.
 * This function only classifies; it never edits.
 */
function planSheetIsFormulaDriven_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAN_SHEET_NAME);
  if (!sheet) return false;

  var lastRow = sheet.getLastRow();
  if (!lastRow) return false;

  // The anchor of a spilled IMPORTRANGE sits at the top-left of the block, so the first
  // few rows of column A are enough to tell a mirror from a hand-encoded sheet.
  var formulas = sheet.getRange(1, 1, Math.min(lastRow, 5), 1).getFormulas();
  for (var i = 0; i < formulas.length; i++) {
    if (String(formulas[i][0] || '').charAt(0) === '=') return true;
  }
  return false;
}

function purgeMonthFromNewReport_(monthKey, dryRun) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAN_SHEET_NAME);
  if (!sheet) throw new Error(PLAN_SHEET_NAME + ' sheet not found.');

  var values = sheet.getDataRange().getValues();
  var titles = [];
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').indexOf('SLI DAILY TRACKING REPORT') !== -1) titles.push(i);
  }

  var ranges = [];
  var labels = [];
  var rowCount = 0;

  for (var t = 0; t < titles.length; t++) {
    var startIndex = titles[t];
    var endIndex = (t + 1 < titles.length) ? titles[t + 1] - 1 : values.length - 1;

    var date = blockDateOf_(values[startIndex][0]);
    if (!date || monthKeyOf_(date) !== monthKey) continue;

    ranges.push({ start: startIndex + 1, count: endIndex - startIndex + 1 }); // 1-based row, row count
    rowCount += endIndex - startIndex + 1;
    labels.push(dateLabelOf_(date));
  }

  if (!ranges.length || dryRun) return { rows: rowCount, labels: labels };

  backupPurgedRows_(values, ranges);
  // Bottom-up, so the earlier row numbers stay valid while deleting.
  for (var r = ranges.length - 1; r >= 0; r--) {
    sheet.deleteRows(ranges[r].start, ranges[r].count);
  }
  return { rows: rowCount, labels: labels };
}

// ==================== ARCHIVE: the formula window ====================
//
// On a mirror the only way to retire an archived month is to move the range the formula
// points at. The window is recomputed from scratch on every run, from the SOURCE sheet, so
// it stays right when rows above it are deleted there; and the mirror's own layout is
// never rewritten — only the starting row changes.

/** Reporting must work from a trigger too, where there is no UI. */
function planSheetAlert_(message) {
  try { SpreadsheetApp.getUi().alert(message); } catch (e) { Logger.log(message); }
}

/** '=IMPORTRANGE("url", "'BIDA DAILY'!A1:M")' → its four facts, or null. */
function parseImportRangeFormula_(formula) {
  var text = String(formula || '').trim();
  if (text.charAt(0) !== '=') return null;

  var urlMatch = text.match(/IMPORTRANGE\s*\(\s*"([^"]+)"/i);
  if (!urlMatch) return null;
  var rangeMatch = text.match(/,\s*"([^"]*)"\s*\)\s*$/);
  if (!rangeMatch) return null;
  var idMatch = urlMatch[1].match(/\/d\/([A-Za-z0-9_-]+)/);
  if (!idMatch) return null;

  var spec = rangeMatch[1].match(/^'?([^'!]+)'?!A(\d+):([A-Z]+)$/);
  if (!spec) return null;

  return {
    url: urlMatch[1],
    sourceId: idMatch[1],
    tab: spec[1],
    startRow: parseInt(spec[2], 10),
    endCol: spec[3]
  };
}

function buildImportRangeFormula_(parsed, startRow) {
  return '=IMPORTRANGE("' + parsed.url + '", "\'' + parsed.tab + '\'!A' + startRow + ':' +
    parsed.endCol + '")';
}

/** The plan sheet's A1, or null when the tab is missing. */
function planSheetAnchorCell_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAN_SHEET_NAME);
  return sheet ? sheet.getRange(1, 1) : null;
}

/**
 * Every day block in the plan sheet, oldest first: its title row and the month it belongs
 * to. The title is the only place the date lives, so this is also how a mirror's coverage
 * is read.
 */
function mirrorBlocks_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAN_SHEET_NAME);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  var blocks = [];
  for (var i = 0; i < values.length; i++) {
    var date = blockDateOf_(values[i][0]);
    if (!date) continue;
    blocks.push({ monthKey: monthKeyOf_(date), row: i + 1, date: date });
  }
  return blocks;
}

/** The month_keys the window currently shows, in order and without repeats. */
function mirrorMonthKeys_() {
  var blocks = mirrorBlocks_();
  var seen = {};
  var keys = [];
  for (var i = 0; i < blocks.length; i++) {
    if (seen[blocks[i].monthKey]) continue;
    seen[blocks[i].monthKey] = true;
    keys.push(blocks[i].monthKey);
  }
  return keys;
}

/**
 * The 1-based row of `monthKey`'s first day block in the SOURCE spreadsheet.
 *
 * Read from the source rather than counted in the mirror on purpose: the mirror's row
 * numbers only equal the source's while nothing above the window changes, and one row
 * deleted in `BIDA DAILY` would silently shift every month after it. Returns
 * { row, reason } — `row` is null when the source cannot be opened or does not hold the
 * month, and the caller then falls back to counting in the mirror.
 */
function firstBlockRowForMonthInSource_(sourceId, tab, monthKey) {
  var source;
  try {
    source = SpreadsheetApp.openById(sourceId);
  } catch (e) {
    return { row: null, reason: 'hindi mabuksan ang source sheet (' +
      (e && e.message ? e.message : String(e)) + ')' };
  }

  var sheet = source.getSheetByName(tab);
  if (!sheet) return { row: null, reason: 'walang "' + tab + '" tab sa source sheet' };

  var values = sheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var date = blockDateOf_(values[i][0]);
    if (date && monthKeyOf_(date) === monthKey) return { row: i + 1, reason: '' };
  }
  return { row: null, reason: 'wala pang ' + monthKey + ' na block sa source sheet' };
}

/**
 * Moves PLAN_SHEET_NAME's IMPORTRANGE window so it starts at the first month NEWER than
 * every month that was just archived and verified.
 *
 * Never reached for a hand-encoded sheet (that path deletes rows), never with ARCHIVE_TRIM
 * off, and never for a plan with PLAN_SHEET_TRIM_ENABLED off. ARCHIVE_PURGE is not one of
 * its gates on purpose: a move is reversible, a deletion is not.
 *
 * Three guards, all of them refusals rather than fixes:
 *   * nothing older than the new start may still be un-archived, or narrowing the window
 *     would drop that month from the sheet without Supabase having it;
 *   * there has to be a later month to start at, or the window would become empty;
 *   * the spill must actually land on the month the formula now names, and the old formula
 *     goes back if it does not. IMPORTRANGE recalculates asynchronously, so this is the
 *     only way to know that what the sheet shows is what the formula says — and it catches
 *     a source sheet whose rows moved under us.
 */
function trimPlanSheetFormula_(archivedMonthKeys, dryRun) {
  if (!PLAN_SHEET_TRIM_ENABLED) {
    return { changed: false, reason: 'hindi naka-enable ang formula trim para sa ' + PLAN_ID +
      ' (PLAN_SHEET_TRIM_ENABLED = false)' };
  }

  var cell = planSheetAnchorCell_();
  if (!cell) return { changed: false, reason: PLAN_SHEET_NAME + ' sheet not found.' };

  var formula = cell.getFormula();
  var parsed = parseImportRangeFormula_(formula);
  if (!parsed) {
    return { changed: false, reason: 'ang A1 ng ' + PLAN_SHEET_NAME + ' ay hindi IMPORTRANGE ' +
      'na may A<n>:M — hindi hinahawakan' };
  }

  var archived = {};
  var maxArchived = '';
  for (var a = 0; a < archivedMonthKeys.length; a++) {
    archived[archivedMonthKeys[a]] = true;
    if (archivedMonthKeys[a] > maxArchived) maxArchived = archivedMonthKeys[a];
  }
  if (!maxArchived) return { changed: false, reason: 'walang na-archive sa run na ito' };

  // One read of the window: its months in order, and where each one starts.
  var blocks = mirrorBlocks_();
  if (!blocks.length) return { changed: false, reason: 'walang day block sa ' + PLAN_SHEET_NAME };

  var keys = [];
  var seenKey = {};
  for (var kb = 0; kb < blocks.length; kb++) {
    if (seenKey[blocks[kb].monthKey]) continue;
    seenKey[blocks[kb].monthKey] = true;
    keys.push(blocks[kb].monthKey);
  }

  // The earliest month the window still shows that is newer than everything archived.
  var targetKey = '';
  for (var t = 0; t < keys.length; t++) {
    if (keys[t] > maxArchived && (!targetKey || keys[t] < targetKey)) targetKey = keys[t];
  }
  if (!targetKey) {
    return { changed: false, reason: 'walang buwan na mas bago sa ' + maxArchived + ' sa ' +
      PLAN_SHEET_NAME + ' — hindi ito tinatrim' };
  }

  // GUARD: nothing older than the new window start may be left behind un-archived.
  var leftBehind = [];
  for (var b = 0; b < keys.length; b++) {
    if (keys[b] < targetKey && !archived[keys[b]]) leftBehind.push(keys[b]);
  }
  if (leftBehind.length) {
    return { changed: false, reason: 'hindi tinatrim — may buwan pang hindi archived bago ang ' +
      targetKey + ': ' + leftBehind.join(', ') + '. I-archive muna ang mga iyon (o itaas ang ' +
      'ARCHIVE_AFTER_DAYS) bago itrim ang window.' };
  }

  // Where that month starts in the window as it is right now — used only as the fallback
  // when the source sheet cannot be read.
  var targetRow = 0;
  for (var m = 0; m < blocks.length; m++) {
    if (blocks[m].monthKey === targetKey) { targetRow = blocks[m].row; break; }
  }
  if (!targetRow) return { changed: false, reason: 'hindi mahanap ang ' + targetKey + ' sa sheet' };

  var fromSource = firstBlockRowForMonthInSource_(parsed.sourceId, parsed.tab, targetKey);
  var sourceRow = fromSource.row;
  var note = fromSource.row
    ? 'row mula sa source sheet'
    : 'galing sa mirror — ' + fromSource.reason;
  if (!sourceRow) sourceRow = parsed.startRow + targetRow - 1;

  // GUARD: the window only ever moves forward.
  if (!(sourceRow > parsed.startRow)) {
    return { changed: false, reason: 'hindi tinatrim — ang row ' + sourceRow +
      ' ay hindi mas mataas sa kasalukuyang ' + parsed.startRow };
  }

  var newFormula = buildImportRangeFormula_(parsed, sourceRow);
  if (dryRun) {
    return { changed: false, dryRun: true, monthKey: targetKey, from: parsed.startRow,
      to: sourceRow, endCol: parsed.endCol, formula: newFormula, note: note };
  }

  cell.setFormula(newFormula);
  SpreadsheetApp.flush();

  // GUARD: wait for the spill to land on the month the formula now names.
  var settled = false;
  var waited = 0;
  while (waited < PLAN_SHEET_TRIM_VERIFY_MS) {
    Utilities.sleep(PLAN_SHEET_TRIM_POLL_MS);
    waited += PLAN_SHEET_TRIM_POLL_MS;
    var first = mirrorBlocks_()[0];
    if (first && first.monthKey === targetKey) { settled = true; break; }
  }

  if (!settled) {
    cell.setFormula(formula);
    SpreadsheetApp.flush();
    return { changed: false, reason: 'hindi nag-settle ang IMPORTRANGE sa ' +
      (PLAN_SHEET_TRIM_VERIFY_MS / 1000) + 's kaya ibinalik ang dating formula ' +
      '(A' + parsed.startRow + ':' + parsed.endCol + ')' };
  }

  return { changed: true, monthKey: targetKey, from: parsed.startRow, to: sourceRow,
    endCol: parsed.endCol, formula: newFormula, note: note };
}

/** Menu: what the trim would do, without writing anything. */
function previewPlanSheetTrim() {
  var config = readConfigMap_();
  var afterDays = configNumber_(config, ARCHIVE_AFTER_DAYS_KEY, ARCHIVE_DEFAULT_AFTER_DAYS);
  var enabled = configBool_(config, ARCHIVE_ENABLED_KEY, false);
  var purge = configBool_(config, ARCHIVE_PURGE_KEY, ARCHIVE_DEFAULT_PURGE);
  var trim = configBool_(config, ARCHIVE_TRIM_KEY, ARCHIVE_DEFAULT_TRIM);
  var due = eligibleMonths_(afterDays);
  var keys = [];
  for (var i = 0; i < due.length; i++) keys.push(due[i].key);

  var lines = [];
  lines.push(PLAN_SHEET_NAME + ' — formula window');
  lines.push('');
  lines.push('PLAN_SHEET_TRIM_ENABLED: ' + PLAN_SHEET_TRIM_ENABLED);
  lines.push('ARCHIVE_ENABLED: ' + enabled + '   ARCHIVE_PURGE: ' + purge +
    '   ARCHIVE_TRIM: ' + trim);
  lines.push('Buwan na due ngayon: ' + (keys.length ? keys.join(', ') : 'wala'));
  lines.push('Mga buwan sa sheet: ' + (mirrorMonthKeys_().join(', ') || 'wala'));
  lines.push('');

  if (!keys.length) {
    lines.push('Wala pang due na buwan, kaya walang itatrim. Lumalabas ang preview kapag may ' +
      'buwan nang nakalampas sa cut-off.');
  } else {
    var preview = trimPlanSheetFormula_(keys, true);
    if (preview.dryRun) {
      lines.push('Kasalukuyang window: A' + preview.from + ':' + preview.endCol);
      lines.push('Iminumungkahing window:');
      lines.push('  ' + preview.formula);
      lines.push('Magsisimula sa ' + preview.monthKey + ' (source row ' + preview.to + ')');
      lines.push('Pinagmulan ng row: ' + preview.note);
    } else {
      lines.push('Hindi itatrim: ' + preview.reason);
    }
  }

  lines.push('');
  lines.push('Walang isinulat sa sheet. Ang aktwal na pagtrim ay tumatakbo pagkatapos ng ' +
    'archive kapag ARCHIVE_TRIM = TRUE at naka-enable ang trim para sa ' + PLAN_ID + ' ' +
    '(ngayon: ' + PLAN_SHEET_TRIM_ENABLED + ').');
  planSheetAlert_(lines.join('\n'));
}

/** Menu: puts the full-history range back, so the sheet holds every month again. */
function restorePlanSheetFormula() {
  var cell = planSheetAnchorCell_();
  if (!cell) { planSheetAlert_(PLAN_SHEET_NAME + ' sheet not found.'); return; }

  var parsed = parseImportRangeFormula_(cell.getFormula());
  if (!parsed) {
    planSheetAlert_('Ang A1 ng ' + PLAN_SHEET_NAME + ' ay hindi IMPORTRANGE na may A<n>:M — ' +
      'walang ibabalik.');
    return;
  }
  if (parsed.startRow === 1) {
    planSheetAlert_('Naka-A1:' + parsed.endCol + ' na ang ' + PLAN_SHEET_NAME +
      ' — buo na ang kasaysayan.');
    return;
  }

  cell.setFormula(buildImportRangeFormula_(parsed, 1));
  SpreadsheetApp.flush();
  fullSync();
  planSheetAlert_('Ibinalik ang ' + PLAN_SHEET_NAME + ' sa A1:' + parsed.endCol + ' (dating A' +
    parsed.startRow + ':' + parsed.endCol + ').\n\n' +
    'Buong kasaysayan na ulit ang nasa sheet, at ni-rebuild ang RAW DATA at MTD.\n' +
    'Tandaan: itatrim itong muli ng susunod na archive run hangga\'t ARCHIVE_TRIM = TRUE.');
}

// ==================== ARCHIVE: one month ====================

function archiveOneMonth_(month, dryRun, purge, trim) {
  var rawRows = collectRawArchiveRows_(month.key);
  // Computed from the rows just read, not read back off the MTD sheet — see
  // deriveMtdArchiveRows_ for why the sheet was the wrong source.
  var mtdRows = deriveMtdArchiveRows_(rawRows, month.key, month.label);

  if (!rawRows.length) {
    return { note: month.label + ': walang RAW DATA rows — nilaktawan.', verified: false };
  }

  var localRawSum = sumCompleted_(rawRows);
  var localMtdSum = sumCompleted_(mtdRows);

  // Which way this sheet shrinks. Purging needs the rows to be real cells; when the report
  // sheet is one spilled =IMPORTRANGE(...) its rows are an array formula's output, and
  // deleting them does not remove data — it tears the formula out of A1. A mirror is
  // narrowed once, after the loop, by moving the range (trimPlanSheetFormula_).
  var mirror = planSheetIsFormulaDriven_();
  var willPurge = purge && !mirror;
  var willTrim = trim && mirror && PLAN_SHEET_TRIM_ENABLED;
  var whyNoShrink = mirror
    ? (PLAN_SHEET_TRIM_ENABLED
        ? (trim
            ? 'formula-driven — ang window ng ' + PLAN_SHEET_NAME +
              ' ang itatrim pagkatapos ng lahat ng buwan'
            : 'hindi naka-TRUE ang ARCHIVE_TRIM, kaya hindi gumagalaw ang window ng ' +
              PLAN_SHEET_NAME)
        : 'gawa ng formula ang ' + PLAN_SHEET_NAME + ' (IMPORTRANGE), kaya hindi ito maaaring ' +
          'burahin dito — alisin ang buwan sa pinagmulang sheet')
    : 'hindi naka-TRUE ang ARCHIVE_PURGE';

  if (dryRun) {
    var shrink;
    if (willTrim) {
      var preview = trimPlanSheetFormula_([month.key], true);
      shrink = preview.dryRun
        ? 'ang window ng ' + PLAN_SHEET_NAME + ' ay A' + preview.from + ':' + preview.endCol +
          ' → A' + preview.to + ':' + preview.endCol + ' (magsisimula sa ' + preview.monthKey + ').'
        : 'walang itatrim sa formula — ' + preview.reason + '.';
    } else if (willPurge) {
      shrink = purgeMonthFromNewReport_(month.key, true).rows + ' NEW REPORT rows ang buburahin.';
    } else {
      shrink = 'Walang buburahin — ' + whyNoShrink + '.';
    }
    return {
      note: month.label + ' (DRY RUN): ' + rawRows.length + ' RAW rows (sum ' + localRawSum +
        '), ' + mtdRows.length + ' MTD rows (sum ' + localMtdSum + '). ' + shrink +
        ' Walang in-upload at walang binura.',
      verified: false
    };
  }

  supabaseUpsert_('sli_raw_daily', rawRows, 'plan,report_date,area');
  supabaseUpsert_('sli_mtd', mtdRows, 'plan,month_key,area');

  // GATE: nothing is deleted until Supabase demonstrably holds the whole month —
  // row counts AND a checksum, so a partial write can never be mistaken for success.
  var remoteRawCount = supabaseCount_('sli_raw_daily', 'plan=eq.' + PLAN_ID + '&month_key=eq.' + month.key);
  var remoteMtdCount = supabaseCount_('sli_mtd', 'plan=eq.' + PLAN_ID + '&month_key=eq.' + month.key);
  var remoteRawSum = supabaseSum_('sli_raw_daily',
    'plan=eq.' + PLAN_ID + '&month_key=eq.' + month.key + '&is_overall_total=eq.false', 'total_completed');
  var remoteMtdSum = supabaseSum_('sli_mtd',
    'plan=eq.' + PLAN_ID + '&month_key=eq.' + month.key + '&is_overall_total=eq.false', 'total_completed');

  // An empty expectation is NOT a pass. If the MTD sheet happened to be mid-rebuild by
  // another execution when it was read, the collection comes back empty and `0 === 0`
  // reads as "verified" — and then the purge deletes a month whose MTD figures were
  // never archived. Both sides have to hold something before anything is deleted.
  var rawOk = rawRows.length > 0 &&
    (remoteRawCount === rawRows.length) && (remoteRawSum === localRawSum);
  var mtdOk = mtdRows.length > 0 &&
    (remoteMtdCount === mtdRows.length) && (remoteMtdSum === localMtdSum);

  if (!rawOk || !mtdOk) {
    var empty = [];
    if (rawRows.length === 0) empty.push('RAW DATA');
    if (mtdRows.length === 0) empty.push('MTD');
    return {
      note: month.label + ': VERIFICATION FAILED — WALANG BINURA AT WALANG TRIM. ' +
        (empty.length ? 'Walang nabasang rows sa ' + empty.join(' at ') +
          ' — may ibang takbo na gumagawa ng sheet sa parehong oras. ' : '') +
        'RAW ' + remoteRawCount + '/' + rawRows.length + ' rows, sum ' + remoteRawSum + '/' +
        localRawSum + ' | ' + 'MTD ' + remoteMtdCount + '/' + mtdRows.length + ' rows, sum ' +
        remoteMtdSum + '/' + localMtdSum,
      verified: false
    };
  }

  if (!willPurge) {
    // Transfer only. Nothing is read from NEW REPORT again and no Full Sync is re-run, so
    // the run is shorter and the sheet is left exactly as it was found.
    return {
      note: month.label + ': archived ' + rawRows.length + ' RAW + ' + mtdRows.length +
        ' MTD rows sa Supabase; walang binura — ' + whyNoShrink + '.',
      verified: true
    };
  }

  var purged = purgeMonthFromNewReport_(month.key, false);
  fullSync();

  return {
    note: month.label + ': archived ' + rawRows.length + ' RAW + ' + mtdRows.length +
      ' MTD rows; purged ' + purged.rows + ' NEW REPORT rows (' + purged.labels.length +
      ' day blocks, ' + purged.labels.join(', ') + ').',
    verified: true
  };
}

function auditArchive_(summary, startedAt, dryRun) {
  var line = Utilities.formatDate(startedAt, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
    ' [' + PLAN_ID + (dryRun ? ' DRY RUN' : '') + '] ' + summary;
  try { writeConfigValue_(ARCHIVE_LAST_KEY, line); } catch (e) { /* auditing must not throw */ }
  Logger.log(line);
}

function alertArchiveFailure_(error, summary) {
  try {
    var to = String(PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL') || '').trim();
    if (!to) return;
    MailApp.sendEmail(to, 'SLI Tracker archive FAILED (' + PLAN_ID + ')',
      summary + '\n\n' + (error && error.stack ? error.stack : String(error)));
  } catch (e) { /* never let alerting break the run */ }
}

/**
 * The scheduled entry point: archive + purge every month that is due, oldest first.
 *
 * RECOMMENDED ORDER: run the dry run first — menu 'Archive Dry Run' — and only then
 * set ARCHIVE_ENABLED to TRUE.
 */
function archiveClosedMonths() {
  var startedAt = new Date();
  var config = readConfigMap_();
  var enabled = configBool_(config, ARCHIVE_ENABLED_KEY, false);
  var dryRun = configBool_(config, ARCHIVE_DRY_RUN_KEY, false);
  var afterDays = configNumber_(config, ARCHIVE_AFTER_DAYS_KEY, ARCHIVE_DEFAULT_AFTER_DAYS);
  var purge = configBool_(config, ARCHIVE_PURGE_KEY, ARCHIVE_DEFAULT_PURGE);
  var notes = [];

  try {
    // A dry run is allowed while the archive is disabled, so the cut-off dates can be
    // previewed before anything is switched on. The scheduled run stays inert.
    if (!enabled && !dryRun) {
      auditArchive_('ARCHIVE_ENABLED is not TRUE — walang ginawa. ' +
        '(Itakda ang ARCHIVE_ENABLED = TRUE sa CONFIG tab para payagan ang archiving.)', startedAt, false);
      return;
    }

    if (!dryRun) {
      // The archive source must be complete, so rebuild RAW DATA + MTD first. Without
      // this the archive could freeze a month as it looked five minutes ago.
      fullSync();
    }

    var trim = configBool_(config, ARCHIVE_TRIM_KEY, ARCHIVE_DEFAULT_TRIM);
    var months = eligibleMonths_(afterDays);
    if (!months.length) {
      auditArchive_('Walang buwang due pa (kailangan ang ' + afterDays +
        ' araw pagkatapos ng buwan). Walang ginawa.', startedAt, dryRun);
      return;
    }

    var verified = [];
    for (var i = 0; i < months.length; i++) {
      var outcome = archiveOneMonth_(months[i], dryRun, purge, trim);
      notes.push(outcome.note);
      if (outcome.verified) verified.push(months[i].key);
    }

    // The window moves ONCE, after every due month has been uploaded and verified. Doing
    // it per month would slide the rows out from under the next month's read — and the
    // months it is allowed to skip past are exactly the ones this run verified.
    //
    // Mirrors only: on a hand-encoded tab each month was already deleted as it was
    // archived, and there is no range to move.
    if (!dryRun && trim && verified.length && planSheetIsFormulaDriven_()) {
      var trim = trimPlanSheetFormula_(verified, false);
      if (trim.changed) {
        notes.push('Formula trim: ' + PLAN_SHEET_NAME + ' A' + trim.from + ':' + trim.endCol +
          ' → A' + trim.to + ':' + trim.endCol + ' (mula na lang sa ' + trim.monthKey + '; ' +
          trim.note + ').');
        fullSync();
      } else {
        notes.push('Formula trim: hindi isinagawa — ' + trim.reason + '.');
      }
    }

    auditArchive_(notes.join(' | '), startedAt, dryRun);
  } catch (error) {
    notes.push('FAILED: ' + (error && error.message ? error.message : String(error)));
    auditArchive_(notes.join(' | '), startedAt, dryRun);
    alertArchiveFailure_(error, notes.join(' | '));
    throw error;
  }
}

/** Menu helper: forces DRY_RUN for one pass, then restores the previous value. */
function archiveDryRun() {
  var previous = configString_(readConfigMap_(), ARCHIVE_DRY_RUN_KEY, '');
  writeConfigValue_(ARCHIVE_DRY_RUN_KEY, 'TRUE');
  try {
    archiveClosedMonths();
  } finally {
    writeConfigValue_(ARCHIVE_DRY_RUN_KEY, previous === '' ? 'FALSE' : previous);
  }
  try {
    SpreadsheetApp.getUi().alert('Dry run tapos na.\n\nTingnan ang LAST_ARCHIVE row sa CONFIG tab ' +
      'para sa bilang ng rows na aarchive. Paliliitin lamang ang sheet kapag sumasang-ayon ' +
      'ang dalawang switch, at kung paano depende sa sheet: deleteRows sa hand-encoded ' +
      '(ARCHIVE_PURGE = TRUE), o paghakbang ng IMPORTRANGE window sa mirror ' +
      '(ARCHIVE_TRIM = TRUE at naka-enable ang trim para sa planong ito).');
  } catch (e) {}
}

// ==================== CONNECTION TEST ====================

/**
 * Answers "tama ba ang SUPABASE_URL at SUPABASE_SERVICE_KEY?" without touching data.
 *
 * The READS settle very little: the archive tables are public-read on purpose (the app
 * fetches closed months with the anon key), so they answer even for a wrong key. The
 * question that matters is whether this key may WRITE, and that is settled with an
 * EMPTY INSERT probe: Postgres checks the INSERT privilege and RLS *before* it
 * evaluates constraints, so a key that may write gets 23502 (not-null violation) and
 * NOTHING is stored, while a key that may not gets 42501 — which covers both a missing
 * GRANT and an RLS violation, and is exactly what an anon key produces.
 *
 * Not-null is the probe on purpose: it aborts the whole statement, so no probe row can
 * survive a partial success. Verified against a throwaway table — this body comes back
 * as 23502 with zero rows left behind.
 */
function testSupabaseConnection() {
  var label = (typeof PLAN_ID === 'string' && PLAN_ID) ? PLAN_ID.toUpperCase() : 'PLAN';
  var lines = [];
  var problems = [];

  var config = null;
  try {
    config = supabaseConfig_();
  } catch (error) {
    lines.push('✗ ' + error.message);
  }

  if (config) {
    lines.push('URL         ' + config.url);

    var role = supabaseKeyRole_(config.key);
    lines.push('Key role    ' + (role || '(hindi JWT — sb_secret_ key, o sirang key)'));
    if (role === 'anon' || role === 'authenticated') {
      problems.push('Ang naka-set na key ay "' + role + '" — mali ito. Kunin ang ' +
        'service_role secret sa Supabase → Project Settings → API keys.');
    }

    var tables = [
      { name: 'sli_raw_daily', conflict: 'plan,report_date,area' },
      { name: 'sli_mtd', conflict: 'plan,month_key,area' }
    ];

    for (var i = 0; i < tables.length; i++) {
      lines.push('');
      lines.push(tables[i].name + ':');

      try {
        var count = supabaseCount_(tables[i].name, 'select=id');
        lines.push('  read    OK — ' + (count < 0 ? 'hindi mabasa ang count' : count + ' row(s)'));
      } catch (error) {
        lines.push('  read    ✗ ' + error.message);
        problems.push(tables[i].name + ' hindi mabasa: ' + error.message);
      }

      try {
        var probe = supabaseRequest_(tables[i].name + '?on_conflict=' + tables[i].conflict, {
          method: 'post',
          body: {},
          prefer: 'resolution=merge-duplicates,return=minimal'
        });
        var verdict = readWriteProbe_(probe, tables[i].name);
        lines.push('  write   ' + (verdict.writable ? 'OK — ' : '✗ ') + verdict.detail);
        if (!verdict.writable) problems.push(tables[i].name + ' — ' + verdict.detail);
      } catch (error) {
        lines.push('  write   ✗ ' + error.message);
        problems.push(tables[i].name + ' hindi masulatan: ' + error.message);
      }
    }
  }

  lines.push('');
  if (!problems.length) {
    lines.push('RESULTA: handa na ang archive para sa ' + label + '. Walang nabago sa data.');
  } else {
    lines.push('RESULTA: hindi pa handa ang archive.');
    for (var p = 0; p < problems.length; p++) lines.push('• ' + problems[p]);
  }

  reportSupabaseTest_(label, lines, !problems.length);
}

/**
 * What the empty-row probe actually said. Only a constraint rejection (23502 and
 * friends) proves the write was permitted; anything else — in particular 42501, which
 * is both "permission denied" and an RLS violation — means it was not.
 */
function readWriteProbe_(response, table) {
  var body = {};
  try { body = JSON.parse(response.text || '{}') || {}; } catch (error) { body = {}; }
  var code = String(body.code || '');
  var message = String(body.message || '').trim();

  if (response.code >= 200 && response.code < 300) {
    // The probe is always invalid, so this cannot happen — and if it ever did, a null
    // row may now be sitting in the table. Never report this as a pass.
    return { writable: false, detail: 'paalala: tinanggap ang blangkong row (HTTP ' +
      response.code + ') — suriin kung may naipasok sa ' + table };
  }
  if (code === '23502' || code === '23514' || code === '23503' ||
      code === '22P02' || code === '22007') {
    return { writable: true, detail: 'may pahintulot (tinanggihan ng ' + code +
      ' ang probe — walang naipasok)' };
  }
  if (response.code === 401 || response.code === 403 || code === '42501') {
    return { writable: false, detail: 'walang pahintulot (HTTP ' + response.code +
      (code ? ' / ' + code : '') + ') — mali o kulang ang key' };
  }
  if (response.code === 404 || code === 'PGRST205' || code === '42P01') {
    return { writable: false, detail: 'hindi mahanap ang table (HTTP ' + response.code + ')' };
  }
  return { writable: false, detail: 'hindi inaasahang sagot HTTP ' + response.code +
    (code ? ' / ' + code : '') + (message ? ' — ' + message.slice(0, 120) : '') };
}

/**
 * The role a Supabase key speaks as, read straight out of the JWT payload — so "you
 * pasted the anon key" is reported as exactly that, instead of as a permission error
 * that sends you looking at the database. Returns null for keys that are not JWTs
 * (the newer sb_secret_ / sb_publishable_ pair).
 */
function supabaseKeyRole_(key) {
  var parts = String(key || '').split('.');
  if (parts.length !== 3) return null;
  try {
    var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    var claims = JSON.parse(Utilities.newBlob(Utilities.base64Decode(payload)).getDataAsString());
    return (claims && claims.role) ? String(claims.role) : null;
  } catch (error) {
    return null;
  }
}

/** Shows the report in a dialog (menu run) and always in the execution log. */
function reportSupabaseTest_(label, lines, ok) {
  var report = 'Supabase connection test — ' + label + '\n\n' + lines.join('\n');
  Logger.log(report);
  try {
    SpreadsheetApp.getUi().alert(ok ? 'Supabase OK' : 'Supabase: may problema', report,
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (error) { /* run from the editor — the execution log above is the report */ }
}

// ==================== TRIGGERS ====================

/**
 * Creates the three managed triggers if they are missing, and removes duplicates of
 * them. Every OTHER trigger in the project is left alone.
 */
function setupManagedTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var want = { autoSync: false, archiveClosedMonths: false, fullSync: false };
  var removed = { setup: 0, duplicate: 0 };

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var handler = trigger.getHandlerFunction();

    // Triggers accidentally pointed at a menu/setup function can never do useful work.
    if (handler === 'onOpen' || handler === 'setupAutoTrigger' || handler === 'setupManagedTriggers' ||
        handler === 'stopAutoTrigger' || handler === 'stopManagedTriggers' ||
        handler === 'archiveDryRun' || handler === 'testSupabaseConnection') {
      ScriptApp.deleteTrigger(trigger);
      removed.setup++;
      continue;
    }

    if (!(handler in want)) continue; // not ours — leave it exactly as it is

    var eventType = trigger.getEventType();
    var matches =
      (handler === 'autoSync' && eventType === ScriptApp.EventType.CLOCK) ||
      (handler === 'archiveClosedMonths' && eventType === ScriptApp.EventType.CLOCK) ||
      (handler === 'fullSync' && eventType === ScriptApp.EventType.ON_CHANGE);

    if (matches && !want[handler]) {
      want[handler] = true;
    } else {
      ScriptApp.deleteTrigger(trigger);
      removed.duplicate++;
    }
  }

  if (!want.autoSync) {
    ScriptApp.newTrigger('autoSync').timeBased().everyMinutes(5).create();
  }
  if (!want.archiveClosedMonths) {
    ScriptApp.newTrigger('archiveClosedMonths').timeBased().atHour(2).everyDays(1).create();
  }
  if (!want.fullSync) {
    ScriptApp.newTrigger('fullSync').forSpreadsheet(ss).onChange().create();
  }

  var message = 'Managed triggers ready.\n\n' +
    '- autoSync — every 5 minutes (Import + MTD)\n' +
    '- archiveClosedMonths — daily 02:00 (Archive the closed month)\n' +
    '- fullSync — on spreadsheet change (Import + MTD)\n\n' +
    'Nyari: ' + removed.duplicate + ' duplicate, ' + removed.setup + ' sirang trigger ang tinanggal.\n' +
    'Iba pang trigger sa project ay hindi ginalaw.';
  try { SpreadsheetApp.getUi().alert(message); } catch (e) {}
}

/** Removes only the triggers this script manages. */
function stopManagedTriggers() {
  var managed = { autoSync: true, archiveClosedMonths: true, fullSync: true };
  var removed = 0;

  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (managed[triggers[i].getHandlerFunction()]) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  try { SpreadsheetApp.getUi().alert(removed + ' managed trigger(s) removed.'); } catch (e) {}
}

// Deprecated aliases. The old setup deleted EVERY project trigger before installing
// its timer, which silently removed the hand-made on-change fullSync trigger — these
// now delegate to the managed versions so an old habit cannot break the setup.
function setupAutoTrigger() { setupManagedTriggers(); }
function stopAutoTrigger() { stopManagedTriggers(); }

// ==================== MENU ====================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('GVSI Auto-DB')
    .addItem('Import FIBERX to RAW DATA', 'importFiberxToRawData')
    .addItem('Generate MTD Report', 'generateMTDReport')
    .addSeparator()
    .addItem('Full Sync (Import + MTD)', 'fullSync')
    .addSeparator()
    .addItem('Setup / Edit CONFIG Sheet', 'setupConfigSheet')
    .addSeparator()
    .addItem('Setup Managed Triggers', 'setupManagedTriggers')
    .addItem('Stop Managed Triggers', 'stopManagedTriggers')
    .addSeparator()
    .addItem('Archive Closed Months to Supabase', 'archiveClosedMonths')
    .addItem('Archive Dry Run', 'archiveDryRun')
    .addItem('Preview Formula Trim', 'previewPlanSheetTrim')
    .addItem('Restore NEW REPORT Formula (full history)', 'restorePlanSheetFormula')
    .addSeparator()
    .addItem('Test Supabase Connection', 'testSupabaseConnection')
    .addToUi();
}

function autoSync() {
  importFiberxToRawData();
  generateMTDReport();
}

function fullSync() {
  importFiberxToRawData();
  generateMTDReport();
}
