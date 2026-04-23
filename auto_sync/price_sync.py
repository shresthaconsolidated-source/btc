"""
Quantum Terminal - Live Price Sync
Runs every 15 minutes via GitHub Actions.
Updates a dedicated 'LivePrices' tab with current BTC and ETH prices.
The dashboard can read from this tab for live ticker display.

LivePrices tab layout (auto-created if missing):
  A1: BTC_PRICE  B1: ETH_PRICE  C1: LAST_UPDATED
"""

import os, json, urllib.request
from datetime import datetime, timezone, timedelta
import gspread
from google.oauth2.service_account import Credentials

BINANCE_BASE = "https://api.binance.com"

def get_price(symbol):
    url = f"{BINANCE_BASE}/api/v3/ticker/price?symbol={symbol}"
    with urllib.request.urlopen(url) as r:
        return float(json.loads(r.read())["price"])

def get_sheet_client():
    creds = Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    return gspread.authorize(creds).open_by_key(os.environ["GOOGLE_SHEET_ID"])

def main():
    btc_price = round(get_price("BTCUSDT"), 2)
    eth_price = round(get_price("ETHUSDT"), 2)

    nepal_tz   = timezone(timedelta(hours=5, minutes=45))
    updated_at = datetime.now(nepal_tz).strftime("%Y-%m-%d %H:%M NPT")

    print(f"BTC: ${btc_price:,.2f}  ETH: ${eth_price:,.2f}  [{updated_at}]")

    wb = get_sheet_client()

    # Get or create the LivePrices tab
    try:
        ws = wb.worksheet("LivePrices")
    except gspread.exceptions.WorksheetNotFound:
        ws = wb.add_worksheet(title="LivePrices", rows=2, cols=3)
        ws.update("A1:C1", [["BTC_PRICE", "ETH_PRICE", "LAST_UPDATED"]])
        print("Created LivePrices tab.")

    # Always write to row 2 (row 1 = headers), overwriting previous value
    ws.update("A2:C2", [[btc_price, eth_price, updated_at]])
    print("✅ Prices updated in LivePrices tab.")

if __name__ == "__main__":
    main()
