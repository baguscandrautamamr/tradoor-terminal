# TRADOOR // High-Performance Crypto Orderflow & Trading Terminal (React + Vite)

Implementasi **React + Vite** modern yang mengadopsi fitur-fitur utama dari [tradoor-terminal/tradoor](https://github.com/tradoor-terminal/tradoor):

## Fitur Utama
1. **3 Mode Charting Orderflow**:
   - **Candles (TradingView Style)**: Candlestick interaktif dengan zoom/pan, Volume Profile (VPVR: `VAH`, `nPOC`, `VAL`), `EMA 20`, `EMA 50`, `Session VWAP`, dan `Bollinger Bands`.
   - **Footprint / Cluster Chart (ExoCharts / Tradoor Style)**: Menampilkan volume `Bid x Ask` di setiap level harga dalam candle, sorotan *diagonal imbalance*, outline *Point of Control (POC)* per candle, dan matriks tabel bawah (`DELTA`, `CVD`, `VOL`).
   - **TPO Market Profile**: Menampilkan distribusi huruf TPO (`A, B, C, D...`), area nilai 70% (`VAH` - `VAL`), dan `nPOC`.
2. **Multi-Exchange & Multi-Pair Crypto Feed**:
   - Streaming langsung via WebSocket Binance (`aggTrade`) dengan fallback otomatis ke *High-Frequency Synthetic Orderflow Stream* jika koneksi WS diblokir jaringan.
   - Pilihan bursa (`Binance Perp`, `Bybit Linear`, `OKX Swap`, `Hyperliquid`, `Bitget`) dan pasangan kripto (`BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT`, `SUIUSDT`, `DOGEUSDT`, `HYPEUSDT`).
3. **Depth of Market (DOM Ladder) & Orderflow Tape**:
   - L2 Orderbook dengan indikator *Bid/Ask Imbalance %*, deteksi *Liquidity Wall*, dan fitur **1-Click Limit Order** langsung dari baris harga DOM.
   - *Real-time Time & Sales Tape*, filter **Whales (`>$15K`)**, dan **Live Liquidations Feed (`LONG LIQ` / `SHORT LIQ`)**.
4. **Frost Script Custom Indicator Editor**:
   - Editor skrip indikator kustom untuk mendeteksi *Orderflow Delta Absorption* dan *CVD Divergence* di atas chart.
5. **Perpetual Futures Paper Trading & Trading Journal**:
   - Simulasi eksekusi `Market` & `Limit` order dengan *Leverage* `1x–100x`, kalkulasi *Unrealized PnL (ROE%)*, *Liquidation Price*, tombol *Reverse / Market Close*, serta **Trading Journal** lengkap dengan tag strategi dan catatan evaluasi.

## Cara Menjalankan
```bash
npm install
npm run dev
```
