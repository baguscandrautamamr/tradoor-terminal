import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SYMBOLS,
  EXCHANGES,
  TIMEFRAMES,
  generateHistoricalCandles,
  generateOrderBook,
  buildCandleFootprint,
} from './services/marketEngine';
import ChartCanvas from './components/ChartCanvas';
import DomLadder from './components/DomLadder';
import OrderFlowTape from './components/OrderFlowTape';
import PaperTradingDock from './components/PaperTradingDock';
import FrostScriptModal from './components/FrostScriptModal';

export default function App() {
  const [selectedExchange, setSelectedExchange] = useState(EXCHANGES[0]);
  const [symbolConfig, setSymbolConfig] = useState(SYMBOLS[0]);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
  const [chartMode, setChartMode] = useState('candles'); // 'candles' | 'footprint' | 'tpo'
  const [wsStatus, setWsStatus] = useState('CONNECTING'); // 'LIVE_WS' | 'ORDERFLOW_SIM' | 'CONNECTING'

  const [candles, setCandles] = useState(() =>
    generateHistoricalCandles(SYMBOLS[0], TIMEFRAMES[0].seconds, 95)
  );
  const [orderBook, setOrderBook] = useState(() =>
    generateOrderBook(SYMBOLS[0].basePrice, SYMBOLS[0].tickSize, SYMBOLS[0].volScale)
  );
  const [trades, setTrades] = useState([]);
  const [liquidations, setLiquidations] = useState([]);

  // Indicators & Sub-pane state
  const [indicators, setIndicators] = useState({
    ema20: true,
    ema50: true,
    vwap: true,
    bbands: false,
    volumeProfile: true,
    subPane: 'cvd', // 'cvd' | 'volume' | 'oi'
  });

  // Drawing Tools state
  const [activeTool, setActiveTool] = useState('crosshair'); // 'crosshair' | 'trendline' | 'hline' | 'fib' | 'measure'
  const [drawings, setDrawings] = useState([]);

  // Frost Script Custom Indicator Modal
  const [isFrostOpen, setIsFrostOpen] = useState(false);
  const [customScript, setCustomScript] = useState({
    enabled: true,
    name: 'Delta Absorption Detector',
    code: '',
  });

  // Paper Trading Account State
  const [balance, setBalance] = useState(25000);
  const [positions, setPositions] = useState([
    {
      id: 'init-pos-1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      qty: 0.25,
      entryPrice: 91180,
      markPrice: 91450,
      liqPrice: 86850,
      marginUsd: 1140,
      leverage: 20,
      tp: 92800,
      sl: 90400,
    },
  ]);
  const [limitOrders, setLimitOrders] = useState([]);
  const [journal, setJournal] = useState([
    {
      id: 'j-1',
      closedAt: '13:20:15',
      symbol: 'BTCUSDT',
      side: 'LONG',
      leverage: 20,
      entryPrice: 90640,
      exitPrice: 91290,
      qty: 0.3,
      pnl: 195.0,
      roe: 34.4,
      tag: 'Orderflow Absorption',
      note: 'Delta negatif diserap habis di area VAL + pantulan nPOC.',
    },
    {
      id: 'j-2',
      closedAt: '12:05:42',
      symbol: 'SOLUSDT',
      side: 'SHORT',
      leverage: 15,
      entryPrice: 196.8,
      exitPrice: 194.9,
      qty: 25,
      pnl: 47.5,
      roe: 14.5,
      tag: 'CVD Divergence',
      note: 'Buyer exhaustion di atas VAH pada footprint 5m.',
    },
  ]);

  const [selectedLimitPrice, setSelectedLimitPrice] = useState(null);
  const [oneClickDom, setOneClickDom] = useState(false);
  const prevPriceRef = useRef(symbolConfig.basePrice);

  // Re-initialize historical data when symbol or timeframe changes
  useEffect(() => {
    const hist = generateHistoricalCandles(symbolConfig, timeframe.seconds, 95);
    setCandles(hist);
    const lastClose = hist[hist.length - 1].close;
    prevPriceRef.current = lastClose;
    setOrderBook(generateOrderBook(lastClose, symbolConfig.tickSize, symbolConfig.volScale));

    // Seed initial tape & liquidations
    const now = new Date();
    const initTrades = Array.from({ length: 18 }, (_, idx) => {
      const side = Math.random() > 0.48 ? 'BUY' : 'SELL';
      const p = lastClose + (Math.random() - 0.5) * symbolConfig.tickSize * 4;
      const sz = Number(((Math.random() * 1.8 + 0.05) * symbolConfig.volScale).toFixed(3));
      return {
        id: `t-init-${idx}`,
        price: p,
        size: sz,
        usdValue: p * sz,
        side,
        timeStr: new Date(now.getTime() - idx * 1400).toLocaleTimeString([], { hour12: false }),
      };
    });
    setTrades(initTrades);

    const initLiqs = [
      {
        id: 'liq-1',
        exchange: 'BN',
        symbol: symbolConfig.symbol,
        side: 'SHORT',
        price: lastClose * 1.002,
        usdValue: 84500,
      },
      {
        id: 'liq-2',
        exchange: 'BB',
        symbol: symbolConfig.symbol,
        side: 'LONG',
        price: lastClose * 0.998,
        usdValue: 42300,
      },
      {
        id: 'liq-3',
        exchange: 'OKX',
        symbol: 'ETHUSDT',
        side: 'SHORT',
        price: 3132.5,
        usdValue: 128900,
      },
    ];
    setLiquidations(initLiqs);
  }, [symbolConfig, timeframe]);

  // Helper to apply incoming tick price & volume to state
  const applyTick = useCallback(
    (tradePrice, tradeQty, isBuyerMaker) => {
      const side = isBuyerMaker ? 'SELL' : 'BUY';
      const usdVal = tradePrice * tradeQty;
      const timeStr = new Date().toLocaleTimeString([], { hour12: false });

      setTrades((prev) => [
        {
          id: `tr-${Date.now()}-${Math.random()}`,
          price: tradePrice,
          size: tradeQty,
          usdValue: usdVal,
          side,
          timeStr,
        },
        ...prev.slice(0, 49),
      ]);

      // Occasional liquidation event on big ticks
      if (usdVal > 28000 && Math.random() > 0.55) {
        const exchBadges = ['BN', 'BB', 'OKX', 'HL', 'BG'];
        setLiquidations((prev) => [
          {
            id: `lq-${Date.now()}-${Math.random()}`,
            exchange: exchBadges[Math.floor(Math.random() * exchBadges.length)],
            symbol: symbolConfig.symbol,
            side: side === 'BUY' ? 'SHORT' : 'LONG',
            price: tradePrice,
            usdValue: usdVal * (1.8 + Math.random() * 3),
          },
          ...prev.slice(0, 29),
        ]);
      }

      setCandles((prev) => {
        if (!prev || prev.length === 0) return prev;
        const updated = [...prev];
        const last = { ...updated[updated.length - 1] };
        prevPriceRef.current = last.close;

        last.close = tradePrice;
        if (tradePrice > last.high) last.high = tradePrice;
        if (tradePrice < last.low) last.low = tradePrice;
        last.volume = Number((last.volume + tradeQty).toFixed(2));
        const signedDelta = side === 'BUY' ? tradeQty : -tradeQty;
        last.delta = Number((last.delta + signedDelta).toFixed(1));
        last.cumDelta = Number((last.cumDelta + signedDelta).toFixed(1));

        // Rebuild footprint levels dynamically for the active bar
        const fp = buildCandleFootprint(
          last.open,
          last.high,
          last.low,
          last.close,
          last.volume,
          symbolConfig.tickSize
        );
        last.footprint = fp.levels;
        last.pocPrice = fp.pocPrice;
        last.maxLevelVol = fp.maxLevelVol;

        updated[updated.length - 1] = last;
        return updated;
      });

      setOrderBook(generateOrderBook(tradePrice, symbolConfig.tickSize, symbolConfig.volScale));

      // Check Limit Orders fill condition
      setLimitOrders((prevOrders) => {
        if (prevOrders.length === 0) return prevOrders;
        const remaining = [];
        prevOrders.forEach((ord) => {
          if (ord.symbol !== symbolConfig.symbol) {
            remaining.push(ord);
            return;
          }
          const shouldFill =
            (ord.side === 'LONG' && tradePrice <= ord.price) ||
            (ord.side === 'SHORT' && tradePrice >= ord.price);
          if (shouldFill) {
            const liqDist = (ord.price / ord.leverage) * 0.92;
            const liqPrice =
              ord.side === 'LONG' ? ord.price - liqDist : ord.price + liqDist;
            setPositions((pList) => [
              {
                id: `pos-${Date.now()}-${Math.random()}`,
                symbol: ord.symbol,
                side: ord.side,
                qty: ord.qty,
                entryPrice: ord.price,
                markPrice: tradePrice,
                liqPrice: Math.max(0.0001, liqPrice),
                marginUsd: ord.marginUsd,
                leverage: ord.leverage,
              },
              ...pList,
            ]);
          } else {
            remaining.push(ord);
          }
        });
        return remaining;
      });
    },
    [symbolConfig]
  );

  // Connect to Live Binance WebSocket with automatic fallback to synthetic high-frequency stream
  useEffect(() => {
    let ws = null;
    let simTimer = null;
    let lastWsTick = 0;
    setWsStatus('CONNECTING');

    const streamSymbol = symbolConfig.symbol.toLowerCase();
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamSymbol}@aggTrade`);
      ws.onopen = () => {
        setWsStatus('LIVE_WS');
      };
      ws.onmessage = (event) => {
        const now = Date.now();
        if (now - lastWsTick < 220) return; // throttle UI updates to ~4.5 FPS for smooth DOM
        lastWsTick = now;
        try {
          const data = JSON.parse(event.data);
          if (data && data.p) {
            const price = parseFloat(data.p);
            const qty = parseFloat(data.q);
            applyTick(price, qty, data.m);
          }
        } catch {
          // ignore malformed packet
        }
      };
      ws.onerror = () => {
        setWsStatus('ORDERFLOW_SIM');
      };
      ws.onclose = () => {
        setWsStatus((prev) => (prev === 'LIVE_WS' ? 'ORDERFLOW_SIM' : prev));
      };
    } catch {
      setWsStatus('ORDERFLOW_SIM');
    }

    // Fallback / Hybrid Simulation Loop if WS hasn't ticked in the last 1.2s
    simTimer = setInterval(() => {
      if (Date.now() - lastWsTick > 1100) {
        setWsStatus((prev) => (prev === 'LIVE_WS' ? prev : 'ORDERFLOW_SIM'));
        setCandles((curr) => {
          if (!curr || curr.length === 0) return curr;
          const lastClose = curr[curr.length - 1].close;
          const step = symbolConfig.tickSize * (Math.random() - 0.492) * 1.8;
          const nextPrice = Math.max(
            symbolConfig.tickSize,
            Number((lastClose + step).toFixed(6))
          );
          const qty = Number(
            ((Math.random() * 2.2 + 0.08) * symbolConfig.volScale).toFixed(3)
          );
          setTimeout(() => applyTick(nextPrice, qty, Math.random() > 0.52), 0);
          return curr;
        });
      }
    }, 650);

    return () => {
      if (ws) ws.close();
      if (simTimer) clearInterval(simTimer);
    };
  }, [symbolConfig, applyTick]);

  // Paper Trading Handlers
  const handlePlaceOrder = (order) => {
    if (order.type === 'MARKET') {
      const liqDist = (order.price / order.leverage) * 0.92;
      const liqPrice =
        order.side === 'LONG' ? order.price - liqDist : order.price + liqDist;
      setBalance((b) => Math.max(0, b - order.marginUsd));
      setPositions((prev) => [
        {
          id: `pos-${Date.now()}`,
          symbol: order.symbol,
          side: order.side,
          qty: order.qty,
          entryPrice: order.price,
          markPrice: order.price,
          liqPrice: Math.max(0.0001, liqPrice),
          marginUsd: order.marginUsd,
          leverage: order.leverage,
          tp: order.tp,
          sl: order.sl,
        },
        ...prev,
      ]);
    } else {
      setLimitOrders((prev) => [
        {
          id: `ord-${Date.now()}`,
          timeStr: new Date().toLocaleTimeString([], { hour12: false }),
          ...order,
        },
        ...prev,
      ]);
    }
  };

  const handleQuickLimitFromDom = (side, price) => {
    const marginUsd = 500;
    const leverage = 20;
    const qty = Number(((marginUsd * leverage) / price).toFixed(4));
    handlePlaceOrder({
      symbol: symbolConfig.symbol,
      side,
      type: 'LIMIT',
      price,
      qty,
      marginUsd,
      leverage,
    });
  };

  const handleClosePosition = (posId, exitPrice) => {
    const target = positions.find((p) => p.id === posId);
    if (!target) return;

    const pnl =
      (target.side === 'LONG'
        ? exitPrice - target.entryPrice
        : target.entryPrice - exitPrice) * target.qty;
    const roe = (pnl / Math.max(target.marginUsd, 1)) * 100;

    setBalance((b) => b + target.marginUsd + pnl);
    setPositions((prev) => prev.filter((p) => p.id !== posId));
    setJournal((prev) => [
      {
        id: `j-${Date.now()}`,
        closedAt: new Date().toLocaleTimeString([], { hour12: false }),
        symbol: target.symbol,
        side: target.side,
        leverage: target.leverage,
        entryPrice: target.entryPrice,
        exitPrice,
        qty: target.qty,
        pnl,
        roe,
        tag: chartMode === 'footprint' ? 'Orderflow Absorption' : 'Scalp DOM',
        note: `Closed via ${chartMode.toUpperCase()} view`,
      },
      ...prev,
    ]);
  };

  const handleReversePosition = (posId, currentPrice) => {
    const target = positions.find((p) => p.id === posId);
    if (!target) return;
    handleClosePosition(posId, currentPrice);
    const newSide = target.side === 'LONG' ? 'SHORT' : 'LONG';
    handlePlaceOrder({
      symbol: target.symbol,
      side: newSide,
      type: 'MARKET',
      price: currentPrice,
      qty: target.qty,
      marginUsd: target.marginUsd,
      leverage: target.leverage,
    });
  };

  const handleCancelOrder = (ordId) => {
    setLimitOrders((prev) => prev.filter((o) => o.id !== ordId));
  };

  const handleUpdateJournalNote = (jId, tag, note) => {
    setJournal((prev) =>
      prev.map((item) => (item.id === jId ? { ...item, tag, note } : item))
    );
  };

  const lastCandle = candles[candles.length - 1] || {
    close: symbolConfig.basePrice,
    open: symbolConfig.basePrice,
    high: symbolConfig.basePrice,
    low: symbolConfig.basePrice,
    volume: 0,
    openInterest: 0,
  };
  const firstCandle = candles[0] || lastCandle;
  const change24h = ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100;
  const sessionHigh = Math.max(...candles.map((c) => c.high));
  const sessionLow = Math.min(...candles.map((c) => c.low));
  const sessionVol = candles.reduce((s, c) => s + c.volume, 0);

  return (
    <div className="tradoor-app">
      {/* TOP BAR: BRAND, EXCHANGE, PAIR, METRICS, CHART MODES & INDICATORS */}
      <header className="terminal-topbar">
        <div className="brand-block">
          <div className="brand-logo">T</div>
          <div>
            <div className="brand-title">TRADOOR</div>
            <div className="brand-sub">ORDERFLOW TERMINAL</div>
          </div>
        </div>

        {/* Exchange Selector */}
        <div className="top-selector-group">
          <select
            className="terminal-select exchange-select"
            value={selectedExchange.id}
            onChange={(e) =>
              setSelectedExchange(
                EXCHANGES.find((x) => x.id === e.target.value) || EXCHANGES[0]
              )
            }
          >
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                ⚡ {ex.name}
              </option>
            ))}
          </select>

          {/* Pair Selector */}
          <select
            className="terminal-select pair-select"
            value={symbolConfig.symbol}
            onChange={(e) =>
              setSymbolConfig(
                SYMBOLS.find((s) => s.symbol === e.target.value) || SYMBOLS[0]
              )
            }
          >
            {SYMBOLS.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} PERP
              </option>
            ))}
          </select>
        </div>

        {/* Live Ticker Metrics */}
        <div className="ticker-metrics">
          <div className="metric-item main-price">
            <strong className={lastCandle.close >= prevPriceRef.current ? 'text-bull' : 'text-bear'}>
              ${lastCandle.close.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </strong>
            <span className={change24h >= 0 ? 'text-bull' : 'text-bear'}>
              {change24h >= 0 ? '+' : ''}
              {change24h.toFixed(2)}%
            </span>
          </div>
          <div className="metric-item">
            <span>24H HIGH</span>
            <b>{sessionHigh.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b>
          </div>
          <div className="metric-item">
            <span>24H LOW</span>
            <b>{sessionLow.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b>
          </div>
          <div className="metric-item">
            <span>24H VOL ({symbolConfig.base})</span>
            <b>{sessionVol.toFixed(0)}</b>
          </div>
          <div className="metric-item">
            <span>FUNDING / 8H</span>
            <b className="text-bull">+0.0100%</b>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="tf-group">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              className={`tf-btn ${timeframe.id === tf.id ? 'active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Chart Engine Mode Switcher (Candles / Footprint / TPO) */}
        <div className="mode-switcher">
          <button
            className={`mode-btn ${chartMode === 'candles' ? 'active' : ''}`}
            onClick={() => setChartMode('candles')}
            title="TradingView Candlestick + Volume Profile"
          >
            🕯️ CANDLES
          </button>
          <button
            className={`mode-btn ${chartMode === 'footprint' ? 'active' : ''}`}
            onClick={() => setChartMode('footprint')}
            title="ExoCharts / Tradoor Footprint Bid x Ask Cluster Mode"
          >
            📊 FOOTPRINT
          </button>
          <button
            className={`mode-btn ${chartMode === 'tpo' ? 'active' : ''}`}
            onClick={() => setChartMode('tpo')}
            title="TPO Market Profile (VAH / POC / VAL)"
          >
            🧱 TPO PROFILE
          </button>
        </div>

        {/* Indicators & Frost Script Controls */}
        <div className="indicator-toggles">
          <button
            className={`ind-btn ${indicators.ema20 ? 'active' : ''}`}
            onClick={() => setIndicators((p) => ({ ...p, ema20: !p.ema20 }))}
          >
            EMA
          </button>
          <button
            className={`ind-btn ${indicators.vwap ? 'active' : ''}`}
            onClick={() => setIndicators((p) => ({ ...p, vwap: !p.vwap }))}
          >
            VWAP
          </button>
          <button
            className={`ind-btn ${indicators.bbands ? 'active' : ''}`}
            onClick={() => setIndicators((p) => ({ ...p, bbands: !p.bbands }))}
          >
            BB
          </button>
          <button
            className={`ind-btn ${indicators.volumeProfile ? 'active' : ''}`}
            onClick={() =>
              setIndicators((p) => ({ ...p, volumeProfile: !p.volumeProfile }))
            }
          >
            VPVR
          </button>
          <select
            className="subpane-select"
            value={indicators.subPane}
            onChange={(e) =>
              setIndicators((p) => ({ ...p, subPane: e.target.value }))
            }
          >
            <option value="cvd">Sub: CVD Delta</option>
            <option value="volume">Sub: Volume</option>
            <option value="oi">Sub: Open Interest</option>
          </select>
          <button className="frost-btn" onClick={() => setIsFrostOpen(true)}>
            ❄️ Frost Script
          </button>
        </div>

        {/* Feed Status */}
        <div className="ws-status-pill">
          <span
            className={`status-dot ${
              wsStatus === 'LIVE_WS' ? 'online' : 'sim'
            }`}
          />
          <span>{wsStatus === 'LIVE_WS' ? 'BINANCE WS' : 'HF STREAM'}</span>
        </div>
      </header>

      {/* MAIN WORKSPACE: LEFT DRAWING TOOLBAR + CENTER CHART + RIGHT DOM & TAPE */}
      <div className="workspace-grid">
        {/* Left Drawing Toolbar */}
        <aside className="drawing-toolbar">
          {[
            { id: 'crosshair', icon: '┼', label: 'Crosshair / Pan' },
            { id: 'trendline', icon: '╱', label: 'Trendline (2 clicks)' },
            { id: 'hline', icon: '─', label: 'Support / Resistance Ray' },
            { id: 'fib', icon: '≡', label: 'Fibonacci Retracement' },
            { id: 'measure', icon: '📐', label: 'Measure Price & Bars' },
          ].map((tool) => (
            <button
              key={tool.id}
              className={`tool-btn ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => setActiveTool(tool.id)}
              title={tool.label}
            >
              {tool.icon}
            </button>
          ))}
          <div className="tool-divider" />
          <button
            className="tool-btn danger"
            onClick={() => setDrawings([])}
            title="Clear All Drawings"
          >
            🗑️
          </button>
        </aside>

        {/* Center Multi-Mode Chart + Bottom Paper Trading Dock */}
        <main className="center-column">
          <ChartCanvas
            candles={candles}
            symbolConfig={symbolConfig}
            chartMode={chartMode}
            indicators={indicators}
            activeTool={activeTool}
            drawings={drawings}
            setDrawings={setDrawings}
            positions={positions}
            limitOrders={limitOrders}
            customScript={customScript}
            onChartClickPrice={(p) => setSelectedLimitPrice(p)}
          />

          <PaperTradingDock
            symbolConfig={symbolConfig}
            lastPrice={lastCandle.close}
            balance={balance}
            positions={positions}
            limitOrders={limitOrders}
            journal={journal}
            selectedLimitPrice={selectedLimitPrice}
            onPlaceOrder={handlePlaceOrder}
            onClosePosition={handleClosePosition}
            onReversePosition={handleReversePosition}
            onCancelOrder={handleCancelOrder}
            onUpdateJournalNote={handleUpdateJournalNote}
          />
        </main>

        {/* Right Sidebar: Depth of Market (DOM) + Live Orderflow Tape & Liquidations */}
        <aside className="right-sidebar">
          <DomLadder
            orderBook={orderBook}
            lastPrice={lastCandle.close}
            prevPrice={prevPriceRef.current}
            symbolConfig={symbolConfig}
            onSelectPrice={(p) => setSelectedLimitPrice(p)}
            onQuickLimitOrder={handleQuickLimitFromDom}
            oneClickDom={oneClickDom}
            setOneClickDom={setOneClickDom}
          />
          <OrderFlowTape
            trades={trades}
            liquidations={liquidations}
            symbolConfig={symbolConfig}
          />
        </aside>
      </div>

      {/* Frost Script Custom Indicator Modal */}
      <FrostScriptModal
        isOpen={isFrostOpen}
        onClose={() => setIsFrostOpen(false)}
        customScript={customScript}
        setCustomScript={setCustomScript}
      />
    </div>
  );
}
