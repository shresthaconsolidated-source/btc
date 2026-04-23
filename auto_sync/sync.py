"""
Quantum Terminal - Daily Binance Auto-Sync
Pulls BTC, ETH, USDT, USDC from Binance and appends a row to Google Sheet.
Runs daily via GitHub Actions at 9 PM Nepal time (15:15 UTC).
"""

import os
import hmac
import hashlib
import time
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

import gspread
from google.oauth2.service_account import Credentials

# ── Binance ────────────────────────────────────────────────────────────────────
BINANCE_API_KEY    = os.environ["BINANCE_API_KEY"]
BINANCE_API_SECRET = os.environ["BINANCE_API_SECRET"]
BINANCE_BASE       = "https://api.binance.com"

def binance_signed_get(endpoint, params=None):
    params = params or {}
    params["timestamp"] = int(time.time() * 1000)
    query = urllib.parse.urlencode(params)
    signature = hmac.new(
        BINANCE_API_SECRET.encode(), query.encode(), hashlib.sha256
    ).hexdigest()
    url = f"{BINANCE_BASE}{endpoint}?{query}&signature={signature}"
    req = urllib.request.Request(url, headers={"X-MBX-APIKEY": BINANCE_API_KEY})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def get_price(symbol):
    url = f"{BINANCE_BASE}/api/v3/ticker/price?symbol={symbol}"
    with urllib.request.urlopen(url) as r:
        return float(json.loads(r.read())["price"])

def get_balances():
    account = binance_signed_get("/api/v3/account")
    balances = {b["asset"]: float(b["free"]) + float(b["locked"])
                for b in account["balances"]}
    return {
        "BTC":  round(balances.get("BTC",  0), 8),
        "ETH":  round(balances.get("ETH",  0), 6),
        "USDT": round(balances.get("USDT", 0), 2),
        "USDC": round(balances.get("USDC", 0), 2),
    }

# ── Google Sheets ──────────────────────────────────────────────────────────────
SHEET_ID = os.environ["GOOGLE_SHEET_ID"]          # The spreadsheet ID from the URL
SHEET_TAB = os.environ.get("SHEET_TAB", "Sheet1") # Tab name, default Sheet1

def get_sheet():
    creds_json = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]
    creds_dict = json.loads(creds_json)
    creds = Credentials.from_service_account_info(
        creds_dict,
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    client = gspread.authorize(creds)
    return client.open_by_key(SHEET_ID).worksheet(SHEET_TAB)

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    print("Fetching Binance data...")
    balances  = get_balances()
    btc_price = get_price("BTCUSDT")
    eth_price = get_price("ETHUSDT")

    # Nepal time = UTC + 5:45
    nepal_tz  = timezone(timedelta(hours=5, minutes=45))
    today_str = datetime.now(nepal_tz).strftime("%Y-%m-%d")

    # Row order must match your sheet columns exactly:
    # Date | BTC Bal | BTC Price | ETH Bal | ETH Price | USDT | USDC | Inflow(WODL) | Inflow(Other)
    row = [
        today_str,
        balances["BTC"],
        round(btc_price, 2),
        balances["ETH"],
        round(eth_price, 2),
        balances["USDT"],
        balances["USDC"],
        0,   # Inflow WODL — fill manually
        0,   # Inflow Other — fill manually
    ]

    print(f"Date:      {today_str}")
    print(f"BTC:       {balances['BTC']} @ ${btc_price:,.2f}")
    print(f"ETH:       {balances['ETH']} @ ${eth_price:,.2f}")
    print(f"USDT:      ${balances['USDT']}")
    print(f"USDC:      ${balances['USDC']}")
    print("Appending row to Google Sheet...")

    sheet = get_sheet()
    sheet.append_row(row, value_input_option="USER_ENTERED")
    print("✅ Done.")

if __name__ == "__main__":
    main()
