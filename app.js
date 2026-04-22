const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ4keJuJi6W2iD_uSE1tRXRWPyJXQ5oe7KOHys1pI5sHBMjjk2HRzCIK9xsK1kgR7fIZqDejXRotfjd/pub?output=csv";

let perfChartInstance = null;
let priceChartInstance = null;
let holdingsChartInstance = null;
let allocChartInstance = null;


let trueLedgerData = [];
let WebhookUrl = localStorage.getItem('quantum_webhook') || 'https://script.google.com/macros/s/AKfycbxs3lwwOiuv4usHKg7cEwqnTXjumgkVsY7eFKpgcv653OboaV8ABLUn3k-4qpCas1J6YQ/exec';

const fCur = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fPct = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fNum = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 });

function parseNum(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const cleanStr = str.replace(/[$,%]/g, '').trim();
    if (cleanStr === '' || isNaN(cleanStr) || cleanStr === '#NUM!') return 0;
    return parseFloat(cleanStr);
}

function getVal(row, searchStr) {
    const key = Object.keys(row).find(k => k.trim() === searchStr);
    return key ? parseNum(row[key]) : 0;
}

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupModals();
    setupViews();
    // fetchLivePrices setInterval removed as requested to only use sheet data
});



async function initApp() {
    try {
        // Appending a timestamp forces Google's cache to bust slightly faster
        const response = await fetch(CSV_URL + '&t=' + new Date().getTime());
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processAndRender(results.data);
                document.getElementById('last-updated').textContent = `Live Sync Complete`;
                document.querySelector('.status-dot').classList.remove('pulsing');
            }
        });
    } catch (error) {
        document.getElementById('last-updated').textContent = "Sync Failed!";
        document.getElementById('last-updated').style.color = "var(--negative)";
        document.querySelector('.status-dot').style.backgroundColor = "var(--negative)";
    }
}

function setupModals() {
    const btnEntry = document.getElementById('btn-new-entry');
    const btnSettings = document.getElementById('btn-settings');
    const backdrop = document.getElementById('modal-backdrop');
    const entryModal = document.getElementById('entry-modal');
    const settingsModal = document.getElementById('settings-modal');
    
    // Open Entry
    btnEntry.addEventListener('click', () => {
        backdrop.classList.add('active');
        entryModal.classList.add('active');
        prefillForm();
    });

    // Open Settings
    btnSettings.addEventListener('click', () => {
        document.getElementById('input-webhook').value = WebhookUrl;
        backdrop.classList.add('active');
        settingsModal.classList.add('active');
        settingsModal.style.right = '0'; // Center trick in CSS
    });

    // Close Modals
    const closeAll = () => {
        backdrop.classList.remove('active');
        entryModal.classList.remove('active');
        settingsModal.classList.remove('active');
    };
    
    document.getElementById('close-entry').addEventListener('click', closeAll);
    document.getElementById('close-settings').addEventListener('click', closeAll);
    backdrop.addEventListener('click', closeAll);

    // Save Settings
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const url = document.getElementById('input-webhook').value.trim();
        if (url) {
            localStorage.setItem('quantum_webhook', url);
            WebhookUrl = url;
            alert("Settings Saved!");
            closeAll();
        }
    });

    // Submit Entry
    document.getElementById('entry-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!WebhookUrl) {
            alert("Please configure your Webhook URL in Settings first!");
            return;
        }

        const payload = {
            date: document.getElementById('input-date').value,
            btcBal: document.getElementById('input-btc-bal').value,
            btcPrice: document.getElementById('input-btc-price').value,
            ethBal: document.getElementById('input-eth-bal').value,
            ethPrice: document.getElementById('input-eth-price').value,
            usdtBal: document.getElementById('input-usdt-bal').value,
            usdcBal: document.getElementById('input-usdc-bal').value,
            inflowWodl: document.getElementById('input-inflow-wodl').value,
            inflowOther: document.getElementById('input-inflow-other').value
        };

        const btn = document.getElementById('btn-submit-entry');
        btn.textContent = "Committing...";
        btn.classList.add('sync-loading');

        try {
            const res = await fetch(WebhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            // no-cors implies we cannot inherently read JSON response safely, but if execution throws no network error, we assume success
            
            // Force a resync sequence safely
            setTimeout(() => {
                btn.textContent = "Commit Transaction";
                btn.classList.remove('sync-loading');
                closeAll();
                document.getElementById('last-updated').textContent = "Pulling Cloud Sync...";
                document.querySelector('.status-dot').classList.add('pulsing');
                initApp(); // Re-fetch updated CSV
            }, 3000);
            
        } catch(err) {
            alert("Network Error committing payload: " + err);
            btn.textContent = "Commit Transaction";
            btn.classList.remove('sync-loading');
        }
    });
}

function setupViews() {
    const viewBtns = document.querySelectorAll('.view-btn');
    const mobileTabBtns = document.querySelectorAll('.tab-btn'); // For mobile compat
    const views = document.querySelectorAll('main');
    
    const switchView = (viewId) => {
        views.forEach(v => v.classList.remove('active-view'));
        viewBtns.forEach(b => b.classList.remove('active'));
        
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.add('active-view');
        
        const targetBtn = document.querySelector(`.view-btn[data-view="${viewId}"]`);
        if (targetBtn) targetBtn.classList.add('active');
    };

    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });

    // Mobile fallback if user clicks bottom tabs
    mobileTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            if (tab === 'analysis') switchView('intelligence');
            else switchView('terminal');
        });
    });
}


let livePrices = { btc: 0, eth: 0, btcChange: 0, ethChange: 0 };

async function fetchLivePrices() {
    try {
        const [btcRes, ethRes] = await Promise.all([
            fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'),
            fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT')
        ]);
        const btcData = await btcRes.json();
        const ethData = await ethRes.json();
        
        livePrices = {
            btc: parseFloat(btcData.lastPrice),
            eth: parseFloat(ethData.lastPrice),
            btcChange: parseFloat(btcData.priceChangePercent),
            ethChange: parseFloat(ethData.priceChangePercent)
        };
        
        updateLiveTicker();
    } catch (err) {
        console.error("Live Price Fetch failed:", err);
    }
}

function updateLiveTicker() {
    if (!livePrices.btc) return;
    
    const btcPriceEl = document.getElementById('live-btc-price');
    const btcChangeEl = document.getElementById('live-btc-change');
    const ethPriceEl = document.getElementById('live-eth-price');
    const ethChangeEl = document.getElementById('live-eth-change');
    
    if (btcPriceEl) btcPriceEl.textContent = fCur.format(livePrices.btc);
    if (btcChangeEl) {
        btcChangeEl.textContent = `${livePrices.btcChange > 0 ? '+' : ''}${livePrices.btcChange.toFixed(2)}%`;
        btcChangeEl.className = `ticker-change ${livePrices.btcChange >= 0 ? 'trend-up' : 'trend-down'}`;
    }
    
    if (ethPriceEl) ethPriceEl.textContent = fCur.format(livePrices.eth);
    if (ethChangeEl) {
        ethChangeEl.textContent = `${livePrices.ethChange > 0 ? '+' : ''}${livePrices.ethChange.toFixed(2)}%`;
        ethChangeEl.className = `ticker-change ${livePrices.ethChange >= 0 ? 'trend-up' : 'trend-down'}`;
    }
    
    calculateImpact();
}

function calculateImpact() {
    if (trueLedgerData.length === 0 || !livePrices.btc) return;
    
    const latest = trueLedgerData[trueLedgerData.length - 1];
    
    // Impact = (Current Price - Last Recorded Price) * Balance
    const btcImpact = (livePrices.btc - latest.btcPrice) * latest.btcBal;
    const ethImpact = (livePrices.eth - latest.ethPrice) * latest.ethBal;
    const totalImpact = btcImpact + ethImpact;
    
    const impactEl = document.getElementById('portfolio-impact');
    if (impactEl) {
        impactEl.textContent = `${totalImpact >= 0 ? '+' : ''}${fCur.format(totalImpact)}`;
        impactEl.style.color = totalImpact >= 0 ? 'var(--positive)' : 'var(--negative)';
    }
}


function prefillForm() {
    if(trueLedgerData.length === 0) return;
    
    // Use the absolute latest known row
    const latest = trueLedgerData[trueLedgerData.length - 1];

    // Predict tomorrow's Date
    const nextDateObj = new Date(latest.dateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    
    // Format YYYY-MM-DD
    document.getElementById('input-date').value = nextDateObj.toISOString().split('T')[0];

    // Fill last known balances & prices exactly as an app would
    document.getElementById('input-btc-bal').value = latest.btcBal;
    document.getElementById('input-btc-price').value = latest.btcPrice;
    document.getElementById('input-eth-bal').value = latest.ethBal;
    document.getElementById('input-eth-price').value = latest.ethPrice;
    document.getElementById('input-usdt-bal').value = latest.usdtBal;
    document.getElementById('input-usdc-bal').value = latest.usdcBal;
    
    // Inflows are logically 0 on a new day to prevent accidental double-adding
    document.getElementById('input-inflow-wodl').value = 0;
    document.getElementById('input-inflow-other').value = 0;
}

// ==========================================
// Analysis Engine Below 
// ==========================================

function compute7DayMA(values) {
    const ma = [];
    for (let i = 0; i < values.length; i++) {
        if (i < 6) { ma.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < 7; j++) sum += values[i - j];
        ma.push(sum / 7);
    }
    return ma;
}

function processAndRender(rawData) {
    if (!rawData || rawData.length === 0) return;

    trueLedgerData = rawData.map(row => {
        const inWodl = getVal(row, 'Inflow (WODL)');
        const inOther = getVal(row, 'Inflow (Other)');
        
        return {
            dateStr: row['Date'] || Object.values(row)[0],
            dateObj: new Date(row['Date'] || Object.values(row)[0]),
            btcBal: getVal(row, 'BTC Balance'),
            btcPrice: getVal(row, 'BTC Price (USD)'),
            ethBal: getVal(row, 'ETH Balance'),
            ethPrice: getVal(row, 'ETH Price (USD)'),
            usdtBal: getVal(row, 'USDT Balance'),
            usdcBal: getVal(row, 'USDC Balance'),
            inflow: inWodl + inOther,
            outflow: 0,
            totalValue: getVal(row, 'Total Portfolio Value (USD)'),
            dailyGainPct: getVal(row, 'Daily Gain/Loss (%)')
        };
    }).filter(d => !isNaN(d.dateObj.getTime())).sort((a, b) => a.dateObj - b.dateObj);

    if (trueLedgerData.length === 0) return;

    const day1 = trueLedgerData[0];
    const latest = trueLedgerData[trueLedgerData.length - 1];

    let totalInflows = 0;
    let totalOutflows = 0;
    let grossInflowsForAvg = 0;

    let timeSeriesDates = [];
    let timeSeriesValues = [];
    let timeSeriesCostBasis = [];
    let timeSeriesBtcSimValues = [];
    let allTimeHigh = 0;

    let currentCostBasis = day1.totalValue;
    let cumulativeSimulatedBTC = (day1.totalValue / day1.btcPrice);

    const OneDayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < trueLedgerData.length; i++) {
        const d = trueLedgerData[i];
        
        grossInflowsForAvg += d.inflow;

        if (i > 0) {
            totalInflows += d.inflow;
            totalOutflows += d.outflow;
            currentCostBasis = currentCostBasis + d.inflow - d.outflow;
            cumulativeSimulatedBTC += (d.inflow / d.btcPrice);
            cumulativeSimulatedBTC -= (d.outflow / d.btcPrice);
        }

        if (d.totalValue > allTimeHigh) allTimeHigh = d.totalValue;

        timeSeriesDates.push(d.dateStr);
        timeSeriesValues.push(d.totalValue);
        timeSeriesCostBasis.push(currentCostBasis);
        timeSeriesBtcSimValues.push(cumulativeSimulatedBTC * d.btcPrice);

        if (i < trueLedgerData.length - 1) {
            let nextD = trueLedgerData[i+1];
            let diffDays = Math.round((nextD.dateObj - d.dateObj) / OneDayMs);
            
            for(let fill = 1; fill < diffDays; fill++) {
                let fillDate = new Date(d.dateObj.getTime() + (fill * OneDayMs));
                let fStr = fillDate.toISOString().split('T')[0]; 
                
                timeSeriesDates.push(fStr);
                timeSeriesValues.push(d.totalValue); 
                timeSeriesCostBasis.push(currentCostBasis); 
                timeSeriesBtcSimValues.push(cumulativeSimulatedBTC * d.btcPrice); 
            }
        }
    }

    let timeSeries7DayMA = compute7DayMA(timeSeriesValues);

    const msPerDay = 1000 * 60 * 60 * 24;
    // Add 1 to represent the inclusive number of calendar dates tracked
    const daysElapsed = Math.max(1, ((latest.dateObj - day1.dateObj) / msPerDay) + 1);
    const avgDailyInflow = grossInflowsForAvg / daysElapsed;

    const currentDrawdownPct = allTimeHigh > 0 ? (latest.totalValue - allTimeHigh) / allTimeHigh : 0;
    const cashValue = latest.usdtBal + latest.usdcBal;
    const stableRatio = latest.totalValue > 0 ? (cashValue / latest.totalValue) : 0;

    const finalAdjustedInvested = day1.totalValue + totalInflows - totalOutflows;
    const overallGainAmount = latest.totalValue - finalAdjustedInvested;
    const overallGainPct = finalAdjustedInvested > 0 ? (overallGainAmount / finalAdjustedInvested) : 0;
    const cagr = Math.pow(latest.totalValue / finalAdjustedInvested, 365 / daysElapsed) - 1;

    // --- RENDER KPIs ---
    document.getElementById('kpi-current-value').textContent = fCur.format(latest.totalValue);
    document.getElementById('kpi-invested-value').textContent = fCur.format(finalAdjustedInvested);
    document.getElementById('kpi-avg-inflows').textContent = `Avg Inflow: ${fCur.format(avgDailyInflow)} /day`;
    
    document.getElementById('kpi-total-gain').textContent = `${overallGainAmount >= 0 ? '+' : ''}${fCur.format(overallGainAmount)}`;
    const tpEl = document.getElementById('kpi-total-percent');
    tpEl.textContent = `${overallGainPct >= 0 ? '+' : ''}${fPct.format(overallGainPct)}`;
    tpEl.className = 'kpi-trend badge-solid ' + (overallGainPct >= 0 ? 'trend-up' : 'trend-down');

    document.getElementById('kpi-cagr').textContent = `${cagr >= 0 ? '+' : ''}${fPct.format(cagr)}`;
    document.getElementById('kpi-days-elapsed').textContent = `Over ${Math.round(daysElapsed)} elapsed days`;
    
    document.getElementById('kpi-drawdown').textContent = `${fPct.format(currentDrawdownPct)}`;
    document.getElementById('kpi-ath-value').textContent = `ATH: ${fCur.format(allTimeHigh)}`;
    if (currentDrawdownPct <= -0.10) { document.getElementById('kpi-drawdown').parentElement.style.borderColor = 'rgba(239, 68, 68, 0.4)'; }
    document.getElementById('kpi-cash-ratio').textContent = `${fPct.format(stableRatio)}`;

    // --- APR TARGETING ---
    // User wants 40% APR from APRs (Inflow WODL)
    const annualYield = (grossInflowsForAvg / daysElapsed) * 365;
    const aprBasis = finalAdjustedInvested > 0 ? (annualYield / finalAdjustedInvested) : 0;
    const aprProgress = Math.min(100, (aprBasis / 0.40) * 100);
    
    const progressFill = document.getElementById('apr-progress-bar');
    const progressText = document.getElementById('apr-target-text');
    if (progressFill) progressFill.style.width = `${aprProgress}%`;
    if (progressText) progressText.textContent = `${fPct.format(aprBasis)} / 40%`;

    // --- CHARTS & LEDGER ---

    renderPerformanceChart(timeSeriesDates, timeSeriesValues, timeSeriesCostBasis, timeSeriesBtcSimValues, timeSeries7DayMA);

    renderAllocationChart([
        { label: 'BTC', value: (latest.btcBal * latest.btcPrice), color: '#f7931a', tColor: 'var(--btc-color)' },
        { label: 'ETH', value: (latest.ethBal * latest.ethPrice), color: '#627eea', tColor: 'var(--eth-color)' },
        { label: 'USDT', value: latest.usdtBal, color: '#26a17b', tColor: 'var(--usdt-color)' },
        { label: 'USDC', value: latest.usdcBal, color: '#2775ca', tColor: 'var(--usdc-color)' }
    ]);

    renderLedgerTable(trueLedgerData); 
    
    // --- SMART ANALYSIS & PROJECTIONS ---
    calculateSmartAnalysis(trueLedgerData, latest, finalAdjustedInvested, daysElapsed, avgDailyInflow);
    renderPriceHistoryChart(trueLedgerData);
    renderHoldingsChart(trueLedgerData);
}

function calculateSmartAnalysis(data, latest, basis, daysElapsed, avgInflow) {
    if (data.length < 2) return;

    const day1 = data[0];
    const portfolioPerf = (latest.totalValue - basis) / basis;

    // 1. Market Benchmark Calculation (BTC & ETH weighted 50/50 or based on initial ratio)
    // To be fair, we use the average performance of the two primary assets from Day 1
    const btcPerf = (latest.btcPrice - day1.btcPrice) / day1.btcPrice;
    const ethPerf = (latest.ethPrice - day1.ethPrice) / day1.ethPrice;
    const marketPerf = (btcPerf + ethPerf) / 2; // Simple 50/50 index
    const alpha = portfolioPerf - marketPerf;

    // Update Alpha UI
    const marketPerfEl = document.getElementById('intel-market-perf');
    const alphaValEl = document.getElementById('intel-alpha-value');
    const alphaLabelEl = document.getElementById('intel-alpha-label');
    const alphaNoteEl = document.getElementById('intel-alpha-note');

    if (marketPerfEl) marketPerfEl.textContent = (marketPerf >= 0 ? '+' : '') + fPct.format(marketPerf);
    if (alphaValEl) {
        alphaValEl.textContent = (alpha >= 0 ? '+' : '') + fPct.format(alpha);
        alphaValEl.className = 'value ' + (alpha >= 0 ? 'highlight-positive' : 'highlight-negative');
    }
    if (alphaLabelEl) alphaLabelEl.textContent = alpha >= 0 ? 'Alpha' : 'Beta Lag';
    if (alphaNoteEl) {
        if (alpha >= 0) {
            alphaNoteEl.textContent = marketPerf < 0 ? 'Yield Cushioning (Defensive)' : 'Outperforming Market Index';
            alphaNoteEl.style.color = 'var(--positive)';
        } else {
            alphaNoteEl.textContent = 'Underperforming Market Index';
            alphaNoteEl.style.color = 'var(--negative)';
        }
    }

    // 2. Logic Smoothing & Confidence
    const confidenceScore = Math.min(1, data.length / 30); 
    document.getElementById('ml-confidence-fill').style.width = (confidenceScore * 100) + '%';
    document.getElementById('intel-avg-inflow').textContent = fCur.format(avgInflow) + ' /day';

    // 2. Smart CAGR via Mean Logarithmic Return
    let logReturns = [];
    for (let i = 1; i < data.length; i++) {
        const prev = data[i-1];
        const curr = data[i];
        const return_val = curr.totalValue / (prev.totalValue + curr.inflow);
        if (return_val > 0) logReturns.push(Math.log(return_val));
    }

    const meanLogReturn = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    let smartCAGR = Math.exp(meanLogReturn * 365) - 1;
    
    // Stability Factor
    const variance = logReturns.reduce((a, b) => a + Math.pow(b - meanLogReturn, 2), 0) / logReturns.length;
    const stdDev = Math.sqrt(variance);
    const stabilityFactor = Math.max(0, Math.min(1, 1 - (stdDev * 10)));

    document.getElementById('ml-stability').textContent = (stabilityFactor * 100).toFixed(1) + '%';
    document.getElementById('ml-expected-cagr').textContent = (smartCAGR >= 0 ? '+' : '') + fPct.format(smartCAGR);

    // 3. Scenario Logic
    // Worst: 0% market growth
    // Moderate: Scaled performance (cap high outliers for small datasets)
    // Best: Current Smart CAGR momentum
    const r_worst = 0;
    const r_mod = (data.length < 14) ? Math.min(smartCAGR, 0.20) : smartCAGR; 
    const r_best = smartCAGR;

    // 4. Milestone Scenarios Rendering
    const targets = [1000, 10000, 20000, 50000, 100000];
    const tbody = document.getElementById('milestone-scenarios');
    tbody.innerHTML = '';

    const calculateDays = (target, r_ann, pmt, pv) => {
        if (target <= pv) return 0;
        const r_d = r_ann / 365; // Linear approx for simplicity in scenarios
        const dailyGrowth = (pv * r_d) + pmt;
        if (dailyGrowth <= 0) return Infinity;
        // Solving FV for n: n = (target - pv) / avgGrowth (conservative linear)
        // or using continuous: n = ln((FV*r+P)/(PV*r+P))/r
        if (r_d === 0) return (target - pv) / pmt;
        
        const num = (target * r_d) + pmt;
        const den = (pv * r_d) + pmt;
        if (num <= 0 || den <= 0) return (target - pv) / dailyGrowth;
        return Math.log(num / den) / r_d;
    };

    const formatDate = (days) => {
        if (!isFinite(days) || days > 365 * 50) return '---';
        const d = new Date();
        d.setDate(d.getDate() + Math.ceil(days));
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    };

    targets.forEach(target => {
        if (target <= latest.totalValue) return;

        const dWorst = calculateDays(target, r_worst, avgInflow, latest.totalValue);
        const dMod = calculateDays(target, r_mod, avgInflow, latest.totalValue);
        const dBest = calculateDays(target, r_best, avgInflow, latest.totalValue);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fCur.format(target)}</td>
            <td class="col-worst">${formatDate(dWorst)}</td>
            <td class="col-mod">${formatDate(dMod)}</td>
            <td class="col-best">${formatDate(dBest)}</td>
        `;
        tbody.appendChild(row);
    });

    // 5. APR Breakdown
    const annualYield = (avgInflow * 365);
    const currAPR = basis > 0 ? (annualYield / basis) : 0;
    const aprGap = 0.40 - currAPR;

    document.getElementById('intel-curr-apr').textContent = fPct.format(currAPR);
    const gapEl = document.getElementById('intel-apr-gap');
    gapEl.textContent = (aprGap > 0 ? fPct.format(aprGap) : 'GOAL REACHED');
    gapEl.style.color = aprGap > 0 ? 'var(--negative)' : 'var(--positive)';
}


function renderHoldingsChart(data) {
    const ctx = document.getElementById('holdingsChart').getContext('2d');
    if (holdingsChartInstance) holdingsChartInstance.destroy();

    const labels = data.map(d => d.dateStr);
    const btcHoldings = data.map(d => d.btcBal);
    const ethHoldings = data.map(d => d.ethBal);

    holdingsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'BTC Stack', data: btcHoldings, borderColor: '#f7931a', backgroundColor: 'rgba(247, 147, 26, 0.1)', borderWidth: 2, fill: true, tension: 0.1, yAxisID: 'y' },
                { label: 'ETH Stack', data: ethHoldings, borderColor: '#627eea', backgroundColor: 'rgba(98, 126, 234, 0.1)', borderWidth: 2, fill: true, tension: 0.1, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: {
                x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'BTC Qty', font: { size: 10 } } },
                y1: { type: 'linear', display: true, position: 'right', grid: { display: false }, title: { display: true, text: 'ETH Qty', font: { size: 10 } } }
            }
        }
    });
}

function renderPriceHistoryChart(data) {

    const ctx = document.getElementById('priceHistoryChart').getContext('2d');
    if (priceChartInstance) priceChartInstance.destroy();

    const labels = data.map(d => d.dateStr);
    const btcHistory = data.map(d => d.btcPrice);
    const ethHistory = data.map(d => d.ethPrice);

    priceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'BTC Price', data: btcHistory, borderColor: '#f7931a', borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'y' },
                { label: 'ETH Price', data: ethHistory, borderColor: '#627eea', borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, title: { display: true, text: 'BTC ($)', font: { size: 10 } } },
                y1: { type: 'linear', display: true, position: 'right', grid: { display: false }, title: { display: true, text: 'ETH ($)', font: { size: 10 } } }
            }
        }
    });
}


function renderPerformanceChart(labels, values, costBasis, btcSim, ma7Data) {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    if (perfChartInstance) perfChartInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.01)');

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    perfChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: [
                { label: 'Portfolio Value', data: values, borderColor: '#3b82f6', backgroundColor: gradient, borderWidth: 2, pointRadius: 0, pointHoverRadius: 6, fill: true, tension: 0.2 },
                { label: '7D Trend', data: ma7Data, borderColor: '#10b981', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4 },
                { label: 'BTC Benchmark', data: btcSim, borderColor: '#f7931a', borderWidth: 1, borderDash: [5, 5], pointRadius: 0, fill: false },
                { label: 'Adjusted Basis', data: costBasis, borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, pointRadius: 0, fill: false, stepped: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', padding: 8 } },
            scales: {
                x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { maxTicksLimit: 7 } },
                y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { callback: function(value) { return '$' + value; } } }
            }
        }
    });
}

function renderAllocationChart(assets) {
    const ctx = document.getElementById('allocationChart').getContext('2d');
    if (allocChartInstance) allocChartInstance.destroy();

    const activeAssets = assets.filter(a => a.value > 0).sort((a, b) => b.value - a.value);
    const totalVal = activeAssets.reduce((sum, a) => sum + a.value, 0);

    allocChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: activeAssets.map(a => a.label), datasets: [{ data: activeAssets.map(a => a.value), backgroundColor: activeAssets.map(a => a.color), borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });

    const legendContainer = document.getElementById('allocation-legend');
    legendContainer.innerHTML = '';
    activeAssets.forEach(a => {
        const pct = (a.value / totalVal) * 100;
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <div class="legend-asset"><div class="legend-color" style="background-color: ${a.color}"></div><span>${a.label}</span></div>
            <div><span style="color: var(--text-primary);">${fCur.format(a.value)}</span><span style="color: var(--text-muted); font-size: 0.8rem; margin-left:4px;">${pct.toFixed(0)}%</span></div>
        `;
        legendContainer.appendChild(item);
    });
}

function renderLedgerTable(dataList) {
    const tbody = document.getElementById('ledger-body');
    tbody.innerHTML = '';
    const reversed = [...dataList].reverse();
    reversed.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.dateStr}</td>
            <td style="color: var(--text-primary); font-weight: 500;">${fCur.format(row.totalValue)}</td>
            <td class="${row.dailyGainPct > 0 ? 'cell-positive' : (row.dailyGainPct < 0 ? 'cell-negative' : 'cell-zero')}">${row.dailyGainPct > 0 ? '+' : ''}${row.dailyGainPct}%</td>
            <td class="${row.inflow > 0 ? 'cell-positive' : 'cell-zero'}">${row.inflow > 0 ? '+' + fCur.format(row.inflow) : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}
