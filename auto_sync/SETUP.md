# 🤖 Binance Auto-Sync Setup Guide

Every day at **9:00 PM Nepal time**, GitHub Actions will automatically pull your balances from Binance and append a row to your Google Sheet.

---

## Step 1 — Binance API Key (Read-Only)

1. Log in to Binance → Profile → **API Management**
2. Click **Create API** → choose **System Generated**
3. Give it a label: `quantum-tracker`
4. Under permissions, enable **only** ✅ `Read Info` — nothing else
5. Copy the **API Key** and **Secret Key**

> ⚠️ Never enable Spot Trading or Withdrawal permissions on this key.

---

## Step 2 — Google Sheets Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts → Create Service Account**
5. Name it `quantum-sync`, click Done
6. Click the service account → **Keys tab → Add Key → JSON** → download the file
7. Open your Google Sheet → **Share** → paste the service account email (looks like `quantum-sync@your-project.iam.gserviceaccount.com`) → give it **Editor** access

---

## Step 3 — Add GitHub Secrets

Go to your repo on GitHub → **Settings → Secrets and variables → Actions → New repository secret**

Add these 5 secrets:

| Secret Name | Value |
|-------------|-------|
| `BINANCE_API_KEY` | Your Binance API Key |
| `BINANCE_API_SECRET` | Your Binance Secret Key |
| `GOOGLE_SHEET_ID` | The ID from your sheet URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the full contents of the JSON file you downloaded |
| `SHEET_TAB` | The tab name in your sheet (e.g. `Sheet1` or `Data`) |

---

## Step 4 — Push & Test

```bash
git add auto_sync/ .github/
git commit -m "feat: Add daily Binance auto-sync via GitHub Actions"
git push
```

Then go to GitHub → **Actions → Daily Binance Auto-Sync → Run workflow** to test it manually first.

---

## What Gets Written Each Day

| Column | Value |
|--------|-------|
| Date | Today (Nepal time) |
| BTC Bal | Your BTC holdings (coins) |
| BTC Price | Live price in USD |
| ETH Bal | Your ETH holdings (coins) |
| ETH Price | Live price in USD |
| USDT | Your USDT balance ($) |
| USDC | Your USDC balance ($) |
| Inflow (WODL) | `0` — you fill this manually |
| Inflow (Other) | `0` — you fill this manually |
