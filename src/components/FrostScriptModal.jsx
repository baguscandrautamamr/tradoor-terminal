import React, { useState } from 'react';

const PRESET_SCRIPTS = [
  {
    id: 'absorption',
    name: 'Orderflow Delta Absorption Detector',
    code: `// FrostScript v1.0 - Orderflow Absorption & Exhaustion
//@indicator("Delta Absorption", overlay=true)

let body = close - open;
let is_bull_absorb = body > 0 && delta < 0 && low < low[1];
let is_bear_exhaust = body < 0 && delta > 0 && high > high[1];

plot_signal(is_bull_absorb, "▲ ABSORB", color=#22D3EE, location="belowbar");
plot_signal(is_bear_exhaust, "▼ EXHAUST", color=#F472B6, location="abovebar");`,
  },
  {
    id: 'cvd_div',
    name: 'CVD Cumulative Delta Momentum',
    code: `// FrostScript v1.0 - Cumulative Volume Delta Regime
//@indicator("CVD Regime", overlay=true)

let cvd_ema = ema(cum_delta, 14);
let price_ema = ema(close, 20);
let bull_div = close < price_ema && cum_delta > cvd_ema;

plot_signal(bull_div, "▲ CVD DIV", color=#10B981, location="belowbar");`,
  },
];

export default function FrostScriptModal({ isOpen, onClose, customScript, setCustomScript }) {
  const [selectedId, setSelectedId] = useState(PRESET_SCRIPTS[0].id);
  const [code, setCode] = useState(customScript?.code || PRESET_SCRIPTS[0].code);
  const [name, setName] = useState(customScript?.name || PRESET_SCRIPTS[0].name);

  if (!isOpen) return null;

  const handleSelectPreset = (preset) => {
    setSelectedId(preset.id);
    setName(preset.name);
    setCode(preset.code);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="frost-modal" onClick={(e) => e.stopPropagation()}>
        <div className="frost-modal-header">
          <div>
            <h3>❄️ FROST SCRIPT // CUSTOM ORDERFLOW INDICATOR ENGINE</h3>
            <p>Tulis dan jalankan skrip indikator orderflow kustom langsung di atas chart (terinspirasi Tradoor Frost Script).</p>
          </div>
          <button className="btn-close-modal" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="frost-presets">
          {PRESET_SCRIPTS.map((p) => (
            <button
              key={p.id}
              className={`preset-btn ${selectedId === p.id ? 'active' : ''}`}
              onClick={() => handleSelectPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="frost-editor-wrap">
          <textarea
            className="frost-textarea"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="frost-modal-footer">
          <label className="frost-enable-toggle">
            <input
              type="checkbox"
              checked={customScript.enabled}
              onChange={(e) =>
                setCustomScript((prev) => ({ ...prev, enabled: e.target.checked, name, code }))
              }
            />
            <span>Aktifkan sinyal Frost Script di Chart utama</span>
          </label>
          <div className="frost-actions">
            <button
              className="btn-Compile"
              onClick={() => {
                setCustomScript({ enabled: true, name, code });
                onClose();
              }}
            >
              ⚡ Compile & Apply to Chart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
