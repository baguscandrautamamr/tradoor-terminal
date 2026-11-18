// Multi-Exchange Market & Orderflow Engine for Tradoor Terminal (React + Vite)
// Supports Live Binance REST Klines + WebSocket + high-frequency Orderflow / Footprint / TPO synthesis

export const SYMBOLS = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', basePrice: 64750, tickSize: 10, stepSize: 0.001, volScale: 1.0 },
  { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', basePrice: 2640, tickSize: 1, stepSize: 0.01, volScale: 8.5 },
  { symbol: 'SOLUSDT', base: 'SOL', quote: 'USDT', basePrice: 154.5, tickSize: 0.2, stepSize: 0.1, volScale: 45 },
  { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', basePrice: 592.0, tickSize: 0.5, stepSize: 0.01, volScale: 12 },
  { symbol: 'XRPUSDT', base: 'XRP', quote: 'USDT', basePrice: 0.548, tickSize: 0.001, stepSize: 1, volScale: 1200 },
  { symbol: 'SUIUSDT', base: 'SUI', quote: 'USDT', basePrice: 2.15, tickSize: 0.005, stepSize: 1, volScale: 900 },
  { symbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT', basePrice: 0.142, tickSize: 0.0005, stepSize: 10, volScale: 8500 },
  { symbol: 'AVAXUSDT', base: 'AVAX', quote: 'USDT', basePrice: 27.8, tickSize: 0.05, stepSize: 0.1, volScale: 180 },
];

export const EXCHANGES = [
  { id: 'binance', name: 'Binance Perp', badge: 'BN', color: '#F3BA2F' },
  { id: 'bybit', name: 'Bybit Linear', badge: 'BB', color: '#F7A600' },
  { id: 'okx', name: 'OKX Swap', badge: 'OKX', color: '#FFFFFF' },
  { id: 'hyperliquid', name: 'Hyperliquid', badge: 'HL', color: '#50E3C2' },
  { id: 'bitget', name: 'Bitget Perp', badge: 'BG', color: '#00F0FF' },
];

export const TIMEFRAMES = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '1h', label: '1H', seconds: 3600 },
  { id: '4h', label: '4H', seconds: 14400 },
  { id: '1d', label: '1D', seconds: 86400 },
];

// Build footprint price clusters inside a single candle
export function buildCandleFootprint(open, high, low, close, volume, tickSize) {
  const range = Math.max(high - low, tickSize || 0.01);
  const totalSteps = 8;
  const step = range / totalSteps;

  let totalDelta = 0;
  let maxLevelVol = 0;
  let pocPrice = close;
  const isBull = close >= open;
  const levels = [];

  for (let i = 0; i <= totalSteps; i++) {
    const price = Number((low + i * step).toFixed(6));
    const bodyMid = (open + close) / 2;
    const distFromMid = Math.abs(price - bodyMid) / range;
    const weight = Math.max(0.18, Math.exp(-distFromMid * distFromMid * 3.2));
    const levelVol = (volume / (totalSteps + 1)) * weight * (0.8 + Math.random() * 0.4);

    const bullBias = isBull ? 0.56 : 0.44;
    const askRatio = Math.min(0.86, Math.max(0.14, bullBias + (Math.random() - 0.5) * 0.34));
    const askVol = Math.round(levelVol * askRatio * 10) / 10;
    const bidVol = Math.round(levelVol * (1 - askRatio) * 10) / 10;
    const delta = Number((askVol - bidVol).toFixed(1));
    totalDelta += delta;

    if (askVol + bidVol > maxLevelVol) {
      maxLevelVol = askVol + bidVol;
      pocPrice = price;
    }

    levels.push({
      price,
      bidVol,
      askVol,
      totalVol: Number((bidVol + askVol).toFixed(1)),
      delta,
      askImbalance: askVol > bidVol * 2.3,
      bidImbalance: bidVol > askVol * 2.3,
      isPOC: false,
    });
  }

  levels.forEach((lvl) => {
    if (lvl.price === pocPrice) lvl.isPOC = true;
  });

  return {
    levels: levels.reverse(),
    delta: Number(totalDelta.toFixed(1)),
    pocPrice,
    maxLevelVol,
  };
}

// Fetch real historical OHLCV klines from Binance public API so chart matches live WebSocket price
export async function fetchLiveBinanceKlines(symbolConfig, tfId = '1m', limit = 95) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbolConfig.symbol}&interval=${tfId}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Empty klines');

  let cumDelta = 0;
  let openInterest = Math.round( parseFloat(raw[0][4]) * symbolConfig.volScale * 420 );

  return raw.map((k) => {
    const time = k[0];
    const open = parseFloat(k[1]);
    const high = parseFloat(k[2]);
    const low = parseFloat(k[3]);
    const close = parseFloat(k[4]);
    const volume = parseFloat(k[5]);
    const takerBuyVol = parseFloat(k[9] || volume * 0.5);
    const takerSellVol = Math.max(0, volume - takerBuyVol);
    const realDelta = Number((takerBuyVol - takerSellVol).toFixed(1));

    const fp = buildCandleFootprint(open, high, low, close, volume, symbolConfig.tickSize);
    const delta = !Number.isNaN(realDelta) && realDelta !== 0 ? realDelta : fp.delta;
    cumDelta = Number((cumDelta + delta).toFixed(1));
    openInterest = Math.max(1000, Math.round(openInterest + delta * 0.35));

    return {
      time,
      open,
      high,
      low,
      close,
      volume: Number(volume.toFixed(2)),
      delta,
      cumDelta,
      pocPrice: fp.pocPrice,
      footprint: fp.levels,
      maxLevelVol: fp.maxLevelVol,
      openInterest,
    };
  });
}

// Re-anchor synthetic candles to match an incoming real live price if there is a gap > 0.4%
export function rebaseCandlesToPrice(candles, targetPrice, tickSize) {
  if (!candles || candles.length === 0 || !targetPrice) return candles;
  const lastClose = candles[candles.length - 1].close;
  const ratio = targetPrice / lastClose;
  if (Math.abs(1 - ratio) < 0.004) return candles;

  return candles.map((c) => {
    const open = Number((c.open * ratio).toFixed(6));
    const high = Number((c.high * ratio).toFixed(6));
    const low = Number((c.low * ratio).toFixed(6));
    const close = Number((c.close * ratio).toFixed(6));
    const fp = buildCandleFootprint(open, high, low, close, c.volume, tickSize);
    return {
      ...c,
      open,
      high,
      low,
      close,
      pocPrice: fp.pocPrice,
      footprint: fp.levels,
      maxLevelVol: fp.maxLevelVol,
    };
  });
}

// Generate initial historical candles with rich orderflow metadata
export function generateHistoricalCandles(symbolConfig, tfSeconds = 60, count = 90, anchorPrice = null) {
  const { tickSize, volScale } = symbolConfig;
  const basePrice = anchorPrice || symbolConfig.basePrice;
  const now = Math.floor(Date.now() / (tfSeconds * 1000)) * (tfSeconds * 1000);
  const candles = [];
  let price = basePrice * (0.992 + Math.random() * 0.008);
  let cumDelta = 0;
  let openInterest = Math.round(basePrice * volScale * 420);

  for (let i = count; i >= 0; i--) {
    const time = now - i * tfSeconds * 1000;
    const volatility = basePrice * 0.0018 * Math.sqrt(tfSeconds / 60);
    const drift = (Math.random() - 0.495) * volatility;
    const open = price;
    const close = Math.max(tickSize, Number((open + drift).toFixed(6)));
    const high = Number((Math.max(open, close) + Math.random() * volatility * 0.75).toFixed(6));
    const low = Number((Math.min(open, close) - Math.random() * volatility * 0.75).toFixed(6));
    const volume = Number(((Math.abs(close - open) / volatility + 0.5) * 140 * volScale * (0.7 + Math.random() * 0.8)).toFixed(1));

    const fp = buildCandleFootprint(open, high, low, close, volume, tickSize);
    cumDelta = Number((cumDelta + fp.delta).toFixed(1));
    openInterest = Math.max(1000, Math.round(openInterest + fp.delta * 0.35 + (Math.random() - 0.49) * 50 * volScale));

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume,
      delta: fp.delta,
      cumDelta,
      pocPrice: fp.pocPrice,
      footprint: fp.levels,
      maxLevelVol: fp.maxLevelVol,
      openInterest,
    });
    price = close;
  }

  return candles;
}

// Compute Session TPO & Volume Profile (VAH, VAL, POC, and histogram rows)
export function computeMarketProfile(candles, rowCount = 28) {
  if (!candles || candles.length === 0) return null;
  let minP = Infinity;
  let maxP = -Infinity;
  candles.forEach((c) => {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  });
  if (maxP <= minP) maxP = minP + 1;

  const step = (maxP - minP) / rowCount;
  const rows = Array.from({ length: rowCount }, (_, idx) => {
    const low = minP + idx * step;
    const high = low + step;
    return {
      idx,
      price: (low + high) / 2,
      low,
      high,
      upVol: 0,
      downVol: 0,
      totalVol: 0,
      tpoLetters: [],
    };
  });

  const recent = candles.slice(-48);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  recent.forEach((c, cIdx) => {
    const letter = alphabet[Math.floor(cIdx / 2) % alphabet.length];
    const isBull = c.close >= c.open;
    rows.forEach((row) => {
      if (c.high >= row.low && c.low <= row.high) {
        const share = c.volume / Math.max(1, Math.ceil((c.high - c.low) / step));
        if (isBull) row.upVol += share * 0.62;
        else row.downVol += share * 0.62;
        row.totalVol += share;
        if (row.tpoLetters.length < 18 && !row.tpoLetters.includes(letter)) {
          row.tpoLetters.push(letter);
        }
      }
    });
  });

  let maxVol = 0;
  let pocIdx = 0;
  let totalSessionVol = 0;
  rows.forEach((r, i) => {
    totalSessionVol += r.totalVol;
    if (r.totalVol > maxVol) {
      maxVol = r.totalVol;
      pocIdx = i;
    }
  });

  // Calculate 70% Value Area around POC
  const targetVA = totalSessionVol * 0.7;
  let currentVA = rows[pocIdx]?.totalVol || 0;
  let lowIdx = pocIdx;
  let highIdx = pocIdx;

  while (currentVA < targetVA && (lowIdx > 0 || highIdx < rows.length - 1)) {
    const nextLowVol = lowIdx > 0 ? rows[lowIdx - 1].totalVol : -1;
    const nextHighVol = highIdx < rows.length - 1 ? rows[highIdx + 1].totalVol : -1;
    if (nextHighVol >= nextLowVol && highIdx < rows.length - 1) {
      highIdx++;
      currentVA += rows[highIdx].totalVol;
    } else if (lowIdx > 0) {
      lowIdx--;
      currentVA += rows[lowIdx].totalVol;
    } else {
      break;
    }
  }

  return {
    rows,
    maxVol: Math.max(maxVol, 1),
    pocPrice: rows[pocIdx]?.price || 0,
    vahPrice: rows[highIdx]?.high || 0,
    valPrice: rows[lowIdx]?.low || 0,
    pocIdx,
    highIdx,
    lowIdx,
  };
}

// Generate realistic DOM (Depth of Market) Orderbook around current midPrice
export function generateOrderBook(midPrice, tickSize, volScale = 1, depth = 16) {
  const asks = [];
  const bids = [];
  let askCum = 0;
  let bidCum = 0;
  const decimals = tickSize < 0.001 ? 4 : tickSize < 0.1 ? 3 : tickSize < 1 ? 2 : 1;

  const baseMid = Math.round(midPrice / tickSize) * tickSize;

  for (let i = 1; i <= depth; i++) {
    const askPrice = Number((baseMid + i * tickSize).toFixed(decimals));
    const isWall = i === 5 || i === 11;
    const askSize = Number(((Math.random() * 8 + 1.2) * volScale * (isWall ? 3.4 : 1)).toFixed(2));
    askCum = Number((askCum + askSize).toFixed(2));
    asks.push({ price: askPrice, size: askSize, total: askCum, isWall });

    const bidPrice = Number((baseMid - i * tickSize).toFixed(decimals));
    const isBidWall = i === 4 || i === 9;
    const bidSize = Number(((Math.random() * 8 + 1.2) * volScale * (isBidWall ? 3.2 : 1)).toFixed(2));
    bidCum = Number((bidCum + bidSize).toFixed(2));
    bids.push({ price: bidPrice, size: bidSize, total: bidCum, isWall: isBidWall });
  }

  const maxTotal = Math.max(askCum, bidCum, 1);
  const bidRatio = Math.round((bidCum / Math.max(askCum + bidCum, 1)) * 100);

  return {
    asks: asks.reverse(),
    bids,
    maxTotal,
    bidRatio,
    askRatio: 100 - bidRatio,
    spread: tickSize,
  };
}
