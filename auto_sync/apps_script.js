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
    // We use CoinGecko instead of Binance because Binance blocks Google Servers (US IPs)
    var url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd";
    var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var data = JSON.parse(response.getContentText());
    
    var btcPrice = data.bitcoin ? data.bitcoin.usd : NaN;
    var ethPrice = data.ethereum ? data.ethereum.usd : NaN;

    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var lastRow = sheet.getLastRow();

    Logger.log("--- DEBUG INFO ---");
    Logger.log("Sheet Name found: " + sheet.getName());
    Logger.log("Last Row found: " + lastRow);
    Logger.log("BTC Price: " + btcPrice);
    Logger.log("ETH Price: " + ethPrice);
    Logger.log("------------------");

    // Update column C (BTC) and E (ETH) on the last row only
    if (lastRow > 0 && !isNaN(btcPrice) && !isNaN(ethPrice)) {
      var targetRow = lastRow < 2 ? 2 : lastRow; // Ensure we don't overwrite headers if lastRow == 1
      sheet.getRange(targetRow, 3).setValue(btcPrice); 
      sheet.getRange(targetRow, 5).setValue(ethPrice); 
      Logger.log("Prices updated successfully on row " + targetRow + ": BTC $" + btcPrice + " | ETH $" + ethPrice);
    } else {
      Logger.log("Skipped update! Condition failed (is lastRow 0? or prices NaN?)");
    }
  } catch (err) {
    Logger.log("Error: " + err.toString());
  }
}
