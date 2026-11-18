import React, { useEffect, useRef, useState, useCallback } from 'react';
import { computeMarketProfile } from '../services/marketEngine';

export default function ChartCanvas({
  candles,
  symbolConfig,
  chartMode, // 'candles' | 'footprint' | 'tpo'
  indicators, // { ema20, ema50, vwap, bbands, volumeProfile, subPane: 'cvd' | 'volume' | 'oi' }
  activeTool, // 'crosshair' | 'trendline' | 'hline' | 'fib' | 'measure'
  drawings,
  setDrawings,
  positions,
  limitOrders,
  customScript,
  onChartClickPrice,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Viewport state: visible candle count and right-offset
  const [visibleCount, setVisibleCount] = useState(chartMode === 'footprint' ? 18 : 56);
  const [rightOffset, setRightOffset] = useState(0); // 0 = latest bar on right
  const [mousePos, setMousePos] = useState(null);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [draftDrawing, setDraftDrawing] = useState(null);
  const dragRef = useRef({ isDragging: false, startX: 0, startOffset: 0 });

  // Adjust default zoom when switching to/from Footprint mode so clusters are legible
  useEffect(() => {
    if (chartMode === 'footprint' && visibleCount > 26) {
      setVisibleCount(16);
    } else if (chartMode === 'candles' && visibleCount < 24) {
      setVisibleCount(52);
    }
  }, [chartMode]);

  const formatPrice = useCallback(
    (p) => {
      if (p === undefined || p === null || Number.isNaN(p)) return '--';
      const ts = symbolConfig?.tickSize || 1;
      const dec = ts < 0.001 ? 4 : ts < 0.1 ? 3 : ts < 1 ? 2 : 1;
      return Number(p).toFixed(dec);
    },
    [symbolConfig]
  );

  // Coordinate helpers stored for click/drag interaction
  const layoutRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !candles || candles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Layout dimensions
    const priceAxisWidth = 78;
    const timeAxisHeight = 26;
    const footerTableHeight = chartMode === 'footprint' ? 54 : 0;
    const subPaneHeight = Math.max(85, Math.floor((height - timeAxisHeight - footerTableHeight) * 0.2));
    const mainHeight = height - timeAxisHeight - footerTableHeight - subPaneHeight;
    const chartWidth = width - priceAxisWidth;

    // Background fill
    ctx.fillStyle = '#090C10';
    ctx.fillRect(0, 0, width, height);

    // Slice visible candles
    const endIdx = Math.max(10, candles.length - rightOffset);
    const startIdx = Math.max(0, endIdx - visibleCount);
    const slice = candles.slice(startIdx, endIdx);
    if (slice.length === 0) return;

    // Compute min/max price in visible slice
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 1;
    let minSub = Infinity;
    let maxSub = -Infinity;

    slice.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;

      const subVal =
        indicators.subPane === 'cvd'
          ? c.cumDelta
          : indicators.subPane === 'oi'
          ? c.openInterest
          : c.volume;
      if (subVal < minSub) minSub = subVal;
      if (subVal > maxSub) maxSub = subVal;
    });

    const pricePad = (maxPrice - minPrice) * 0.09 || 1;
    minPrice -= pricePad;
    maxPrice += pricePad;

    const priceToY = (p) => {
      return mainHeight - ((p - minPrice) / (maxPrice - minPrice)) * (mainHeight - 28) - 14;
    };
    const yToPrice = (y) => {
      return minPrice + ((mainHeight - 14 - y) / (mainHeight - 28)) * (maxPrice - minPrice);
    };

    const barSlot = chartWidth / Math.max(slice.length, 1);
    const indexToX = (i) => (i + 0.5) * barSlot;
    const xToIndex = (x) => Math.min(slice.length - 1, Math.max(0, Math.floor(x / barSlot)));

    layoutRef.current = {
      width,
      height,
      chartWidth,
      mainHeight,
      subPaneHeight,
      footerTableHeight,
      priceToY,
      yToPrice,
      indexToX,
      xToIndex,
      slice,
      startIdx,
    };

    // --- 1. GRID LINES ---
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
    ctx.lineWidth = 1;
    const gridSteps = 8;
    for (let i = 1; i < gridSteps; i++) {
      const y = Math.round((mainHeight / gridSteps) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
    }

    const vStep = Math.max(1, Math.floor(slice.length / 8));
    for (let i = 0; i < slice.length; i += vStep) {
      const x = Math.round(indexToX(i)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mainHeight + subPaneHeight);
      ctx.stroke();
    }

    // --- 2. SESSION VOLUME PROFILE / TPO BACKGROUND ---
    const profile =
      indicators.volumeProfile || chartMode === 'tpo' ? computeMarketProfile(slice, 26) : null;

    if (profile) {
      const maxBarWidth = chartMode === 'tpo' ? chartWidth * 0.34 : chartWidth * 0.18;
      // Shaded Value Area (VAH to VAL)
      const vahY = priceToY(profile.vahPrice);
      const valY = priceToY(profile.valPrice);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.045)';
      ctx.fillRect(0, vahY, chartWidth, valY - vahY);

      profile.rows.forEach((row, rIdx) => {
        const yTop = priceToY(row.high);
        const yBot = priceToY(row.low);
        const h = Math.max(2, yBot - yTop - 1);
        const isVA = rIdx >= profile.lowIdx && rIdx <= profile.highIdx;
        const totalW = (row.totalVol / profile.maxVol) * maxBarWidth;
        const upW = totalW * (row.upVol / Math.max(row.totalVol, 0.001));
        const downW = totalW - upW;

        // Draw right-aligned Volume Profile bars
        const rightAnchor = chartWidth - 2;
        ctx.fillStyle = isVA ? 'rgba(16, 185, 129, 0.28)' : 'rgba(16, 185, 129, 0.12)';
        ctx.fillRect(rightAnchor - totalW, yTop, upW, h);
        ctx.fillStyle = isVA ? 'rgba(244, 63, 94, 0.28)' : 'rgba(244, 63, 94, 0.12)';
        ctx.fillRect(rightAnchor - downW, yTop, downW, h);

        if (rIdx === profile.pocIdx) {
          ctx.strokeStyle = '#FACC15';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(rightAnchor - totalW, yTop, totalW, h);
        }

        // If TPO mode, draw TPO letter blocks on the left side of the chart
        if (chartMode === 'tpo' && row.tpoLetters.length > 0) {
          ctx.font = '600 9px "JetBrains Mono", monospace';
          row.tpoLetters.forEach((letter, lIdx) => {
            const lx = 14 + lIdx * 11;
            ctx.fillStyle =
              rIdx === profile.pocIdx
                ? 'rgba(250, 204, 21, 0.85)'
                : isVA
                ? 'rgba(56, 189, 248, 0.72)'
                : 'rgba(148, 163, 184, 0.42)';
            ctx.fillRect(lx, yTop + 1, 9.5, Math.max(8, h - 1));
            ctx.fillStyle = '#090C10';
            ctx.fillText(letter, lx + 1.5, yTop + Math.min(h - 2, 9));
          });
        }
      });

      // Draw VAH / POC / VAL reference lines
      const drawProfileLine = (price, label, color, dashed = false) => {
        const y = Math.round(priceToY(price)) + 0.5;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        if (dashed) ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText(`${label} ${formatPrice(price)}`, 10, y - 4);
        ctx.restore();
      };
      drawProfileLine(profile.vahPrice, 'VAH', 'rgba(56, 189, 248, 0.75)', true);
      drawProfileLine(profile.pocPrice, 'nPOC', '#FACC15', false);
      drawProfileLine(profile.valPrice, 'VAL', 'rgba(56, 189, 248, 0.75)', true);
    }

    // --- 3. RENDER CANDLES OR FOOTPRINT CLUSTERS ---
    slice.forEach((c, i) => {
      const cx = indexToX(i);
      const isBull = c.close >= c.open;
      const bullColor = '#10B981';
      const bearColor = '#F43F5E';
      const color = isBull ? bullColor : bearColor;

      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));

      if (chartMode === 'footprint') {
        // FOOTPRINT CLUSTER RENDERING (ExoCharts / Tradoor signature mode)
        const clusterW = Math.max(36, barSlot * 0.88);
        const leftX = cx - clusterW / 2;
        const candleBarW = 4;

        // Thin OHLC bar on the left edge of the cluster
        ctx.fillStyle = color;
        ctx.fillRect(leftX, highY, 1.5, Math.max(1, lowY - highY));
        ctx.fillRect(leftX - 1.5, bodyTop, candleBarW, bodyHeight);

        const cellAreaX = leftX + 6;
        const cellAreaW = clusterW - 8;
        const midX = cellAreaX + cellAreaW / 2;

        // Cluster background box
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.strokeStyle = isBull ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
        ctx.lineWidth = 1;
        ctx.fillRect(cellAreaX, highY - 2, cellAreaW, Math.max(14, lowY - highY + 4));
        ctx.strokeRect(cellAreaX, highY - 2, cellAreaW, Math.max(14, lowY - highY + 4));

        // Center divider line
        ctx.beginPath();
        ctx.moveTo(midX, highY - 2);
        ctx.lineTo(midX, lowY + 2);
        ctx.stroke();

        // Render each price level cluster inside the bar
        const levels = c.footprint || [];
        const rowH = Math.max(10, Math.min(18, (lowY - highY) / Math.max(levels.length, 1)));
        levels.forEach((lvl) => {
          const ly = priceToY(lvl.price);
          const intensity = Math.min(1, lvl.totalVol / Math.max(c.maxLevelVol, 1));
          const halfW = cellAreaW / 2 - 2;

          // Bid heat bar (left of center)
          const bidBarW = halfW * (lvl.bidVol / Math.max(c.maxLevelVol, 1));
          ctx.fillStyle = lvl.bidImbalance
            ? 'rgba(244, 63, 94, 0.45)'
            : `rgba(244, 63, 94, ${0.1 + intensity * 0.28})`;
          ctx.fillRect(midX - bidBarW, ly - rowH / 2 + 1, bidBarW, rowH - 2);

          // Ask heat bar (right of center)
          const askBarW = halfW * (lvl.askVol / Math.max(c.maxLevelVol, 1));
          ctx.fillStyle = lvl.askImbalance
            ? 'rgba(6, 182, 212, 0.48)'
            : `rgba(16, 185, 129, ${0.1 + intensity * 0.28})`;
          ctx.fillRect(midX + 1, ly - rowH / 2 + 1, askBarW, rowH - 2);

          // Point of Control (POC) gold outline
          if (lvl.isPOC) {
            ctx.strokeStyle = '#FACC15';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(cellAreaX + 1, ly - rowH / 2 + 0.5, cellAreaW - 2, rowH - 1);
          }

          // Show numbers when zoomed in enough
          if (barSlot >= 48 && rowH >= 10) {
            ctx.font = '600 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = lvl.bidImbalance ? '#FDA4AF' : '#94A3B8';
            ctx.fillText(Math.round(lvl.bidVol), midX - 3, ly + 3);

            ctx.textAlign = 'left';
            ctx.fillStyle = lvl.askImbalance ? '#67E8F9' : '#CBD5E1';
            ctx.fillText(Math.round(lvl.askVol), midX + 3, ly + 3);
          }
        });
        ctx.textAlign = 'left';
      } else {
        // STANDARD CANDLESTICK / TPO CANDLE OVERLAY
        const candleW = Math.max(2, Math.min(22, barSlot * (chartMode === 'tpo' ? 0.38 : 0.72)));
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, highY);
        ctx.lineTo(cx, lowY);
        ctx.stroke();

        ctx.fillStyle = chartMode === 'tpo' ? (isBull ? 'rgba(16,185,129,0.45)' : 'rgba(244,63,94,0.45)') : color;
        ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyHeight);
      }
    });

    // --- 4. MOVING AVERAGES / VWAP / BOLLINGER BANDS / CUSTOM FROST SCRIPT ---
    const drawIndicatorLine = (period, color, type = 'ema', lineWidth = 1.5) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      let started = false;
      const k = 2 / (period + 1);
      let ema = candles[0].close;
      let cumPV = 0;
      let cumV = 0;

      candles.slice(0, endIdx).forEach((c, idx) => {
        if (type === 'ema') {
          ema = c.close * k + ema * (1 - k);
        } else if (type === 'vwap') {
          const typ = (c.high + c.low + c.close) / 3;
          cumPV += typ * c.volume;
          cumV += c.volume;
          ema = cumPV / Math.max(cumV, 1);
        }
        if (idx >= startIdx) {
          const x = indexToX(idx - startIdx);
          const y = priceToY(ema);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
      ctx.restore();
    };

    if (indicators.ema20) drawIndicatorLine(20, '#38BDF8', 'ema', 1.5);
    if (indicators.ema50) drawIndicatorLine(50, '#A855F7', 'ema', 1.5);
    if (indicators.vwap) drawIndicatorLine(14, '#F59E0B', 'vwap', 1.6);

    if (indicators.bbands) {
      // 20-period Bollinger Bands (2 StdDev)
      const upperPts = [];
      const lowerPts = [];
      for (let i = startIdx; i < endIdx; i++) {
        const win = candles.slice(Math.max(0, i - 19), i + 1);
        const mean = win.reduce((s, x) => s + x.close, 0) / win.length;
        const variance = win.reduce((s, x) => s + (x.close - mean) ** 2, 0) / win.length;
        const sd = Math.sqrt(variance);
        const x = indexToX(i - startIdx);
        upperPts.push({ x, y: priceToY(mean + 2 * sd) });
        lowerPts.push({ x, y: priceToY(mean - 2 * sd) });
      }
      if (upperPts.length > 1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        upperPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.beginPath();
        lowerPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
      }
    }

    // Custom Frost Script Indicator Signal markers (if enabled)
    if (customScript?.enabled) {
      slice.forEach((c, i) => {
        if (i < 2) return;
        const prev = slice[i - 1];
        // Delta Absorption / Divergence signal from Frost Script
        const bullAbsorb = c.close > c.open && c.delta < 0 && c.low < prev.low;
        const bearAbsorb = c.close < c.open && c.delta > 0 && c.high > prev.high;
        if (bullAbsorb || bearAbsorb) {
          const x = indexToX(i);
          const y = bullAbsorb ? priceToY(c.low) + 14 : priceToY(c.high) - 14;
          ctx.fillStyle = bullAbsorb ? '#22D3EE' : '#F472B6';
          ctx.font = '700 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(bullAbsorb ? '▲ ABSORB' : '▼ EXHAUST', x, y);
          ctx.textAlign = 'left';
        }
      });
    }

    // --- 5. FOOTPRINT BAR STATISTICS MATRIX FOOTER ---
    if (chartMode === 'footprint') {
      const matrixY = mainHeight;
      ctx.fillStyle = '#0D1117';
      ctx.fillRect(0, matrixY, chartWidth, footerTableHeight);
      ctx.strokeStyle = '#1E293B';
      ctx.beginPath();
      ctx.moveTo(0, matrixY + 0.5);
      ctx.lineTo(width, matrixY + 0.5);
      ctx.stroke();

      const rows = ['DELTA', 'CVD', 'VOL'];
      rows.forEach((rLabel, rIdx) => {
        const ry = matrixY + rIdx * 18;
        ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
        ctx.beginPath();
        ctx.moveTo(0, ry + 18);
        ctx.lineTo(chartWidth, ry + 18);
        ctx.stroke();

        slice.forEach((c, i) => {
          const x = indexToX(i);
          const cellW = barSlot;
          let val = 0;
          if (rIdx === 0) val = c.delta;
          else if (rIdx === 1) val = c.cumDelta;
          else val = c.volume;

          if (rIdx === 0) {
            ctx.fillStyle =
              val >= 0 ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)';
            ctx.fillRect(x - cellW / 2 + 1, ry + 1, cellW - 2, 16);
          }

          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillStyle =
            rIdx === 2 ? '#94A3B8' : val >= 0 ? '#34D399' : '#FB7185';
          ctx.textAlign = 'center';
          const textVal =
            Math.abs(val) >= 1000 ? `${(val / 1000).toFixed(1)}K` : Math.round(val);
          if (cellW >= 32) {
            ctx.fillText(textVal, x, ry + 12);
          }
        });

        // Label in right axis area
        ctx.fillStyle = '#0B0F17';
        ctx.fillRect(chartWidth, ry, priceAxisWidth, 18);
        ctx.fillStyle = '#64748B';
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(rLabel, chartWidth + 8, ry + 12);
      });
    }

    // --- 6. SUB-PANE: VOLUME / CUMULATIVE VOLUME DELTA (CVD) / OPEN INTEREST ---
    const subTop = mainHeight + footerTableHeight;
    ctx.fillStyle = '#070A0E';
    ctx.fillRect(0, subTop, chartWidth, subPaneHeight);
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(0, subTop + 0.5);
    ctx.lineTo(width, subTop + 0.5);
    ctx.stroke();

    // Sub-pane title
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    const subTitle =
      indicators.subPane === 'cvd'
        ? 'ORDERFLOW CVD (CUMULATIVE VOLUME DELTA)'
        : indicators.subPane === 'oi'
        ? 'AGGREGATED OPEN INTEREST (CONTRACTS)'
        : 'SESSION VOLUME + DELTA BAR';
    ctx.fillText(subTitle, 10, subTop + 14);

    slice.forEach((c, i) => {
      const x = indexToX(i);
      const bw = Math.max(2, Math.min(18, barSlot * 0.68));
      if (indicators.subPane === 'volume') {
        const h = (c.volume / Math.max(maxVol, 1)) * (subPaneHeight - 24);
        const y = subTop + subPaneHeight - h;
        ctx.fillStyle =
          c.close >= c.open ? 'rgba(16, 185, 129, 0.55)' : 'rgba(244, 63, 94, 0.55)';
        ctx.fillRect(x - bw / 2, y, bw, h);
      } else {
        const val = indicators.subPane === 'cvd' ? c.cumDelta : c.openInterest;
        const norm = (val - minSub) / Math.max(maxSub - minSub, 1);
        const y = subTop + subPaneHeight - 10 - norm * (subPaneHeight - 28);
        if (indicators.subPane === 'cvd') {
          const zeroNorm = (0 - minSub) / Math.max(maxSub - minSub, 1);
          const zeroY = Math.min(
            subTop + subPaneHeight - 6,
            Math.max(subTop + 18, subTop + subPaneHeight - 10 - zeroNorm * (subPaneHeight - 28))
          );
          ctx.fillStyle = c.delta >= 0 ? '#10B981' : '#F43F5E';
          ctx.fillRect(x - bw / 2, Math.min(y, zeroY), bw, Math.max(2, Math.abs(zeroY - y)));
        } else {
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(x - bw / 2, y, bw, subTop + subPaneHeight - y);
        }
      }
    });

    // --- 7. USER DRAWINGS (TRENDLINES, HORIZONTAL RAYS, FIBONACCI, MEASURE) ---
    const allDrawings = draftDrawing ? [...drawings, draftDrawing] : drawings;
    allDrawings.forEach((d) => {
      ctx.save();
      if (d.type === 'hline') {
        const y = Math.round(priceToY(d.price)) + 0.5;
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        ctx.fillStyle = '#0284C7';
        ctx.fillRect(chartWidth - 78, y - 9, 76, 18);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText(`SR ${formatPrice(d.price)}`, chartWidth - 74, y + 3);
      } else if (d.type === 'trendline' && d.p2) {
        const x1 = indexToX(d.p1.candleIdx - startIdx);
        const y1 = priceToY(d.p1.price);
        const x2 = indexToX(d.p2.candleIdx - startIdx);
        const y2 = priceToY(d.p2.price);
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
        ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.type === 'fib' && d.p2) {
        const x1 = Math.min(indexToX(d.p1.candleIdx - startIdx), indexToX(d.p2.candleIdx - startIdx));
        const x2 = Math.max(indexToX(d.p1.candleIdx - startIdx), indexToX(d.p2.candleIdx - startIdx));
        const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const diff = d.p2.price - d.p1.price;
        fibLevels.forEach((lvl) => {
          const p = d.p1.price + diff * lvl;
          const y = priceToY(p);
          ctx.strokeStyle = lvl === 0.5 || lvl === 0.618 ? '#FACC15' : 'rgba(56, 189, 248, 0.65)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1, y);
          ctx.lineTo(Math.max(x2, x1 + 90), y);
          ctx.stroke();
          ctx.fillStyle = '#94A3B8';
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillText(`${(lvl * 100).toFixed(1)}% (${formatPrice(p)})`, x1 + 4, y - 3);
        });
      } else if (d.type === 'measure' && d.p2) {
        const x1 = indexToX(d.p1.candleIdx - startIdx);
        const y1 = priceToY(d.p1.price);
        const x2 = indexToX(d.p2.candleIdx - startIdx);
        const y2 = priceToY(d.p2.price);
        const pct = (((d.p2.price - d.p1.price) / d.p1.price) * 100).toFixed(2);
        const bars = Math.abs(d.p2.candleIdx - d.p1.candleIdx);
        ctx.fillStyle =
          d.p2.price >= d.p1.price ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)';
        ctx.strokeStyle = d.p2.price >= d.p1.price ? '#10B981' : '#F43F5E';
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.fillStyle = '#0F172A';
        ctx.fillRect((x1 + x2) / 2 - 58, Math.min(y1, y2) - 22, 116, 18);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${pct}% | ${bars} bars`, (x1 + x2) / 2, Math.min(y1, y2) - 9);
        ctx.textAlign = 'left';
      }
      ctx.restore();
    });

    // --- 8. ACTIVE PAPER TRADING POSITIONS & LIMIT ORDERS ON CHART ---
    const lastCandle = candles[candles.length - 1];
    positions
      .filter((pos) => pos.symbol === symbolConfig.symbol)
      .forEach((pos) => {
        const y = Math.round(priceToY(pos.entryPrice)) + 0.5;
        if (y > 0 && y < mainHeight) {
          const isLong = pos.side === 'LONG';
          const pnl =
            (isLong ? lastCandle.close - pos.entryPrice : pos.entryPrice - lastCandle.close) *
            pos.qty;
          ctx.save();
          ctx.strokeStyle = isLong ? '#10B981' : '#F43F5E';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();

          const badgeText = `${pos.side} ${pos.qty} @ ${formatPrice(pos.entryPrice)} | ${
            pnl >= 0 ? '+' : ''
          }$${pnl.toFixed(2)}`;
          ctx.font = '700 10px "JetBrains Mono", monospace';
          const tw = ctx.measureText(badgeText).width + 14;
          ctx.fillStyle = isLong ? '#065F46' : '#881337';
          ctx.fillRect(14, y - 10, tw, 19);
          ctx.strokeStyle = isLong ? '#10B981' : '#F43F5E';
          ctx.setLineDash([]);
          ctx.strokeRect(14, y - 10, tw, 19);
          ctx.fillStyle = '#F8FAFC';
          ctx.fillText(badgeText, 21, y + 3);
          ctx.restore();
        }
      });

    limitOrders
      .filter((ord) => ord.symbol === symbolConfig.symbol)
      .forEach((ord) => {
        const y = Math.round(priceToY(ord.price)) + 0.5;
        if (y > 0 && y < mainHeight) {
          ctx.save();
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();
          ctx.fillStyle = '#78350F';
          ctx.fillRect(14, y - 8, 145, 16);
          ctx.fillStyle = '#FDE68A';
          ctx.font = '600 9px "JetBrains Mono", monospace';
          ctx.fillText(`LIMIT ${ord.side} ${ord.qty} @ ${formatPrice(ord.price)}`, 19, y + 3);
          ctx.restore();
        }
      });

    // --- 9. LIVE PRICE LINE + RIGHT PRICE AXIS + BOTTOM TIME AXIS ---
    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(chartWidth, 0, priceAxisWidth, height);
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(chartWidth + 0.5, 0);
    ctx.lineTo(chartWidth + 0.5, height);
    ctx.stroke();

    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748B';
    for (let i = 1; i < gridSteps; i++) {
      const y = (mainHeight / gridSteps) * i;
      const p = yToPrice(y);
      ctx.fillText(formatPrice(p), chartWidth + 8, y + 3);
    }

    // Current Last Price horizontal line & glowing tag
    const lastY = Math.max(10, Math.min(mainHeight - 10, priceToY(lastCandle.close)));
    const isLastBull = lastCandle.close >= lastCandle.open;
    ctx.save();
    ctx.strokeStyle = isLastBull ? 'rgba(16, 185, 129, 0.65)' : 'rgba(244, 63, 94, 0.65)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, lastY);
    ctx.lineTo(chartWidth, lastY);
    ctx.stroke();
    ctx.fillStyle = isLastBull ? '#10B981' : '#F43F5E';
    ctx.fillRect(chartWidth + 1, lastY - 10, priceAxisWidth - 2, 20);
    ctx.fillStyle = '#06080B';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.fillText(formatPrice(lastCandle.close), chartWidth + 7, lastY + 4);
    ctx.restore();

    // Bottom Time Axis
    const timeAxisY = height - timeAxisHeight;
    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(0, timeAxisY, width, timeAxisHeight);
    ctx.strokeStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(0, timeAxisY + 0.5);
    ctx.lineTo(width, timeAxisY + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < slice.length; i += vStep) {
      const x = indexToX(i);
      const d = new Date(slice[i].time);
      const tStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      ctx.fillText(tStr, x, timeAxisY + 16);
    }
    ctx.textAlign = 'left';

    // --- 10. CROSSHAIR OVERLAY ---
    if (mousePos && mousePos.x < chartWidth && mousePos.y < height - timeAxisHeight) {
      const snapIdx = xToIndex(mousePos.x);
      const snapX = Math.round(indexToX(snapIdx)) + 0.5;
      const snapY = Math.round(mousePos.y) + 0.5;

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(snapX, 0);
      ctx.lineTo(snapX, height - timeAxisHeight);
      ctx.moveTo(0, snapY);
      ctx.lineTo(chartWidth, snapY);
      ctx.stroke();

      if (mousePos.y < mainHeight) {
        const hoverPrice = yToPrice(mousePos.y);
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(chartWidth + 1, snapY - 9, priceAxisWidth - 2, 18);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.fillText(formatPrice(hoverPrice), chartWidth + 7, snapY + 3);
      }
      ctx.restore();
    }
  }, [
    candles,
    symbolConfig,
    chartMode,
    indicators,
    visibleCount,
    rightOffset,
    mousePos,
    drawings,
    draftDrawing,
    positions,
    limitOrders,
    customScript,
    formatPrice,
  ]);

  // Mouse handlers for Pan, Zoom, Crosshair, and Drawing tools
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.12 : 0.88;
    const minBars = chartMode === 'footprint' ? 6 : 14;
    const maxBars = chartMode === 'footprint' ? 32 : 110;
    setVisibleCount((prev) => Math.min(maxBars, Math.max(minBars, Math.round(prev * delta))));
  };

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const layout = layoutRef.current;
    if (!layout || x > layout.chartWidth) return;

    const price = layout.yToPrice(y);
    const localIdx = layout.xToIndex(x);
    const globalIdx = layout.startIdx + localIdx;

    if (activeTool === 'hline') {
      setDrawings((prev) => [...prev, { id: Date.now(), type: 'hline', price }]);
      return;
    }

    if (['trendline', 'fib', 'measure'].includes(activeTool)) {
      if (!draftDrawing) {
        setDraftDrawing({
          id: Date.now(),
          type: activeTool,
          p1: { candleIdx: globalIdx, price },
          p2: { candleIdx: globalIdx, price },
        });
      } else {
        setDrawings((prev) => [
          ...prev,
          { ...draftDrawing, p2: { candleIdx: globalIdx, price } },
        ]);
        setDraftDrawing(null);
      }
      return;
    }

    if (e.shiftKey && onChartClickPrice) {
      onChartClickPrice(Number(formatPrice(price)));
      return;
    }

    dragRef.current = { isDragging: true, startX: x, startOffset: rightOffset };
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const layout = layoutRef.current;
    if (!layout) return;

    const localIdx = layout.xToIndex(x);
    if (layout.slice[localIdx]) {
      setHoveredCandle(layout.slice[localIdx]);
    }

    if (draftDrawing) {
      const price = layout.yToPrice(y);
      const globalIdx = layout.startIdx + localIdx;
      setDraftDrawing((prev) => (prev ? { ...prev, p2: { candleIdx: globalIdx, price } } : null));
      return;
    }

    if (dragRef.current.isDragging) {
      const dx = x - dragRef.current.startX;
      const barShift = Math.round(dx / (layout.chartWidth / visibleCount));
      const maxOffset = Math.max(0, candles.length - visibleCount);
      setRightOffset(Math.min(maxOffset, Math.max(0, dragRef.current.startOffset + barShift)));
    }
  };

  const handleMouseUp = () => {
    dragRef.current.isDragging = false;
  };

  const activeBar = hoveredCandle || candles[candles.length - 1];

  return (
    <div
      ref={containerRef}
      className="chart-canvas-wrapper"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        dragRef.current.isDragging = false;
        setMousePos(null);
      }}
    >
      {/* Top-Left OHLC + Orderflow HUD Overlay */}
      {activeBar && (
        <div className="chart-hud-overlay">
          <div className="hud-row">
            <span className="hud-symbol">{symbolConfig.symbol}</span>
            <span className="hud-mode-tag">{chartMode.toUpperCase()} ENGINE</span>
            <span className="hud-metric">
              O <b>{formatPrice(activeBar.open)}</b>
            </span>
            <span className="hud-metric">
              H <b>{formatPrice(activeBar.high)}</b>
            </span>
            <span className="hud-metric">
              L <b>{formatPrice(activeBar.low)}</b>
            </span>
            <span className="hud-metric">
              C{' '}
              <b className={activeBar.close >= activeBar.open ? 'text-bull' : 'text-bear'}>
                {formatPrice(activeBar.close)}
              </b>
            </span>
            <span className="hud-metric">
              VOL <b>{activeBar.volume?.toFixed(1)}</b>
            </span>
            <span className="hud-metric">
              DELTA{' '}
              <b className={activeBar.delta >= 0 ? 'text-bull' : 'text-bear'}>
                {activeBar.delta >= 0 ? `+${activeBar.delta}` : activeBar.delta}
              </b>
            </span>
            <span className="hud-metric">
              POC <b className="text-gold">{formatPrice(activeBar.pocPrice)}</b>
            </span>
          </div>
          <div className="hud-indicators-row">
            {indicators.ema20 && <span className="ind-pill ema20">EMA 20</span>}
            {indicators.ema50 && <span className="ind-pill ema50">EMA 50</span>}
            {indicators.vwap && <span className="ind-pill vwap">Session VWAP</span>}
            {indicators.bbands && <span className="ind-pill bbands">BB (20, 2)</span>}
            {indicators.volumeProfile && <span className="ind-pill vp">Volume Profile (VAH/POC/VAL)</span>}
            {customScript?.enabled && (
              <span className="ind-pill frost">⚡ FrostScript: {customScript.name}</span>
            )}
            <span className="hud-hint">Scroll: Zoom • Drag: Pan • Shift+Click: Pick Limit Price</span>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="chart-canvas-el" />
    </div>
  );
}
