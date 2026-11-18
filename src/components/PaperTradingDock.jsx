import React, { useState } from 'react';

const JOURNAL_TAGS = [
  'Orderflow Absorption',
  'POC Bounce',
  'CVD Divergence',
  'VAH Breakout',
  'Liquidity Sweep',
  'Scalp DOM',
];

export default function PaperTradingDock({
  symbolConfig,
  lastPrice,
  balance,
  positions,
  limitOrders,
  journal,
  selectedLimitPrice,
  onPlaceOrder,
  onClosePosition,
  onReversePosition,
  onCancelOrder,
  onUpdateJournalNote,
}) {
  const [activeTab, setActiveTab] = useState('positions'); // 'positions' | 'orders' | 'journal'
  const [orderType, setOrderType] = useState('MARKET'); // 'MARKET' | 'LIMIT'
  const [leverage, setLeverage] = useState(20);
  const [marginUsd, setMarginUsd] = useState(500);
  const [limitPrice, setLimitPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');

  // Sync limit price when clicked from DOM or Chart
  React.useEffect(() => {
    if (selectedLimitPrice) {
      setOrderType('LIMIT');
      setLimitPrice(String(selectedLimitPrice));
    }
  }, [selectedLimitPrice]);

  const ts = symbolConfig?.tickSize || 1;
  const decimals = ts < 0.001 ? 4 : ts < 0.1 ? 3 : ts < 1 ? 2 : 1;

  const execPrice =
    orderType === 'LIMIT' && Number(limitPrice) > 0 ? Number(limitPrice) : lastPrice;
  const notionalUsd = marginUsd * leverage;
  const estQty = Number((notionalUsd / Math.max(execPrice, 0.0001)).toFixed(4));

  // Total unrealized PnL across all open positions
  const totalUnrealizedPnl = positions.reduce((acc, pos) => {
    const mark = pos.symbol === symbolConfig.symbol ? lastPrice : pos.markPrice || pos.entryPrice;
    const diff = pos.side === 'LONG' ? mark - pos.entryPrice : pos.entryPrice - mark;
    return acc + diff * pos.qty;
  }, 0);

  // Journal stats
  const wins = journal.filter((j) => j.pnl > 0).length;
  const winRate = journal.length > 0 ? Math.round((wins / journal.length) * 100) : 0;
  const realizedPnl = journal.reduce((s, j) => s + j.pnl, 0);

  const handleSubmit = (side) => {
    onPlaceOrder({
      symbol: symbolConfig.symbol,
      side,
      type: orderType,
      price: execPrice,
      qty: estQty,
      marginUsd: Number(marginUsd),
      leverage: Number(leverage),
      tp: tpPrice ? Number(tpPrice) : null,
      sl: slPrice ? Number(slPrice) : null,
    });
  };

  return (
    <div className="bottom-dock">
      {/* LEFT / CENTER: POSITIONS, OPEN ORDERS & TRADING JOURNAL */}
      <div className="dock-main">
        <div className="dock-header">
          <div className="dock-tabs">
            <button
              className={`dock-tab ${activeTab === 'positions' ? 'active' : ''}`}
              onClick={() => setActiveTab('positions')}
            >
              OPEN POSITIONS ({positions.length})
            </button>
            <button
              className={`dock-tab ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              LIMIT ORDERS ({limitOrders.length})
            </button>
            <button
              className={`dock-tab ${activeTab === 'journal' ? 'active' : ''}`}
              onClick={() => setActiveTab('journal')}
            >
              📓 TRADING JOURNAL ({journal.length})
            </button>
          </div>

          <div className="account-summary-pills">
            <span className="acc-pill">
              BALANCE: <b>${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
            </span>
            <span className="acc-pill">
              UNREALIZED PNL:{' '}
              <b className={totalUnrealizedPnl >= 0 ? 'text-bull' : 'text-bear'}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
              </b>
            </span>
            <span className="acc-pill">
              WIN RATE: <b className="text-cyan">{winRate}%</b>
            </span>
          </div>
        </div>

        <div className="dock-body">
          {activeTab === 'positions' && (
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>PAIR / SIDE</th>
                  <th>SIZE</th>
                  <th>ENTRY PRICE</th>
                  <th>MARK PRICE</th>
                  <th>LIQ. PRICE</th>
                  <th>MARGIN</th>
                  <th>UNREALIZED PNL (ROE%)</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      Belum ada posisi aktif. Gunakan panel Order di kanan atau klik harga pada DOM Ladder untuk simulasi Perpetual Futures.
                    </td>
                  </tr>
                ) : (
                  positions.map((pos) => {
                    const mark =
                      pos.symbol === symbolConfig.symbol ? lastPrice : pos.markPrice || pos.entryPrice;
                    const pnl =
                      (pos.side === 'LONG' ? mark - pos.entryPrice : pos.entryPrice - mark) *
                      pos.qty;
                    const roe = (pnl / Math.max(pos.marginUsd, 1)) * 100;
                    return (
                      <tr key={pos.id}>
                        <td>
                          <span className={`side-badge ${pos.side === 'LONG' ? 'long' : 'short'}`}>
                            {pos.side} {pos.leverage}x
                          </span>{' '}
                          <strong>{pos.symbol}</strong>
                        </td>
                        <td>{pos.qty}</td>
                        <td>{pos.entryPrice.toFixed(decimals)}</td>
                        <td>{mark.toFixed(decimals)}</td>
                        <td className="text-gold">{pos.liqPrice.toFixed(decimals)}</td>
                        <td>${pos.marginUsd.toFixed(0)}</td>
                        <td className={pnl >= 0 ? 'text-bull font-bold' : 'text-bear font-bold'}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} ({roe >= 0 ? '+' : ''}
                          {roe.toFixed(1)}%)
                        </td>
                        <td>
                          <div className="pos-actions">
                            <button
                              className="btn-mini btn-reverse"
                              onClick={() => onReversePosition(pos.id, mark)}
                            >
                              ⇄ Reverse
                            </button>
                            <button
                              className="btn-mini btn-close"
                              onClick={() => onClosePosition(pos.id, mark)}
                            >
                              ✕ Market Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'orders' && (
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>PAIR</th>
                  <th>SIDE</th>
                  <th>LIMIT PRICE</th>
                  <th>QTY</th>
                  <th>LEVERAGE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {limitOrders.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state">
                      Tidak ada Limit Order aktif. Aktifkan "1-Click" di DOM atau pilih mode LIMIT untuk memasang order antrean.
                    </td>
                  </tr>
                ) : (
                  limitOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td>{ord.timeStr}</td>
                      <td>
                        <strong>{ord.symbol}</strong>
                      </td>
                      <td>
                        <span className={`side-badge ${ord.side === 'LONG' ? 'long' : 'short'}`}>
                          {ord.side}
                        </span>
                      </td>
                      <td className="text-gold">{ord.price.toFixed(decimals)}</td>
                      <td>{ord.qty}</td>
                      <td>{ord.leverage}x</td>
                      <td>
                        <span className="status-open">OPEN IN BOOK</span>
                      </td>
                      <td>
                        <button
                          className="btn-mini btn-close"
                          onClick={() => onCancelOrder(ord.id)}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'journal' && (
            <div className="journal-container">
              <div className="journal-kpis">
                <div className="j-kpi">
                  <span>REALIZED PNL</span>
                  <strong className={realizedPnl >= 0 ? 'text-bull' : 'text-bear'}>
                    {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                  </strong>
                </div>
                <div className="j-kpi">
                  <span>WIN RATE</span>
                  <strong className="text-cyan">{winRate}%</strong>
                </div>
                <div className="j-kpi">
                  <span>CLOSED TRADES</span>
                  <strong>{journal.length}</strong>
                </div>
              </div>

              <table className="terminal-table">
                <thead>
                  <tr>
                    <th>CLOSED AT</th>
                    <th>PAIR / SIDE</th>
                    <th>ENTRY → EXIT</th>
                    <th>REALIZED PNL</th>
                    <th>STRATEGY TAG</th>
                    <th>JOURNAL NOTES</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.map((item) => (
                    <tr key={item.id}>
                      <td className="text-muted">{item.closedAt}</td>
                      <td>
                        <span className={`side-badge ${item.side === 'LONG' ? 'long' : 'short'}`}>
                          {item.side} {item.leverage}x
                        </span>{' '}
                        <b>{item.symbol}</b>
                      </td>
                      <td>
                        {item.entryPrice.toFixed(decimals)} → {item.exitPrice.toFixed(decimals)}
                      </td>
                      <td className={item.pnl >= 0 ? 'text-bull font-bold' : 'text-bear font-bold'}>
                        {item.pnl >= 0 ? '+' : ''}${item.pnl.toFixed(2)} ({item.roe.toFixed(1)}%)
                      </td>
                      <td>
                        <select
                          className="journal-tag-select"
                          value={item.tag}
                          onChange={(e) => onUpdateJournalNote(item.id, e.target.value, item.note)}
                        >
                          {JOURNAL_TAGS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="journal-note-input"
                          value={item.note}
                          placeholder="Tulis evaluasi setup..."
                          onChange={(e) => onUpdateJournalNote(item.id, item.tag, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: PERPETUAL ORDER EXECUTION TICKET */}
      <div className="order-ticket">
        <div className="ticket-top">
          <div className="ticket-type-switch">
            <button
              className={orderType === 'MARKET' ? 'active' : ''}
              onClick={() => setOrderType('MARKET')}
            >
              MARKET
            </button>
            <button
              className={orderType === 'LIMIT' ? 'active' : ''}
              onClick={() => {
                setOrderType('LIMIT');
                if (!limitPrice) setLimitPrice(lastPrice.toFixed(decimals));
              }}
            >
              LIMIT
            </button>
          </div>
          <div className="leverage-control">
            <span>LEV: <b>{leverage}x</b></span>
            <input
              type="range"
              min="1"
              max="100"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="ticket-fields">
          {orderType === 'LIMIT' && (
            <div className="field-group">
              <label>LIMIT PRICE ({symbolConfig.quote})</label>
              <input
                type="number"
                step={ts}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
          )}

          <div className="field-group">
            <label>MARGIN USDT (NOTIONAL: ${(marginUsd * leverage).toLocaleString()})</label>
            <div className="margin-input-row">
              <input
                type="number"
                min="10"
                step="50"
                value={marginUsd}
                onChange={(e) => setMarginUsd(Math.max(10, Number(e.target.value)))}
              />
              <div className="quick-pct-btns">
                {[100, 500, 1000, 2500].map((v) => (
                  <button key={v} onClick={() => setMarginUsd(v)}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tpsl-row">
            <div className="field-group">
              <label>TAKE PROFIT</label>
              <input
                type="number"
                placeholder="Optional"
                value={tpPrice}
                onChange={(e) => setTpPrice(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>STOP LOSS</label>
              <input
                type="number"
                placeholder="Optional"
                value={slPrice}
                onChange={(e) => setSlPrice(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ticket-buttons">
          <button className="btn-exec btn-long" onClick={() => handleSubmit('LONG')}>
            <span>BUY / LONG</span>
            <small>
              {estQty} {symbolConfig.base}
            </small>
          </button>
          <button className="btn-exec btn-short" onClick={() => handleSubmit('SHORT')}>
            <span>SELL / SHORT</span>
            <small>
              {estQty} {symbolConfig.base}
            </small>
          </button>
        </div>
      </div>
    </div>
  );
}
