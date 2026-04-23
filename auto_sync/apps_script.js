// ============================================================
// Quantum Terminal — Binance Auto Sync via Google Apps Script
// Runs at 6 AM, 2:30 PM, 9 PM Nepal time
// ============================================================

var BINANCE_API_KEY    = "WJlJCH5nmMbW4ZSZRGpycV125umLvQ8KTcAV1skfuAKWBNulw1OnJCkkXzM3xCYS";
var BINANCE_API_SECRET = "GLhG6xW0GmvRslnkhOxSUP7KyYaeA4MaxhreAiWWXbZK3627bCE797ThntLAUXyT";
var SHEET_TAB          = "Table1";

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPrice(symbol) {
  var url = "https://api.binance.com/api/v3/ticker/price?symbol=" + symbol;
  var res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  return parseFloat(JSON.parse(res.getContentText()).price);
}

function hmacSha256(secret, message) {
  var key  = Utilities.newBlob(secret).getBytes();
  var msg  = Utilities.newBlob(message).getBytes();
  var hash = Utilities.computeHmacSha256Signature(msg, key);
  return hash.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

function getBalances() {
  var ts     = Date.now().toString();
  var query  = "timestamp=" + ts;
  var sig    = hmacSha256(BINANCE_API_SECRET, query);
  var url    = "https://api.binance.com/api/v3/account?" + query + "&signature=" + sig;
  var opts   = { headers: { "X-MBX-APIKEY": BINANCE_API_KEY }, muteHttpExceptions: true };
  var data   = JSON.parse(UrlFetchApp.fetch(url, opts).getContentText());
  
  var out = { BTC: 0, ETH: 0, USDT: 0, USDC: 0 };
  data.balances.forEach(function(b) {
    if (out.hasOwnProperty(b.asset)) {
      out[b.asset] = parseFloat(b.free) + parseFloat(b.locked);
    }
  });
  return out;
}

function getTodayNepal() {
  var now    = new Date();
  var offset = 5 * 60 + 45; // Nepal = UTC+5:45
  var nepal  = new Date(now.getTime() + offset * 60 * 1000);
  var y = nepal.getUTCFullYear();
  var m = String(nepal.getUTCMonth() + 1).padStart(2, '0');
  var d = String(nepal.getUTCDate()).padStart(2, '0');
  return y + "-" + m + "-" + d;
}

// ── Main Sync ─────────────────────────────────────────────────────────────────
function syncBalances() {
  var today    = getTodayNepal();
  var balances = getBalances();
  var btcPrice = Math.round(getPrice("BTCUSDT") * 100) / 100;
  var ethPrice = Math.round(getPrice("ETHUSDT") * 100) / 100;

  Logger.log("Date: " + today);
  Logger.log("BTC: " + balances.BTC + " @ $" + btcPrice);
  Logger.log("ETH: " + balances.ETH + " @ $" + ethPrice);
  Logger.log("USDT: $" + balances.USDT + "  USDC: $" + balances.USDC);

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TAB);
  var col_A = sheet.getRange("A:A").getValues();

  // Find existing row for today
  var existingRow = -1;
  for (var i = 0; i < col_A.length; i++) {
    var cell = col_A[i][0];
    var cellStr = (cell instanceof Date)
      ? Utilities.formatDate(cell, "UTC", "yyyy-MM-dd")
      : String(cell).trim();
    if (cellStr === today) {
      existingRow = i + 1; // 1-indexed
      break;
    }
  }

  if (existingRow > 0) {
    // Update B–G only, preserve WODL (H) and Other (I)
    sheet.getRange(existingRow, 2, 1, 6).setValues([[
      balances.BTC, btcPrice,
      balances.ETH, ethPrice,
      balances.USDT, balances.USDC
    ]]);
    Logger.log("Updated row " + existingRow + " (WODL preserved).");
  } else {
    // Append new row
    sheet.appendRow([
      today,
      balances.BTC, btcPrice,
      balances.ETH, ethPrice,
      balances.USDT, balances.USDC,
      0, // WODL — fill manually
      0  // Other — fill manually
    ]);
    Logger.log("Appended new row for " + today);
  }
}

// ── Price-Only Sync (every 15 min) ────────────────────────────────────────────
function syncPrices() {
  var btcPrice = Math.round(getPrice("BTCUSDT") * 100) / 100;
  var ethPrice = Math.round(getPrice("ETHUSDT") * 100) / 100;

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var ws;
  try { ws = ss.getSheetByName("LivePrices"); } catch(e) { ws = null; }
  if (!ws) {
    ws = ss.insertSheet("LivePrices");
    ws.getRange("A1:C1").setValues([["BTC_PRICE", "ETH_PRICE", "LAST_UPDATED"]]);
  }
  var now   = new Date();
  var label = Utilities.formatDate(new Date(now.getTime() + (5*60+45)*60000), "UTC", "yyyy-MM-dd HH:mm") + " NPT";
  ws.getRange("A2:C2").setValues([[btcPrice, ethPrice, label]]);
  Logger.log("Prices updated: BTC $" + btcPrice + " ETH $" + ethPrice);
}

// ── Manual Backup — Web App Endpoint ─────────────────────────────────────────
// Deploy as Web App (Execute as: Me, Access: Anyone) to get a POST URL.
// Use this as fallback if auto-sync ever fails — the dashboard or a manual
// script can POST JSON to this URL to write a row directly.
//
// Expected JSON payload:
// {
//   "date": "2026-04-23",
//   "btcBal": 0.00012, "btcPrice": 78000,
//   "ethBal": 0.00127, "ethPrice": 2400,
//   "usdtBal": 70.1,   "usdcBal": 29.7,
//   "inflowWodl": 0,   "inflowOther": 0
// }
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
  return ContentService.createTextOutput("");
}
