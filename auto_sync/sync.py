"""
Quantum Terminal - Balance Sync
Runs 3x daily: 6 AM, 2:30 PM, 9 PM Nepal time.
Writes BTC coins, ETH coins, USDT, USDC (+ price snapshot at that moment) as a new row.
"""

import os, hmac, hashlib, time, json, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta
import gspread
from google.oauth2.service_account import Credentials

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

def get_sheet(tab_name):
    creds = Credentials.from_service_account_info(
        json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]),
        scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    return gspread.authorize(creds).open_by_key(
        os.environ["GOOGLE_SHEET_ID"]
    ).worksheet(tab_name)

def main():
    nepal_tz  = timezone(timedelta(hours=5, minutes=45))
    now_nepal = datetime.now(nepal_tz)
    today_str = now_nepal.strftime("%Y-%m-%d")
    time_str  = now_nepal.strftime("%H:%M")

    print(f"[{today_str} {time_str} NPT] Fetching balances...")
    balances  = get_balances()
    btc_price = get_price("BTCUSDT")
    eth_price = get_price("ETHUSDT")

    # Row: Date | BTC Bal | BTC Price | ETH Bal | ETH Price | USDT | USDC | Inflow(WODL) | Inflow(Other)
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

    print(f"  BTC: {balances['BTC']} @ ${btc_price:,.2f}")
    print(f"  ETH: {balances['ETH']} @ ${eth_price:,.2f}")
    print(f"  USDT: ${balances['USDT']}  USDC: ${balances['USDC']}")

    sheet = get_sheet(os.environ.get("SHEET_TAB", "Sheet1"))
    sheet.append_row(row, value_input_option="USER_ENTERED")
    print("✅ Balance row written.")

if __name__ == "__main__":
    main()
