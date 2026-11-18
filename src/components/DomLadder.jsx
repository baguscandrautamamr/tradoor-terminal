import React from 'react';

export default function DomLadder({
  orderBook,
  lastPrice,
  prevPrice,
  symbolConfig,
  onSelectPrice,
  onQuickLimitOrder,
  oneClickDom,
  setOneClickDom,
}) {
  if (!orderBook) return null;

  const ts = symbolConfig?.tickSize || 1;
  const decimals = ts < 0.001 ? 4 : ts < 0.1 ? 3 : ts < 1 ? 2 : 1;
  const isUp = lastPrice >= prevPrice;

  return (
    <div className="panel dom-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span>DOM // DEPTH OF MARKET</span>
          <span className="panel-badge">L2 BOOK</span>
        </div>
        <label className="dom-oneclick-toggle" title="Click price level to place instant limit order">
          <input
            type="checkbox"
            checked={oneClickDom}
            onChange={(e) => setOneClickDom(e.target.checked)}
          />
          <span>1-Click</span>
        </label>
      </div>

      {/* Bid / Ask Imbalance Meter */}
      <div className="imbalance-meter">
        <div className="imbalance-labels">
          <span className="text-bull">BIDS {orderBook.bidRatio}%</span>
          <span className="text-muted">IMBALANCE</span>
          <span className="text-bear">{orderBook.askRatio}% ASKS</span>
        </div>
        <div className="imbalance-bar-track">
          <div className="imbalance-bar-bid" style={{ width: `${orderBook.bidRatio}%` }} />
          <div className="imbalance-bar-ask" style={{ width: `${orderBook.askRatio}%` }} />
        </div>
      </div>

      <div className="dom-table-head">
        <span>PRICE ({symbolConfig.quote})</span>
        <span>SIZE ({symbolConfig.base})</span>
        <span>SUM</span>
      </div>

      {/* ASKS LADDER */}
      <div className="dom-section asks-section">
        {orderBook.asks.slice(-11).map((row) => {
          const pct = Math.min(100, (row.total / orderBook.maxTotal) * 100);
          return (
            <div
              key={`ask-${row.price}`}
              className={`dom-row ask-row ${row.isWall ? 'wall-row' : ''}`}
              onClick={() => {
                onSelectPrice(row.price);
                if (oneClickDom) onQuickLimitOrder('SHORT', row.price);
              }}
              title={
                oneClickDom
                  ? `Click to place SHORT Limit @ ${row.price}`
                  : `Click to copy price ${row.price}`
              }
            >
              <div className="dom-depth-fill ask-fill" style={{ width: `${pct}%` }} />
              <span className="dom-price text-bear">
                {row.price.toFixed(decimals)}
                {row.isWall && <em className="wall-tag">WALL</em>}
              </span>
              <span className="dom-size">{row.size.toFixed(2)}</span>
              <span className="dom-total">{row.total.toFixed(1)}</span>
            </div>
          );
        })}
      </div>

      {/* SPREAD & MARK PRICE BAR */}
      <div className="dom-mid-banner">
        <div className={`dom-last-price ${isUp ? 'text-bull' : 'text-bear'}`}>
          <span>{isUp ? '▲' : '▼'}</span>
          <strong>{Number(lastPrice).toFixed(decimals)}</strong>
        </div>
        <div className="dom-spread-info">
          <span>SPREAD {orderBook.spread}</span>
        </div>
      </div>

      {/* BIDS LADDER */}
      <div className="dom-section bids-section">
        {orderBook.bids.slice(0, 11).map((row) => {
          const pct = Math.min(100, (row.total / orderBook.maxTotal) * 100);
          return (
            <div
              key={`bid-${row.price}`}
              className={`dom-row bid-row ${row.isWall ? 'wall-row' : ''}`}
              onClick={() => {
                onSelectPrice(row.price);
                if (oneClickDom) onQuickLimitOrder('LONG', row.price);
              }}
              title={
                oneClickDom
                  ? `Click to place LONG Limit @ ${row.price}`
                  : `Click to copy price ${row.price}`
              }
            >
              <div className="dom-depth-fill bid-fill" style={{ width: `${pct}%` }} />
              <span className="dom-price text-bull">
                {row.price.toFixed(decimals)}
                {row.isWall && <em className="wall-tag">WALL</em>}
              </span>
              <span className="dom-size">{row.size.toFixed(2)}</span>
              <span className="dom-total">{row.total.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
