import { useState } from 'react';

export interface Bar {
  key: string;
  label: string;
  detail: string;
  value: number;
  valueLabel: string;
  tooltip: string;
}

const ROW = 26;
const BAR = 14;
const LABEL_W = 230;
const VALUE_W = 80;
const WIDTH = 760;

/** Single-series horizontal bar chart. One accent color; values are direct-labelled. */
export function HorizontalBars({ title, bars, ariaLabel }: { title: string; bars: Bar[]; ariaLabel: string }) {
  const [hover, setHover] = useState<{ bar: Bar; x: number; y: number } | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const plotW = WIDTH - LABEL_W - VALUE_W;
  const height = bars.length * ROW + 4;

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      {bars.length === 0 ? (
        <p className="muted">No entries for this selection.</p>
      ) : (
        <div className="chart-body" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" style={{ maxWidth: WIDTH }} role="img" aria-label={ariaLabel}>
            <line x1={LABEL_W} x2={LABEL_W} y1={0} y2={height} className="chart-axis" />
            {bars.map((b, i) => {
              const y = i * ROW + (ROW - BAR) / 2;
              const w = Math.max(2, (b.value / max) * plotW);
              const r = Math.min(4, w / 2);
              const path = `M${LABEL_W},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${BAR - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z`;
              const active = hover?.bar.key === b.key;
              return (
                <g key={b.key}>
                  <text x={LABEL_W - 10} y={i * ROW + ROW / 2} className="chart-label" textAnchor="end" dominantBaseline="middle">
                    {b.label}
                  </text>
                  <path d={path} className={active ? 'chart-bar active' : 'chart-bar'} />
                  <text x={LABEL_W + w + 8} y={i * ROW + ROW / 2} className="chart-value" dominantBaseline="middle">
                    {b.valueLabel}
                  </text>
                  {/* hit target larger than the bar */}
                  <rect
                    x={0}
                    y={i * ROW}
                    width={WIDTH}
                    height={ROW}
                    fill="transparent"
                    onMouseMove={(ev) => {
                      const box = (ev.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setHover({ bar: b, x: ev.clientX - box.left, y: ev.clientY - box.top });
                    }}
                  />
                </g>
              );
            })}
          </svg>
          {hover && (
            <div className="tooltip" style={{ left: hover.x + 12, top: hover.y + 12 }} role="status">
              <div className="tooltip-title">{hover.bar.detail}</div>
              <div>{hover.bar.tooltip}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
