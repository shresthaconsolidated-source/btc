// ============================================================
// Quantum Terminal — Apps Script Backend
// 1. doPost: Handles manual data entry from the dashboard
// 2. updateLatestPrices: Auto-updates BTC/ETH prices every 15m
// ============================================================

var SHEET_TAB = "Table1";

// ── 1. Manual Entry — Web App Endpoint ──────────────────────────────────────
// Deploy as Web App (Execute as: Me, Access: Anyone) to get a POST URL.
// Use this for the Quantum Dashboard to write rows directly to the sheet.
function doPost(e) {
  try {
    var data  = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB);
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

    // Copy formula columns J, K, L from row above
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
  // Allow all for cross-origin requests from your local app
  return ContentService.createTextOutput("");
}

// ── 2. Price Auto-Updater ────────────────────────────────────────────────────
// Set up a Time-driven trigger to run this every 15 minutes.
function updateLatestPrices() {
  try {
    var btcPrice = Math.round(parseFloat(JSON.parse(
      UrlFetchApp.fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {muteHttpExceptions: true})
      .getContentText()).price) * 100) / 100;
      
    var ethPrice = Math.round(parseFloat(JSON.parse(
      UrlFetchApp.fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", {muteHttpExceptions: true})
      .getContentText()).price) * 100) / 100;

    var sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TAB);
    var lastRow = sheet.getLastRow();

    // Update column C (BTC Price) and E (ETH Price) on the last row
    if (lastRow > 1 && !isNaN(btcPrice) && !isNaN(ethPrice)) {
      sheet.getRange(lastRow, 3).setValue(btcPrice); // Column C
      sheet.getRange(lastRow, 5).setValue(ethPrice); // Column E
      Logger.log("Updated row " + lastRow + ": BTC $" + btcPrice + " | ETH $" + ethPrice);
    } else {
      Logger.log("Failed to update prices. Invalid data or empty sheet.");
    }
  } catch (err) {
    Logger.log("Error fetching prices: " + err.toString());
  }
}
