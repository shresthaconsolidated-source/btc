const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ4keJuJi6W2iD_uSE1tRXRWPyJXQ5oe7KOHys1pI5sHBMjjk2HRzCIK9xsK1kgR7fIZqDejXRotfjd/pub?output=csv";

let perfChartInstance = null;
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
    const daysElapsed = Math.max(1, (latest.dateObj - day1.dateObj) / msPerDay);
    const avgDailyInflow = totalInflows / daysElapsed;

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

    // --- CHARTS & LEDGER ---
    renderPerformanceChart(timeSeriesDates, timeSeriesValues, timeSeriesCostBasis, timeSeriesBtcSimValues, timeSeries7DayMA);

    renderAllocationChart([
        { label: 'BTC', value: (latest.btcBal * latest.btcPrice), color: '#f7931a', tColor: 'var(--btc-color)' },
        { label: 'ETH', value: (latest.ethBal * latest.ethPrice), color: '#627eea', tColor: 'var(--eth-color)' },
        { label: 'USDT', value: latest.usdtBal, color: '#26a17b', tColor: 'var(--usdt-color)' },
        { label: 'USDC', value: latest.usdcBal, color: '#2775ca', tColor: 'var(--usdc-color)' }
    ]);

    renderLedgerTable(trueLedgerData); 
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
