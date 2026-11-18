import React, { useState } from 'react';

export default function OrderFlowTape({ trades, liquidations, symbolConfig }) {
  const [tab, setTab] = useState('all'); // 'all' | 'whales' | 'liquidations'
  const ts = symbolConfig?.tickSize || 1;
  const decimals = ts < 0.001 ? 4 : ts < 0.1 ? 3 : ts < 1 ? 2 : 1;

  const filteredTrades =
    tab === 'whales' ? trades.filter((t) => t.usdValue >= 15000) : trades;

  return (
    <div className="panel tape-panel">
      <div className="panel-header">
        <div className="tape-tabs">
          <button
            className={`tape-tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            TAPE ({trades.length})
          </button>
          <button
            className={`tape-tab ${tab === 'whales' ? 'active' : ''}`}
            onClick={() => setTab('whales')}
          >
            🐋 WHALES
          </button>
          <button
            className={`tape-tab ${tab === 'liquidations' ? 'active' : ''}`}
            onClick={() => setTab('liquidations')}
          >
            💀 LIQS ({liquidations.length})
          </button>
        </div>
      </div>

      {tab !== 'liquidations' ? (
        <div className="tape-list">
          <div className="dom-table-head">
            <span>PRICE</span>
            <span>SIZE</span>
            <span>VALUE</span>
            <span>TIME</span>
          </div>
          <div className="tape-scroll">
            {filteredTrades.map((t) => (
              <div
                key={t.id}
                className={`tape-row ${t.side === 'BUY' ? 'buy-tape' : 'sell-tape'} ${
                  t.usdValue >= 25000 ? 'whale-highlight' : ''
                }`}
              >
                <span className={t.side === 'BUY' ? 'text-bull' : 'text-bear'}>
                  {t.side === 'BUY' ? '▲' : '▼'} {Number(t.price).toFixed(decimals)}
                </span>
                <span>{Number(t.size).toFixed(3)}</span>
                <span className="tape-usd">
                  ${t.usdValue >= 1000 ? `${(t.usdValue / 1000).toFixed(1)}K` : t.usdValue.toFixed(0)}
                </span>
                <span className="text-muted">{t.timeStr}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="tape-list">
          <div className="dom-table-head">
            <span>EXCH / PAIR</span>
            <span>SIDE</span>
            <span>PRICE</span>
            <span>LIQ USD</span>
          </div>
          <div className="tape-scroll">
            {liquidations.map((liq) => (
              <div
                key={liq.id}
                className={`tape-row liq-row ${liq.side === 'LONG' ? 'long-liq' : 'short-liq'}`}
              >
                <span className="liq-pair">
                  <em className="exch-mini">{liq.exchange}</em> {liq.symbol}
                </span>
                <span className={liq.side === 'LONG' ? 'text-bear' : 'text-bull'}>
                  {liq.side} LIQ
                </span>
                <span>{Number(liq.price).toFixed(decimals)}</span>
                <strong className="liq-amount">${(liq.usdValue / 1000).toFixed(1)}K</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
