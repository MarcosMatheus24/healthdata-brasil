"use client";

import { useId, useMemo, useRef, useState } from "react";
import { compacto, int, mesLabel } from "@/lib/format";

/** Barras horizontais ordenadas — leitura rápida de ranking territorial. */
export function BarRanking({
  dados,
  unidade = "",
  destacar,
  maxItens = 10,
  formatar = int,
}: {
  dados: { rotulo: string; valor: number; sub?: string }[];
  unidade?: string;
  destacar?: string;
  maxItens?: number;
  formatar?: (n: number) => string;
}) {
  const lista = dados.slice(0, maxItens);
  const max = Math.max(...lista.map((d) => d.valor), 1);
  return (
    <ul className="space-y-1">
      {lista.map((d, i) => {
        const ativo = destacar === d.rotulo;
        return (
          <li
            key={d.rotulo}
            className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 ${
              ativo ? "bg-accent-wash" : "hover:bg-brand-wash/60"
            }`}
          >
            <span
              className={`mono flex h-6 w-6 items-center justify-center rounded-md text-[0.65rem] font-medium transition-colors ${
                i < 3 ? "bg-ink text-canvas" : "bg-canvas-deep text-ink-mute"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate text-[0.86rem] ${ativo ? "font-semibold text-accent" : "font-medium text-ink"}`}>
                  {d.rotulo}
                </span>
                {d.sub && <span className="mono shrink-0 text-[0.65rem] text-ink-mute">{d.sub}</span>}
              </div>
              <div className="mt-1.5 h-[6px] w-full overflow-hidden rounded-full bg-canvas-deep">
                <div
                  className={`bar-grow h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    ativo
                      ? "bg-gradient-to-r from-accent/70 to-accent"
                      : "bg-gradient-to-r from-brand-bright/70 to-brand group-hover:to-brand-bright"
                  }`}
                  style={{ width: `${Math.max(2, (d.valor / max) * 100)}%`, ["--i" as string]: i }}
                />
              </div>
            </div>
            <span className="mono text-right text-[0.8rem] font-medium tabular-nums text-ink">
              {formatar(d.valor)}
              <span className="ml-1 text-[0.6rem] font-normal text-ink-mute">{unidade}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Série temporal mensal em área — sazonalidade respiratória, com leitura ponto a ponto. */
export function SerieMensal({
  dados,
  altura = 220,
  largura = 900,
  cor = "var(--color-brand)",
}: {
  dados: { mes: string; valor: number }[];
  altura?: number;
  /** largura do viewBox: valores menores deixam os rótulos maiores em cartões estreitos */
  largura?: number;
  cor?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svg = useRef<SVGSVGElement>(null);
  const [foco, setFoco] = useState<number | null>(null);

  const w = largura;
  const h = altura;
  const pad = { l: 60, r: 14, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const geo = useMemo(() => {
    const max = Math.max(...dados.map((d) => d.valor), 1);
    const x = (i: number) => pad.l + (i / Math.max(1, dados.length - 1)) * innerW;
    const y = (v: number) => pad.t + innerH - (v / max) * innerH;
    // curva suave (Catmull-Rom → Bézier) em vez de segmentos retos
    const pts = dados.map((d, i) => [x(i), y(d.valor)] as const);
    let linha = pts.length ? `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}` : "";
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? p2;
      const t = 0.18;
      const c1x = p1[0] + (p2[0] - p0[0]) * t;
      const c1y = Math.min(pad.t + innerH, p1[1] + (p2[1] - p0[1]) * t);
      const c2x = p2[0] - (p3[0] - p1[0]) * t;
      const c2y = Math.min(pad.t + innerH, p2[1] - (p3[1] - p1[1]) * t);
      linha += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const area = pts.length
      ? `${linha} L${x(dados.length - 1).toFixed(1)},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z`
      : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
    return { max, x, y, linha, area, ticks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, h, w]);

  if (!dados.length) {
    return (
      <p className="mono py-10 text-center text-[0.72rem] uppercase tracking-[0.14em] text-ink-mute">
        Sem série temporal na amostra
      </p>
    );
  }

  const { x, y, linha, area, ticks } = geo;
  const passoRotulo = Math.max(1, Math.ceil(dados.length / 12));
  // a chave reinicia a animação de desenho quando o recorte muda
  const assinatura = `${dados.length}-${dados[0].mes}-${dados[dados.length - 1].valor}`;

  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const vx = ((e.clientX - r.left) / r.width) * w;
    const i = Math.round(((vx - pad.l) / innerW) * (dados.length - 1));
    setFoco(Math.max(0, Math.min(dados.length - 1, i)));
  };

  const pf = foco !== null ? dados[foco] : null;
  const tipW = 132;
  const tipX = foco !== null ? Math.min(w - pad.r - tipW, Math.max(pad.l, x(foco) - tipW / 2)) : 0;

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${w} ${h}`}
      className="w-full touch-none select-none"
      role="img"
      aria-label="Série mensal de notificações"
      onPointerMove={aoMover}
      onPointerLeave={() => setFoco(null)}
    >
      <defs>
        <linearGradient id={`area-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`linha-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--color-brand-bright)" />
          <stop offset="70%" stopColor={cor} />
          <stop offset="100%" stopColor="var(--color-accent)" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-line)"
            strokeWidth="1"
            strokeDasharray={t === 0 ? undefined : "3 5"}
          />
          <text x={pad.l - 10} y={y(t) + 3} textAnchor="end" className="mono" fontSize="10" fill="var(--color-ink-mute)">
            {compacto(t)}
          </text>
        </g>
      ))}

      <g key={assinatura}>
        <path d={area} fill={`url(#area-${uid})`} className="fade-in" />
        <path
          d={linha}
          fill="none"
          stroke={`url(#linha-${uid})`}
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="draw-line"
        />
      </g>

      {dados.map((d, i) =>
        i % passoRotulo === 0 ? (
          <text
            key={d.mes}
            x={x(i)}
            y={h - 8}
            textAnchor="middle"
            className="mono"
            fontSize="9.5"
            fill="var(--color-ink-mute)"
          >
            {mesLabel(d.mes)}
          </text>
        ) : null,
      )}

      {/* leitura interativa */}
      {pf && foco !== null && (
        <g pointerEvents="none" className="swap-in" key={foco}>
          <line
            x1={x(foco)}
            x2={x(foco)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke="var(--color-ink)"
            strokeOpacity="0.35"
            strokeDasharray="2 3"
          />
          <circle cx={x(foco)} cy={y(pf.valor)} r="9" fill={cor} opacity="0.15" />
          <circle cx={x(foco)} cy={y(pf.valor)} r="4.5" fill="var(--color-surface)" stroke={cor} strokeWidth="2.2" />
          <g transform={`translate(${tipX}, ${pad.t})`}>
            <rect width={tipW} height="40" rx="9" fill="var(--color-ink)" />
            <text x="12" y="16" className="mono" fontSize="9.5" fill="var(--color-canvas)" opacity="0.7">
              {mesLabel(pf.mes)}
            </text>
            <text x="12" y="31" className="mono" fontSize="12" fontWeight="600" fill="var(--color-canvas)">
              {int(pf.valor)} notif.
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/** Barras verticais por ano. */
export function BarrasAno({ dados }: { dados: { ano: string; valor: number }[] }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className="flex h-40 items-end gap-2">
      {dados.map((d, i) => (
        <div key={d.ano} className="group flex flex-1 flex-col items-center gap-2">
          <span className="mono translate-y-1 text-[0.65rem] text-ink-mute opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            {compacto(d.valor)}
          </span>
          <div className="relative flex w-full flex-1 items-end">
            <div
              className="bar-grow-y w-full rounded-t-md bg-gradient-to-t from-brand to-brand-bright transition-[height,filter] duration-500 group-hover:brightness-110"
              style={{ height: `${Math.max(3, (d.valor / max) * 100)}%`, ["--i" as string]: i }}
              title={`${d.ano}: ${int(d.valor)}`}
            />
          </div>
          <span className="mono text-[0.65rem] text-ink-mute">{d.ano.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}

/** Distribuição em barras empilhadas horizontais. */
export function Distribuicao({
  dados,
  cores = [
    "var(--color-brand)",
    "var(--color-brand-bright)",
    "var(--color-brand-muted)",
    "var(--color-accent)",
    "var(--color-line-strong)",
  ],
}: {
  dados: { categoria: string; contagem: number }[];
  cores?: string[];
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const total = dados.reduce((s, d) => s + d.contagem, 0) || 1;
  return (
    <div>
      <div className="flex h-4 w-full gap-[3px] overflow-hidden rounded-full">
        {dados.map((d, i) => (
          <div
            key={d.categoria}
            className="bar-grow h-full transition-[width,opacity] duration-500 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(d.contagem / total) * 100}%`,
              background: cores[i % cores.length],
              opacity: foco && foco !== d.categoria ? 0.3 : 1,
              ["--i" as string]: i,
            }}
            title={`${d.categoria}: ${int(d.contagem)}`}
            onMouseEnter={() => setFoco(d.categoria)}
            onMouseLeave={() => setFoco(null)}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-1 sm:grid-cols-2">
        {dados.map((d, i) => (
          <li
            key={d.categoria}
            onMouseEnter={() => setFoco(d.categoria)}
            onMouseLeave={() => setFoco(null)}
            className={`flex cursor-default items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[0.8rem] transition-colors ${
              foco === d.categoria ? "bg-canvas-deep" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cores[i % cores.length] }} />
              <span className="truncate text-ink-soft">{d.categoria}</span>
            </span>
            <span className="mono shrink-0 text-[0.72rem] font-medium text-ink">
              {((d.contagem / total) * 100).toFixed(1).replace(".", ",")}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Minigráfico de linha para cartões: só a forma da série, sem eixos. */
export function Sparkline({
  dados,
  cor = "var(--color-brand)",
  altura = 44,
}: {
  dados: { mes: string; valor: number }[];
  cor?: string;
  altura?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (dados.length < 2) return null;
  const w = 240;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const pts = dados.map((d, i) => [(i / (dados.length - 1)) * w, altura - 3 - (d.valor / max) * (altura - 6)] as const);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const ultimo = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${altura}`} className="h-11 w-full overflow-visible" aria-hidden preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sp-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${linha} L${w},${altura} L0,${altura} Z`} fill={`url(#sp-${uid})`} className="fade-in" />
      <path
        d={linha}
        fill="none"
        stroke={cor}
        strokeWidth="1.8"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className="draw-line"
      />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="2.6" fill={cor} className="fade-in" />
    </svg>
  );
}
