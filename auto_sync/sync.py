"""
Quantum Terminal - Balance Sync
Runs 3x daily: 6 AM, 2:30 PM, 9 PM Nepal time.

Behavior:
  - If today's date row EXISTS → overwrite balances + prices only (keeps WODL inflow intact)
  - If today's date row is MISSING → append a new row (WODL = 0, fill manually)

Sheet column order (from A):
  A: Date | B: BTC Bal | C: BTC Price | D: ETH Bal | E: ETH Price | F: USDT | G: USDC | H: Inflow(WODL) | I: Inflow(Other)
  J onwards: formula columns — never touched by this script
"""

import os, hmac, hashlib, time, json, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta
import gspread
from google.oauth2.service_account import Credentials

BINANCE_API_KEY    = os.environ["BINANCE_API_KEY"]
BINANCE_API_SECRET = os.environ["BINANCE_API_SECRET"]
BINANCE_BASE       = "https://api.binance.com"

# ── Binance ────────────────────────────────────────────────────────────────────
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
def get_sheet():
    creds = Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    client = gspread.authorize(creds)
    return client.open_by_key(
        os.environ["GOOGLE_SHEET_ID"]
    ).worksheet(os.environ.get("SHEET_TAB", "Sheet1"))

def find_row_for_today(sheet, today_str):
    """Return 1-based row index if today's date is found in column A, else None."""
    dates = sheet.col_values(1)  # All values in column A
    for i, cell in enumerate(dates):
        if cell.strip() == today_str:
            return i + 1  # gspread rows are 1-indexed
    return None

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    nepal_tz  = timezone(timedelta(hours=5, minutes=45))
    now_nepal = datetime.now(nepal_tz)
    today_str = now_nepal.strftime("%Y-%m-%d")
    time_str  = now_nepal.strftime("%H:%M")

    print(f"[{today_str} {time_str} NPT] Fetching data from Binance...")
    balances  = get_balances()
    btc_price = round(get_price("BTCUSDT"), 2)
    eth_price = round(get_price("ETHUSDT"), 2)

    print(f"  BTC: {balances['BTC']} @ ${btc_price:,.2f}")
    print(f"  ETH: {balances['ETH']} @ ${eth_price:,.2f}")
    print(f"  USDT: ${balances['USDT']}  USDC: ${balances['USDC']}")

    sheet = get_sheet()
    existing_row = find_row_for_today(sheet, today_str)

    if existing_row:
        # ── UPDATE: overwrite B–G only, leave WODL (H) + Other (I) untouched ──
        print(f"  Row {existing_row} already has today's date → updating balances only...")
        sheet.update(
            f"B{existing_row}:G{existing_row}",
            [[
                balances["BTC"],
                btc_price,
                balances["ETH"],
                eth_price,
                balances["USDT"],
                balances["USDC"],
            ]],
            value_input_option="USER_ENTERED"
        )
        print(f"✅ Row {existing_row} updated (WODL inflow preserved).")
    else:
        # ── INSERT: append a fresh row for today ──
        print("  No row for today → appending new row...")
        row = [
            today_str,
            balances["BTC"],
            btc_price,
            balances["ETH"],
            eth_price,
            balances["USDT"],
            balances["USDC"],
            0,   # Inflow WODL — fill manually
            0,   # Inflow Other — fill manually
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        print("✅ New row appended.")

if __name__ == "__main__":
    main()
