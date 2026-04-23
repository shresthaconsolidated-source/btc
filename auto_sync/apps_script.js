// ============================================================
// Quantum Terminal — Apps Script Backend
// 1. doPost: Handles manual data entry from the dashboard
// 2. updateLatestPrices: Auto-updates BTC/ETH prices every 15m
// ============================================================

var SHEET_ID = "1g-9m61dQU-04u8ngWP6y5Kd4rMltunQnrCy3uxUM0sU";
var SHEET_TAB = "Table1"; 

// ── 1. Receives Balances from Quantum Dashboard ──────────────────────────────
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var lastRow = sheet.getLastRow();

    var newRow = [
      data.date,
      data.btcBal,    data.btcPrice,
      data.ethBal,    data.ethPrice,
      data.usdtBal,   data.usdcBal,
      data.inflowWodl || 0,
      data.inflowOther || 0
    ];

    sheet.appendRow(newRow);
    var newRowIndex = lastRow + 1;

    // Copy formula columns J, K, L from the row above
    if (lastRow > 1) {
      sheet.getRange(lastRow, 10, 1, 3)
           .copyTo(sheet.getRange(newRowIndex, 10, 1, 3),
                   SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", row: newRowIndex }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doOptions(e) {
  return ContentService.createTextOutput(""); // Bypasses browser CORS blocks
}

// ── 2. Auto Price Update (Every 15 Min) ──────────────────────────────────────
function updateLatestPrices() {
  try {
    var btcPrice = Math.round(parseFloat(JSON.parse(
      UrlFetchApp.fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {muteHttpExceptions: true})
      .getContentText()).price) * 100) / 100;
      
    var ethPrice = Math.round(parseFloat(JSON.parse(
      UrlFetchApp.fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", {muteHttpExceptions: true})
      .getContentText()).price) * 100) / 100;

    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var lastRow = sheet.getLastRow();

    // Update column C (BTC) and E (ETH) on the last row only
    if (lastRow > 1 && !isNaN(btcPrice) && !isNaN(ethPrice)) {
      sheet.getRange(lastRow, 3).setValue(btcPrice); 
      sheet.getRange(lastRow, 5).setValue(ethPrice); 
      Logger.log("Prices updated to BTC $" + btcPrice + " | ETH $" + ethPrice);
    }
  } catch (err) {
    Logger.log("Error: " + err.toString());
  }
}
