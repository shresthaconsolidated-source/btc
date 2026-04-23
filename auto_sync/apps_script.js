// ============================================================
// Quantum Terminal — Apps Script Backend (Manual Entry Edition)
// ============================================================

var SHEET_ID = "1g-9m61dQU-04u8ngWP6y5Kd4rMltunQnrCy3uxUM0sU";
var SHEET_TAB = "Table1";

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_TAB) || ss.getSheets()[0];
    var lastRow = sheet.getLastRow();

    var newRow = [
      payload.data.date,
      payload.data.btcBal,    payload.data.btcPrice,
      payload.data.ethBal,    payload.data.ethPrice,
      payload.data.usdtBal,   payload.data.usdcBal,
      payload.data.inflowWodl || 0,
      payload.data.inflowOther || 0
    ];

    var updatedRowIndex;

    if (payload.action === "update") {
      // Overwrite the last row
      if (lastRow < 2) { 
        // If sheet is empty except headers, just append
        sheet.appendRow(newRow);
        updatedRowIndex = lastRow + 1;
      } else {
        sheet.getRange(lastRow, 1, 1, 9).setValues([newRow]);
        updatedRowIndex = lastRow;
      }
    } else {
      // Default: Append a new row
      sheet.appendRow(newRow);
      updatedRowIndex = lastRow + 1;
      
      // Copy formula columns J, K, L down to the new row
      if (lastRow > 1) {
        sheet.getRange(lastRow, 10, 1, 3)
             .copyTo(sheet.getRange(updatedRowIndex, 10, 1, 3),
                     SpreadsheetApp.CopyPasteType.PASTE_NORMAL, false);
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", row: updatedRowIndex, action: payload.action || "append" }))
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
