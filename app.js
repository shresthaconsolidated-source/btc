const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ4keJuJi6W2iD_uSE1tRXRWPyJXQ5oe7KOHys1pI5sHBMjjk2HRzCIK9xsK1kgR7fIZqDejXRotfjd/pub?output=csv";
const HONEY_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ4keJuJi6W2iD_uSE1tRXRWPyJXQ5oe7KOHys1pI5sHBMjjk2HRzCIK9xsK1kgR7fIZqDejXRotfjd/pub?gid=309138621&single=true&output=csv";

let perfChartInstance = null;
let priceChartInstance = null;
let holdingsChartInstance = null;
let allocChartInstance = null;
let cagrChartInstance = null;
let honeyChartInstance = null;


let trueLedgerData = [];
let trueHoneyData = [];
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
    simulateAIThinking();
    try {
        // Appending a timestamp forces Google's cache to bust slightly faster
        const ts = new Date().getTime();
        
        const [mainRes, honeyRes] = await Promise.all([
            fetch(CSV_URL + '&t=' + ts),
            fetch(HONEY_CSV_URL + '&t=' + ts)
        ]);
        
        const mainText = await mainRes.text();
        const honeyText = await honeyRes.text();
        
        Papa.parse(honeyText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processAndRenderHoney(results.data);
            }
        });

        Papa.parse(mainText, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                processAndRender(results.data);
                document.getElementById('last-updated').textContent = `Live Sync Complete`;
                document.querySelector('.status-dot').classList.remove('pulsing');
                setTimeout(stopAIThinking, 800);
            }
        });
    } catch (error) {
        document.getElementById('last-updated').textContent = "Sync Failed!";
        document.getElementById('last-updated').style.color = "var(--negative)";
        document.querySelector('.status-dot').style.backgroundColor = "var(--negative)";
        stopAIThinking();
    }
}

function simulateAIThinking() {
    const overlay = document.getElementById('ai-thinking-overlay');
    const textEl = document.getElementById('ai-thinking-text');
    if (!overlay || !textEl) return;
    
    overlay.classList.add('active');
    
    const phrases = [
        "Initializing Quantum Engine...",
        "Fetching On-Chain Metrics...",
        "Reconciling Cost Basis...",
        "Running Monte Carlo Sims...",
        "Isolating True Yield..."
    ];
    
    let i = 0;
    textEl.textContent = phrases[0];
    const interval = setInterval(() => {
        i++;
        if (i < phrases.length) {
            textEl.textContent = phrases[i];
        }
    }, 600);
    
    overlay.dataset.interval = interval;
}

function stopAIThinking() {
    const overlay = document.getElementById('ai-thinking-overlay');
    if (!overlay) return;
    clearInterval(parseInt(overlay.dataset.interval));
    overlay.classList.remove('active');
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

    const cagrModal = document.getElementById('cagr-chart-modal');

    // Close Modals
    const closeAll = () => {
        backdrop.classList.remove('active');
        entryModal.classList.remove('active');
        settingsModal.classList.remove('active');
        if (cagrModal) cagrModal.classList.remove('active');
    };
    
    document.getElementById('close-entry').addEventListener('click', closeAll);
    document.getElementById('close-settings').addEventListener('click', closeAll);
    const closeCagrChart = document.getElementById('close-cagr-chart');
    if(closeCagrChart) closeCagrChart.addEventListener('click', closeAll);
    backdrop.addEventListener('click', closeAll);

    // CAGR Chart Triggers
    document.getElementById('btn-cagr-apr').addEventListener('click', () => {
        document.getElementById('cagr-chart-title').textContent = "Historical CAGR (APR Only)";
        backdrop.classList.add('active');
        cagrModal.classList.add('active');
        renderCagrChart('apr');
    });

    document.getElementById('btn-cagr-capgains').addEventListener('click', () => {
        document.getElementById('cagr-chart-title').textContent = "Historical CAGR (Cap. Gains)";
        backdrop.classList.add('active');
        cagrModal.classList.add('active');
        renderCagrChart('capgains');
    });

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

    // Submit Entry Handler
    const submitEntry = async (actionType, btnElement) => {
        if (!WebhookUrl) {
            alert("Please configure your Webhook URL in Settings first!");
            return;
        }

        const payload = {
            action: actionType,
            data: {
                date: document.getElementById('input-date').value,
                btcBal: document.getElementById('input-btc-bal').value,
                btcPrice: document.getElementById('input-btc-price').value,
                ethBal: document.getElementById('input-eth-bal').value,
                ethPrice: document.getElementById('input-eth-price').value,
                usdtBal: document.getElementById('input-usdt-bal').value,
                usdcBal: document.getElementById('input-usdc-bal').value,
                inflowWodl: document.getElementById('input-inflow-wodl').value,
                inflowOther: document.getElementById('input-inflow-other').value
            }
        };

        const originalText = btnElement.textContent;
        btnElement.textContent = "Committing...";
        btnElement.classList.add('sync-loading');

        try {
            const res = await fetch(WebhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            
            setTimeout(() => {
                btnElement.textContent = originalText;
                btnElement.classList.remove('sync-loading');
                closeAll();
                document.getElementById('last-updated').textContent = "Pulling Cloud Sync...";
                document.querySelector('.status-dot').classList.add('pulsing');
                initApp(); // Re-fetch updated CSV
            }, 3000);
            
        } catch(err) {
            alert("Network Error committing payload: " + err);
            btnElement.textContent = originalText;
            btnElement.classList.remove('sync-loading');
        }
    };

    document.getElementById('btn-update-entry').addEventListener('click', (e) => {
        e.preventDefault();
        submitEntry('update', document.getElementById('btn-update-entry'));
    });

    document.getElementById('btn-submit-entry').addEventListener('click', (e) => {
        e.preventDefault();
        submitEntry('append', document.getElementById('btn-submit-entry'));
    });
}

function setupViews() {
    const viewBtns = document.querySelectorAll('.view-btn');
    const mobileTabBtns = document.querySelectorAll('.tab-btn'); // legacy bottom tabs
    const views = document.querySelectorAll('main');
    
    const switchView = (viewId) => {
        views.forEach(v => v.classList.remove('active-view'));
        // sync all view-btn elements (desktop nav + mobile toggle)
        viewBtns.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-view') === viewId);
        });
        mobileTabBtns.forEach(b => b.classList.remove('active'));
        
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.add('active-view');

        const targetMobileBtn = document.querySelector(`.tab-btn[data-tab="${viewId === 'intelligence' ? 'analysis' : 'terminal'}"]`);
        if (targetMobileBtn) targetMobileBtn.classList.add('active');
    };

    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });

    // Legacy bottom tab buttons
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

// AI Engine: Deduce Trades, Capital Gains, and Yield from daily snapshots
function runReconciliationEngine(data) {
    let metrics = { totalBtcYield: 0, totalEthYield: 0, totalUsdtYield: 0, btcCostBasis: 0, ethCostBasis: 0, realizedCapitalGains: 0 };
    if (data.length === 0) return metrics;

    metrics.btcCostBasis = data[0].btcBal * data[0].btcPrice; 
    metrics.ethCostBasis = data[0].ethBal * data[0].ethPrice;

    for (let i = 1; i < data.length; i++) {
        const prev = data[i-1], curr = data[i];
        let dBtc = curr.btcBal - prev.btcBal;
        let dEth = curr.ethBal - prev.ethBal;
        
        let dUsdtRaw = (curr.usdtBal + curr.usdcBal) - (prev.usdtBal + prev.usdcBal);
        
        let explicitCapitalInjected = 0;
        if (curr.totalInvestment !== undefined && prev.totalInvestment !== undefined) {
            explicitCapitalInjected = curr.totalInvestment - prev.totalInvestment;
        } else {
            explicitCapitalInjected = curr.inflowOther;
        }
        
        // cleanDUsdt represents change in stablecoins minus ANY explicit capital injected
        let cleanDUsdt = dUsdtRaw - explicitCapitalInjected; 
        let usdtSpentOnTrades = 0;

        // BTC Reconciliation
        if (dBtc > 0.00000001) {
            if (cleanDUsdt < -0.01) { // Up-Down (Buy)
                let expectedBtcBought = Math.abs(cleanDUsdt) / curr.btcPrice;
                if (dBtc > expectedBtcBought) {
                    metrics.totalBtcYield += (dBtc - expectedBtcBought);
                    metrics.btcCostBasis += Math.abs(cleanDUsdt);
                    usdtSpentOnTrades += Math.abs(cleanDUsdt);
                } else {
                    metrics.btcCostBasis += (dBtc * curr.btcPrice);
                    usdtSpentOnTrades += (dBtc * curr.btcPrice);
                }
            } else { // Up-Up (Pure Yield)
                metrics.totalBtcYield += dBtc;
            }
        } else if (dBtc < -0.00000001) { // Down-Up (Sell)
            let btcSold = Math.abs(dBtc);
            let avgPrice = prev.btcBal > 0 ? (metrics.btcCostBasis / prev.btcBal) : prev.btcPrice;
            let costOfSold = btcSold * avgPrice;
            metrics.btcCostBasis -= costOfSold;
            let proceeds = btcSold * curr.btcPrice; 
            metrics.realizedCapitalGains += (proceeds - costOfSold);
        }

        // ETH Reconciliation
        let remainingUsdtDrop = cleanDUsdt + usdtSpentOnTrades; // If some was used for BTC
        if (dEth > 0.00000001) {
            if (remainingUsdtDrop < -0.01) { 
                let expectedEthBought = Math.abs(remainingUsdtDrop) / curr.ethPrice;
                if (dEth > expectedEthBought) {
                    metrics.totalEthYield += (dEth - expectedEthBought);
                    metrics.ethCostBasis += Math.abs(remainingUsdtDrop);
                } else {
                    metrics.ethCostBasis += (dEth * curr.ethPrice);
                }
            } else { 
                metrics.totalEthYield += dEth;
            }
        } else if (dEth < -0.00000001) {
            let ethSold = Math.abs(dEth);
            let avgPrice = prev.ethBal > 0 ? (metrics.ethCostBasis / prev.ethBal) : prev.ethPrice;
            let costOfSold = ethSold * avgPrice;
            metrics.ethCostBasis -= costOfSold;
            metrics.realizedCapitalGains += ((ethSold * curr.ethPrice) - costOfSold);
        }

        // USDT Pure Yield Detection
        let expectedProceeds = 0;
        if (dBtc < -0.00000001) expectedProceeds += Math.abs(dBtc) * curr.btcPrice;
        if (dEth < -0.00000001) expectedProceeds += Math.abs(dEth) * curr.ethPrice;
        
        let unexplainedUsdtIncrease = cleanDUsdt - expectedProceeds;
        
        // If USDT went up more than the proceeds of any sold assets, the excess is yield.
        if (unexplainedUsdtIncrease > 0.001) {
            metrics.totalUsdtYield += unexplainedUsdtIncrease;
        }
        
        if (metrics.btcCostBasis < 0) metrics.btcCostBasis = 0;
        if (metrics.ethCostBasis < 0) metrics.ethCostBasis = 0;
    }
    return metrics;
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
            inflowOther: inOther,
            inflowWodl: inWodl,
            inflow: inOther, // WODL is yield, not principal. This ensures Capital Gain is 0 when prices are flat.
            totalInvestment: (function(r) {
                const possibleMatches = ['total invest', 'cumulative balance', 'cumulative invest', 'adjusted basis'];
                for (let actualKey of Object.keys(r)) {
                    const lowerKey = actualKey.toLowerCase();
                    for (let match of possibleMatches) {
                        if (lowerKey.includes(match) && r[actualKey] !== '') {
                            return getVal(r, actualKey);
                        }
                    }
                }
                return undefined;
            })(row),
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

    let currentCostBasis = (day1.totalInvestment !== undefined && day1.totalInvestment > 0) ? day1.totalInvestment : day1.totalValue;
    let cumulativeSimulatedBTC = (day1.totalValue / day1.btcPrice);

    const OneDayMs = 24 * 60 * 60 * 1000;

    for (let i = 0; i < trueLedgerData.length; i++) {
        const d = trueLedgerData[i];
        
        grossInflowsForAvg += (d.inflowWodl + d.inflowOther);

        if (i > 0) {
            totalInflows += d.inflow;
            totalOutflows += d.outflow;
            
            if (d.totalInvestment !== undefined && d.totalInvestment > 0) {
                currentCostBasis = d.totalInvestment;
            } else {
                currentCostBasis = currentCostBasis + d.inflow - d.outflow;
            }
            
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

    const finalAdjustedInvested = currentCostBasis; // Use the properly calculated basis from the loop
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
    const aiMetrics = runReconciliationEngine(trueLedgerData);
    
    // Update AI Reconciliation DOM
    const btcBasisAvg = latest.btcBal > 0 ? (aiMetrics.btcCostBasis / latest.btcBal) : 0;
    const ethBasisAvg = latest.ethBal > 0 ? (aiMetrics.ethCostBasis / latest.ethBal) : 0;
    
    // Calculate Pure APR Value (Total Value of yield in current prices)
    const pureAprValue = (aiMetrics.totalBtcYield * latest.btcPrice) + 
                         (aiMetrics.totalEthYield * latest.ethPrice) + 
                         aiMetrics.totalUsdtYield;
                         
    // Capital Gains = Total Return - Pure APR (This captures both Realized and Unrealized gains accurately)
    const totalCapitalGains = overallGainAmount - pureAprValue;

    const elPureApr = document.getElementById('ai-pure-apr-value');
    const elCapGains = document.getElementById('ai-cap-gains-value');
    const elBtcBasis = document.getElementById('ai-btc-basis');
    const elEthBasis = document.getElementById('ai-eth-basis');

    if (elPureApr) {
        let formattedApr = fCur.format(pureAprValue);
        // Show micro-yields if they exist but are less than 1 cent
        if (pureAprValue > 0 && pureAprValue < 0.01) formattedApr = '+$' + pureAprValue.toFixed(4);
        elPureApr.textContent = formattedApr;
    }
    
    if (elCapGains) {
        elCapGains.textContent = (totalCapitalGains >= 0 ? '+' : '') + fCur.format(totalCapitalGains);
        elCapGains.className = 'value ' + (totalCapitalGains >= 0 ? 'highlight-positive' : 'highlight-negative');
    }
    
    // Fallback display if calculation resulted in NaN or 0
    if (elBtcBasis) elBtcBasis.textContent = (btcBasisAvg > 0) ? fCur.format(btcBasisAvg) : (isNaN(btcBasisAvg) ? 'Err' : '$0.00');
    if (elEthBasis) elEthBasis.textContent = (ethBasisAvg > 0) ? fCur.format(ethBasisAvg) : (isNaN(ethBasisAvg) ? 'Err' : '$0.00');

    // --- CAGR from APR vs CAGR from Capital Gains ---
    // Formula: (1 + return_fraction)^(365 / daysElapsed) - 1
    // Time base = daysElapsed (number of days actually recorded in the sheet)
    const cagrAprEl = document.getElementById('ai-cagr-apr');
    const cagrCapGainsEl = document.getElementById('ai-cagr-capgains');

    if (finalAdjustedInvested > 0 && daysElapsed > 1) {
        const aprReturnFraction = pureAprValue / finalAdjustedInvested;
        const cagrAPR = Math.pow(1 + aprReturnFraction, 365 / daysElapsed) - 1;

        const cgReturnFraction = totalCapitalGains / finalAdjustedInvested;
        const cagrCapGains = Math.pow(1 + cgReturnFraction, 365 / daysElapsed) - 1;

        if (cagrAprEl) {
            cagrAprEl.textContent = `${cagrAPR >= 0 ? '+' : ''}${fPct.format(cagrAPR)}`;
            cagrAprEl.style.color = cagrAPR >= 0 ? 'var(--positive)' : 'var(--negative)';
        }
        if (cagrCapGainsEl) {
            cagrCapGainsEl.textContent = `${cagrCapGains >= 0 ? '+' : ''}${fPct.format(cagrCapGains)}`;
            cagrCapGainsEl.style.color = cagrCapGains >= 0 ? 'var(--positive)' : 'var(--negative)';
        }
    }

    // --- Populate secondary ticker bar ---
    const tickerVal = document.getElementById('ticker-portfolio-value');
    const tickerReturn = document.getElementById('ticker-overall-return');
    const tickerCagr = document.getElementById('ticker-cagr');
    if (tickerVal) tickerVal.textContent = fCur.format(latest.totalValue);
    if (tickerReturn) {
        tickerReturn.textContent = `${overallGainPct >= 0 ? '+' : ''}${(overallGainPct*100).toFixed(2)}%`;
        tickerReturn.style.color = overallGainPct >= 0 ? 'var(--positive)' : 'var(--negative)';
    }
    if (tickerCagr) {
        tickerCagr.textContent = `${cagr >= 0 ? '+' : ''}${(cagr*100).toFixed(2)}%`;
        tickerCagr.style.color = cagr >= 0 ? 'var(--positive)' : 'var(--negative)';
    }

    calculateDisciplineScore(trueLedgerData);
    calculateSmartAnalysis(trueLedgerData, latest, finalAdjustedInvested, daysElapsed, avgDailyInflow);
    calculateRiskMetrics(trueLedgerData, latest, aiMetrics, finalAdjustedInvested, overallGainAmount);
    renderPriceHistoryChart(trueLedgerData);
    renderHoldingsChart(trueLedgerData);
}

// ==========================================
// Risk & Performance Metrics Engine
// ==========================================
function calculateRiskMetrics(data, latest, aiMetrics, basis, overallGain, logReturns) {

    // --- 1. Daily P&L (Today vs Yesterday) ---
    if (data.length >= 2) {
        const today = data[data.length - 1];
        const yesterday = data[data.length - 2];
        const dailyDelta = today.totalValue - yesterday.totalValue;
        const dailyDeltaPct = yesterday.totalValue > 0 ? (dailyDelta / yesterday.totalValue) * 100 : 0;
        const pnlEl = document.getElementById('kpi-daily-pnl');
        const pnlPctEl = document.getElementById('kpi-daily-pnl-pct');
        const pnlCard = document.getElementById('kpi-daily-pnl-card');
        if (pnlEl) {
            pnlEl.textContent = `${dailyDelta >= 0 ? '+' : ''}${fCur.format(dailyDelta)}`;
            pnlEl.style.color = dailyDelta >= 0 ? 'var(--positive)' : 'var(--negative)';
        }
        if (pnlPctEl) pnlPctEl.textContent = `${dailyDeltaPct >= 0 ? '+' : ''}${dailyDeltaPct.toFixed(2)}% vs. yesterday`;
        if (pnlCard) pnlCard.style.borderColor = dailyDelta >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
    }

    // --- 2. Sharpe Ratio ---
    // Uses daily log returns already computed in calculateSmartAnalysis
    // We recompute them here for independence
    const dailyReturns = [];
    for (let i = 1; i < data.length; i++) {
        const prev = data[i-1];
        const curr = data[i];
        const r = (curr.totalValue - prev.totalValue - curr.inflow) / (prev.totalValue || 1);
        dailyReturns.push(r);
    }
    const sharpeEl = document.getElementById('kpi-sharpe');
    const sharpeLabelEl = document.getElementById('kpi-sharpe-label');
    if (dailyReturns.length > 1) {
        const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / dailyReturns.length;
        const stdDev = Math.sqrt(variance);
        // Annualized Sharpe (risk-free rate ~4.5% / 365)
        const riskFreeDaily = 0.045 / 365;
        const sharpe = stdDev > 0 ? ((meanReturn - riskFreeDaily) / stdDev) * Math.sqrt(365) : 0;
        if (sharpeEl) {
            sharpeEl.textContent = sharpe.toFixed(2);
            sharpeEl.style.color = sharpe >= 1 ? 'var(--positive)' : sharpe >= 0 ? 'var(--text-primary)' : 'var(--negative)';
        }
        if (sharpeLabelEl) {
            sharpeLabelEl.textContent = sharpe >= 2 ? 'Excellent' : sharpe >= 1 ? 'Good' : sharpe >= 0 ? 'Acceptable' : 'Poor';
        }
    }

    // --- 3. BTC / ETH Sensitivity ($ impact of a 10% price move) ---
    const btcValue = latest.btcBal * latest.btcPrice;
    const ethValue = latest.ethBal * latest.ethPrice;
    const btcSensitivity = btcValue * 0.10;
    const ethSensitivity = ethValue * 0.10;
    const btcSensEl = document.getElementById('risk-btc-sensitivity');
    const ethSensEl = document.getElementById('risk-eth-sensitivity');
    if (btcSensEl) btcSensEl.textContent = `${fCur.format(btcSensitivity)}`;
    if (ethSensEl) ethSensEl.textContent = `${fCur.format(ethSensitivity)}`;

    // --- 4. Break-Even Price Calculator ---
    // Break-even BTC price: price at which portfolio value == adjusted basis
    // Portfolio = btcBal*btcP + ethBal*ethP + stable
    // We solve for btcP when total == basis: btcP = (basis - ethVal - stable) / btcBal
    const stableValue = latest.usdtBal + latest.usdcBal;
    const btcBreakEven = latest.btcBal > 0 ? (basis - (ethValue) - stableValue) / latest.btcBal : 0;
    const ethBreakEven = latest.ethBal > 0 ? (basis - (btcValue) - stableValue) / latest.ethBal : 0;
    const btcBreakEl = document.getElementById('risk-btc-breakeven');
    const ethBreakEl = document.getElementById('risk-eth-breakeven');
    if (btcBreakEl) {
        btcBreakEl.textContent = btcBreakEven > 0 ? fCur.format(btcBreakEven) : 'N/A';
        btcBreakEl.style.color = btcBreakEven < latest.btcPrice ? 'var(--positive)' : 'var(--negative)';
    }
    if (ethBreakEl) {
        ethBreakEl.textContent = ethBreakEven > 0 ? fCur.format(ethBreakEven) : 'N/A';
        ethBreakEl.style.color = ethBreakEven < latest.ethPrice ? 'var(--positive)' : 'var(--negative)';
    }
}

function calculateDisciplineScore(data) {
    let score = 50; 
    let totalInflowEvents = 0;
    
    for (let i = 1; i < data.length; i++) {
        if (data[i].inflowOther > 0) {
            totalInflowEvents++;
            if (data[i].dailyGainPct < -1.0) {
                score += 8; // Dip Buying
            } else if (data[i].dailyGainPct > 1.0) {
                score -= 8; // FOMO
            } else {
                score += 2; // Systematic
            }
        }
    }
    
    score = Math.max(0, Math.min(100, score));
    
    let label = "Systematic";
    let color = "var(--text-secondary)";
    if (totalInflowEvents === 0) {
        score = 0; label = "No Data";
    } else if (score >= 80) {
        label = "Contrarian / Dip Buyer"; color = "var(--positive)";
    } else if (score >= 60) {
        label = "Disciplined DCA"; color = "var(--accent-blue)";
    } else if (score <= 30) {
        label = "High FOMO Risk"; color = "var(--negative)";
    } else {
        label = "Momentum Chaser"; color = "var(--text-secondary)";
    }
    
    const scoreEl = document.getElementById('ai-discipline-score');
    const labelEl = document.getElementById('ai-discipline-label');
    if (scoreEl) { scoreEl.textContent = score.toFixed(0) + "/100"; scoreEl.style.color = color; }
    if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }
}

function detectMarketRegime(data) {
    if (data.length < 14) return { regime: "Gathering Data", color: "var(--text-muted)", isBull: false };
    
    const latest = data[data.length - 1];
    const past14 = data[data.length - 14];
    
    const btcTrend = (latest.btcPrice - past14.btcPrice) / past14.btcPrice;
    const ethTrend = (latest.ethPrice - past14.ethPrice) / past14.ethPrice;
    const avgTrend = (btcTrend + ethTrend) / 2;
    
    let maxDrop = false;
    for(let i = data.length - 7; i < data.length; i++) {
        if(data[i].dailyGainPct < -5) maxDrop = true;
    }
    
    if (maxDrop) return { regime: "High Volatility", color: "var(--accent-indigo)", isBull: false };
    if (avgTrend > 0.08) return { regime: "Bull Phase", color: "var(--positive)", isBull: true };
    if (avgTrend < -0.08) return { regime: "Accumulation", color: "var(--negative)", isBull: false };
    return { regime: "Crab (Ranging)", color: "var(--text-secondary)", isBull: false };
}

function generateMorningBriefing(regimeData, alpha) {
    const textEl = document.getElementById('intel-briefing-text');
    if (!textEl) return;
    
    const alphaStr = (Math.abs(alpha) * 100).toFixed(1);
    const isOutperforming = alpha > 0;
    
    let sentence1 = `Good morning. The market is currently in a ${regimeData.regime.toLowerCase()} state. `;
    let sentence2 = isOutperforming ? 
        `Your portfolio is outperforming the benchmark by ${alphaStr}%, demonstrating strong yield cushioning. ` : 
        `Your portfolio is trailing the index by ${alphaStr}%; monitor asset allocation. `;
        
    let sentence3 = "";
    if (regimeData.regime === "Crab (Ranging)" || regimeData.regime === "Gathering Data") {
        sentence3 = "Volatility is low; recommended to tighten Dual Investment spreads to capture higher APR.";
    } else if (regimeData.isBull) {
        sentence3 = "Strong upward momentum detected; consider widening strikes to avoid premature assignment.";
    } else {
        sentence3 = "Defensive positioning recommended. Stablecoin yield provides a strong buffer here.";
    }
    
    textEl.textContent = sentence1 + sentence2 + sentence3;
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

    // Update Regime & Briefing
    const regimeData = detectMarketRegime(data);
    const regimeEl = document.getElementById('intel-market-regime');
    if (regimeEl) {
        regimeEl.textContent = regimeData.regime;
        regimeEl.style.color = regimeData.color;
    }
    generateMorningBriefing(regimeData, alpha);

    // 3. Scenario rates — Best = APR-only CAGR, Mod = 75% of it, Worst = 50% of it
    // APR CAGR: annualize the daily yield (avgInflow / basis)
    const dailyAprRate = basis > 0 ? (avgInflow / basis) : 0;
    const r_best  = Math.pow(1 + dailyAprRate, 365) - 1;   // Best: pure APR compounded
    const r_mod   = r_best * 0.75;                           // Moderate: 75% of APR CAGR
    const r_worst = r_best * 0.50;                           // Worst: 50% of APR CAGR
    const inflow_best  = avgInflow;
    const inflow_mod   = avgInflow * 0.75;
    const inflow_worst = avgInflow * 0.50;

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

    const normalCDF = (x) => {
        let t = 1 / (1 + 0.2316419 * Math.abs(x));
        let d = 0.3989423 * Math.exp(-x * x / 2);
        let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return x > 0 ? 1 - p : p;
    };

    targets.forEach(target => {
        if (target <= latest.totalValue) return;

        const dBest  = calculateDays(target, r_best,  inflow_best,  latest.totalValue);
        const dMod   = calculateDays(target, r_mod,   inflow_mod,   latest.totalValue);
        const dWorst = calculateDays(target, r_worst, inflow_worst, latest.totalValue);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fCur.format(target)}</td>
            <td class="col-worst">${formatDate(dWorst)}</td>
            <td class="col-mod">${formatDate(dMod)}</td>
            <td class="col-best" style="color: var(--positive);">${formatDate(dBest)}</td>
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
                { label: 'BTC Stack', data: btcHoldings, borderColor: '#f7931a', backgroundColor: 'rgba(247, 147, 26, 0.1)', borderWidth: 2, fill: true, tension: 0.3, yAxisID: 'y' },
                { label: 'ETH Stack', data: ethHoldings, borderColor: '#627eea', backgroundColor: 'rgba(98, 126, 234, 0.1)', borderWidth: 2, fill: true, tension: 0.3, yAxisID: 'y1' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: {
                x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                y: { type: 'linear', display: true, position: 'left', beginAtZero: false, grid: { color: 'rgba(255,255,255,0.03)' }, title: { display: true, text: 'BTC Qty', font: { size: 10 } } },
                y1: { type: 'linear', display: true, position: 'right', beginAtZero: false, grid: { display: false }, title: { display: true, text: 'ETH Qty', font: { size: 10 } } }
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
            plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 }, color: '#94a3b8' } } },
            scales: {
                x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                y: { type: 'linear', display: true, position: 'left', beginAtZero: false, grid: { color: 'rgba(255,255,255,0.03)' }, title: { display: true, text: 'BTC ($)', font: { size: 10 } } },
                y1: { type: 'linear', display: true, position: 'right', beginAtZero: false, grid: { display: false }, title: { display: true, text: 'ETH ($)', font: { size: 10 } } }
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

function renderCagrChart(type) {
    const ctx = document.getElementById('cagrHistoryChart').getContext('2d');
    if (cagrChartInstance) cagrChartInstance.destroy();

    const data = trueLedgerData; 
    if (!data || data.length === 0) return;

    let historyLabels = [];
    let chartData = [];
    
    const msPerDay = 1000 * 60 * 60 * 24;
    const day1Date = data[0].dateObj;

    for (let i = 0; i < data.length; i++) {
        const slice = data.slice(0, i + 1);
        const day_i = slice[slice.length - 1];
        
        const daysElapsed = Math.max(1, ((day_i.dateObj - day1Date) / msPerDay) + 1);
        
        // Start plotting from Day 2 (skipping day 1 where return is inherently 0/undefined)
        if (daysElapsed < 2) continue;
        
        const metrics = runReconciliationEngine(slice);
        
        let basis = (data[0].totalInvestment > 0) ? data[0].totalInvestment : data[0].totalValue;
        for (let j = 1; j <= i; j++) {
            if (data[j].totalInvestment > 0) basis = data[j].totalInvestment;
            else basis = basis + data[j].inflow - data[j].outflow;
        }

        const pureAprValue = (metrics.totalBtcYield * day_i.btcPrice) + 
                             (metrics.totalEthYield * day_i.ethPrice) + 
                             metrics.totalUsdtYield;

        const overallGain = day_i.totalValue - basis;
        const capGainsValue = overallGain - pureAprValue;

        if (basis <= 0) continue;

        let valToPush = 0;
        if (type === 'apr') {
            const aprReturnFraction = pureAprValue / basis;
            valToPush = (aprReturnFraction / daysElapsed) * 365 * 100;
        } else {
            const cgReturnFraction = capGainsValue / basis;
            valToPush = (cgReturnFraction / daysElapsed) * 365 * 100;
        }

        historyLabels.push(day_i.dateStr);
        chartData.push(valToPush);
    }

    const colorStr = type === 'apr' ? '#8b5cf6' : '#10b981'; // Purple vs Green
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, type === 'apr' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    // Add final current CAGR as a horizontal dotted line using chartjs-plugin-annotation or drawing it? 
    // Wait, since we don't have chartjs-plugin-annotation, we can just push an array of identical values for the benchmark line!
    const finalVal = chartData.length > 0 ? chartData[chartData.length - 1] : 0;
    const benchmarkData = chartData.map(() => finalVal);

    cagrChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: historyLabels,
            datasets: [
                {
                    label: type === 'apr' ? 'APR CAGR %' : 'Cap Gains CAGR %',
                    data: chartData,
                    borderColor: colorStr,
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Current ' + (type === 'apr' ? 'APR' : 'Cap Gains') + ' CAGR',
                    data: benchmarkData,
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.raw.toFixed(2) + '%' } } },
            scales: {
                x: { type: 'time', time: { unit: 'day', displayFormats: { day: 'MMM d' } }, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { maxTicksLimit: 7 } },
                y: { suggestedMin: -10, suggestedMax: 50, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { callback: v => v + '%' } }
            }
        }
    });
}

// ==========================================
// HoneyTracker Engine
// ==========================================

function processAndRenderHoney(rawData) {
    if (!rawData || rawData.length === 0) return;

    trueHoneyData = rawData.map(row => {
        return {
            dateStr: row['Date'] || Object.values(row)[0],
            dateObj: new Date(row['Date'] || Object.values(row)[0]),
            earning: getVal(row, 'Earning'),
            winning: getVal(row, 'Winning')
        };
    }).filter(d => !isNaN(d.dateObj.getTime())).sort((a, b) => a.dateObj - b.dateObj);

    if (trueHoneyData.length === 0) return;

    let totalEarnings = 0;
    let totalWinnings = 0;
    
    let timeSeriesDates = [];
    let timeSeriesCumulative = [];
    let dailyEarningSeries = [];
    let dailyWinningSeries = [];
    let cumulative = 0;

    const TARGET = 16000;

    for (let i = 0; i < trueHoneyData.length; i++) {
        const d = trueHoneyData[i];
        totalEarnings += d.earning;
        totalWinnings += d.winning;
        cumulative += (d.earning + d.winning);

        timeSeriesDates.push(d.dateObj.toISOString()); // FIX: Use ISO string for ChartJS date parsing
        timeSeriesCumulative.push(cumulative);
        dailyEarningSeries.push(d.earning);
        dailyWinningSeries.push(d.winning);
    }

    const totalCredits = totalEarnings + totalWinnings;
    const daysElapsed = trueHoneyData.length;
    const remaining = TARGET - totalCredits;
    const dailyAvg = totalCredits / daysElapsed;

    // 7-day calculations
    let last7DaysEarn = 0;
    let last7DaysWin = 0;
    const daysToLookBack = Math.min(7, trueHoneyData.length);
    for (let i = trueHoneyData.length - daysToLookBack; i < trueHoneyData.length; i++) {
        last7DaysEarn += trueHoneyData[i].earning;
        last7DaysWin += trueHoneyData[i].winning;
    }
    const total7DayCredits = last7DaysEarn + last7DaysWin;
    const avg7Day = total7DayCredits / daysToLookBack;

    // Scenario Modeling
    const baseRate = dailyAvg;
    const bestRate = Math.max(avg7Day, dailyAvg * 1.25); // Best case is recent trend or 25% bump
    const worstRate = Math.min(avg7Day, dailyAvg * 0.75); // Worst case is recent slow trend or 25% drop

    function calcEta(rate) {
        if (remaining <= 0) return { date: 'GOAL MET', days: 0 };
        if (rate <= 0) return { date: 'N/A', days: 0 };
        const days = remaining / rate;
        const lastDate = new Date(trueHoneyData[trueHoneyData.length - 1].dateObj);
        lastDate.setDate(lastDate.getDate() + Math.ceil(days));
        return {
            date: lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            days: Math.ceil(days)
        };
    }

    const baseEta = calcEta(baseRate);
    const bestEta = calcEta(bestRate);
    const worstEta = calcEta(worstRate);

    // Convert to USD equivalent
    const currentUsdValue = totalCredits / 1000;
    const avgUsdValue = dailyAvg / 1000;

    // Render Top KPIs
    document.getElementById('honey-total-credits').textContent = fNum.format(totalCredits);
    document.getElementById('honey-total-usd').textContent = `Equivalent: ${fCur.format(currentUsdValue)}`;
    
    document.getElementById('honey-daily-avg').textContent = dailyAvg.toFixed(2) + ' /day';
    document.getElementById('honey-avg-usd').textContent = `${fCur.format(avgUsdValue)} /day`;
    
    document.getElementById('honey-7d-avg').textContent = avg7Day.toFixed(2) + ' /day';
    
    const momentumBadge = document.getElementById('honey-momentum-badge');
    const momentumDiff = avg7Day - dailyAvg;
    if (momentumDiff > 0) {
        momentumBadge.textContent = 'ACCELERATING';
        momentumBadge.className = 'badge-solid trend-up';
    } else if (momentumDiff < 0) {
        momentumBadge.textContent = 'SLOWING';
        momentumBadge.className = 'badge-solid trend-down';
    } else {
        momentumBadge.textContent = 'STABLE';
        momentumBadge.className = 'badge-solid trend-flat';
    }

    document.getElementById('honey-eta-date').textContent = baseEta.date;
    document.getElementById('honey-eta-days').textContent = baseEta.days > 0 ? `~${baseEta.days} Days left` : '0 Days';

    // Render Scenario Table
    document.getElementById('eta-best-rate').textContent = bestRate.toFixed(1) + ' /day';
    document.getElementById('eta-best-date').textContent = bestEta.date;
    document.getElementById('eta-base-rate').textContent = baseRate.toFixed(1) + ' /day';
    document.getElementById('eta-base-date').textContent = baseEta.date;
    document.getElementById('eta-worst-rate').textContent = worstRate.toFixed(1) + ' /day';
    document.getElementById('eta-worst-date').textContent = worstEta.date;

    // Render Charts
    renderHoneyChart(timeSeriesDates, timeSeriesCumulative, TARGET);
    renderHoneyVelocityChart(timeSeriesDates, dailyEarningSeries, dailyWinningSeries, avg7Day);
    renderHoneyMixChart(totalEarnings, totalWinnings);
}

let honeyVelocityChartInstance = null;
let honeyMixChartInstance = null;

function renderHoneyChart(labels, cumulativeData, targetLine) {
    const ctx = document.getElementById('honeyChart').getContext('2d');
    if (honeyChartInstance) honeyChartInstance.destroy();

    const targetData = labels.map(() => targetLine);

    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.01)');

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    honeyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Cumulative Credits',
                    data: cumulativeData,
                    borderColor: '#f59e0b',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Goal (16,000)',
                    data: targetData,
                    borderColor: 'rgba(16, 185, 129, 0.8)',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', padding: 8 }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { maxTicksLimit: 7 }
                },
                y: {
                    suggestedMax: targetLine * 1.1,
                    grid: { color: 'rgba(255,255,255,0.03)' }
                }
            }
        }
    });
}

function renderHoneyVelocityChart(labels, earnData, winData, avg7Day) {
    const ctx = document.getElementById('honeyVelocityChart').getContext('2d');
    if (honeyVelocityChartInstance) honeyVelocityChartInstance.destroy();

    const avg7DayData = labels.map(() => avg7Day);

    honeyVelocityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Earnings',
                    data: earnData,
                    backgroundColor: '#3b82f6',
                    borderWidth: 0,
                    borderRadius: 4
                },
                {
                    label: 'Winnings',
                    data: winData,
                    backgroundColor: '#10b981',
                    borderWidth: 0,
                    borderRadius: 4
                },
                {
                    type: 'line',
                    label: '7-Day Avg',
                    data: avg7DayData,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', padding: 8 }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                    grid: { display: false },
                    stacked: true
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(255,255,255,0.03)' }
                }
            }
        }
    });
}

function renderHoneyMixChart(earnings, winnings) {
    const ctx = document.getElementById('honeyMixChart').getContext('2d');
    if (honeyMixChartInstance) honeyMixChartInstance.destroy();

    const total = earnings + winnings;
    const earnPct = total > 0 ? (earnings / total) * 100 : 0;
    const winPct = total > 0 ? (winnings / total) * 100 : 0;

    honeyMixChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Earnings', 'Winnings'],
            datasets: [{
                data: [earnings, winnings],
                backgroundColor: ['#3b82f6', '#10b981'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });

    const legendContainer = document.getElementById('honey-mix-legend');
    legendContainer.innerHTML = `
        <div style="text-align: center;">
            <div style="color: #3b82f6; font-weight: 700; font-size: 1.1rem;">${earnPct.toFixed(1)}%</div>
            <div style="color: var(--text-muted);">Earnings</div>
        </div>
        <div style="text-align: center;">
            <div style="color: #10b981; font-weight: 700; font-size: 1.1rem;">${winPct.toFixed(1)}%</div>
            <div style="color: var(--text-muted);">Winnings</div>
        </div>
    `;
}
