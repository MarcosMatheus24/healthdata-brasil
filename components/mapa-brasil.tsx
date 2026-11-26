"use client";

import { useEffect, useMemo, useState } from "react";
import type { LinhaIndicador, UF } from "@/lib/types";
import { int, pct } from "@/lib/format";

type GeoFeature = {
  properties: { codarea: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

const W = 720;
const H = 720;

/** Projeção de Mercator normalizada para o bounding box do Brasil. */
function criarProjecao(features: GeoFeature[]) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  // Mercator em "graus equivalentes": sem essa conversão, o eixo y fica em
  // radianos (~0,7) e a escala calculada a partir da longitude (~41°) achata o mapa.
  const merc = (lat: number) =>
    (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;

  for (const f of features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys as number[][][][]) {
      for (const ring of poly) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          const y = merc(lat);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  const pad = 16;
  const scale = Math.min((W - pad * 2) / (maxLon - minLon), (H - pad * 2) / (maxY - minY));
  const offX = (W - (maxLon - minLon) * scale) / 2;
  const offY = (H - (maxY - minY) * scale) / 2;

  return (lon: number, lat: number): [number, number] => [
    offX + (lon - minLon) * scale,
    H - (offY + (merc(lat) - minY) * scale),
  ];
}

function pathDeFeature(f: GeoFeature, proj: (lon: number, lat: number) => [number, number]) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const partes: string[] = [];
  for (const poly of polys as number[][][][]) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = proj(lon, lat);
        partes.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
      });
      partes.push("Z");
    }
  }
  return partes.join(" ");
}

export function MapaBrasil({
  ufs,
  linhas,
  metrica,
  selecionado,
  onSelecionar,
}: {
  ufs: UF[];
  linhas: LinhaIndicador[];
  metrica: "taxa" | "absoluto";
  selecionado: string | null;
  onSelecionar: (sigla: string | null) => void;
}) {
  const [geo, setGeo] = useState<GeoFeature[] | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/geo/ufs.json")
      .then((r) => r.json())
      .then((d) => ativo && setGeo(d.features as GeoFeature[]))
      .catch(() => setGeo([]));
    return () => {
      ativo = false;
    };
  }, []);

  const porCodigo = useMemo(() => {
    const mapa = new Map<string, LinhaIndicador>();
    for (const l of linhas) if (l.ufCodigo) mapa.set(l.ufCodigo, l);
    return mapa;
  }, [linhas]);

  const siglaPorCodigo = useMemo(() => new Map(ufs.map((u) => [u.codigo, u])), [ufs]);

  const max = useMemo(() => {
    const vals = linhas.map((l) => (metrica === "taxa" ? l.taxaPor100Mil ?? 0 : l.notificacoesEstimadas));
    return Math.max(...vals, 1);
  }, [linhas, metrica]);

  const paths = useMemo(() => {
    if (!geo?.length) return [];
    const proj = criarProjecao(geo);
    return geo.map((f) => ({
      codigo: f.properties.codarea,
      d: pathDeFeature(f, proj),
    }));
  }, [geo]);

  const cor = (valor: number) => {
    const t = Math.min(1, Math.max(0, valor / max));
    // rampa sequencial de um só matiz (névoa → cobalto); nunca vermelho de "risco"
    const stops = [
      [232, 236, 246],
      [201, 211, 245],
      [152, 172, 241],
      [98, 126, 236],
      [50, 82, 216],
      [22, 42, 148],
    ];
    const pos = t * (stops.length - 1);
    const i = Math.floor(pos);
    const f2 = pos - i;
    const a = stops[i];
    const b = stops[Math.min(stops.length - 1, i + 1)];
    const rgb = a.map((c, k) => Math.round(c + (b[k] - c) * f2));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  };

  const ativo = hover ?? selecionado;
  const linhaAtiva = ativo ? linhas.find((l) => l.ufSigla === ativo) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div className="relative">
        {!geo && (
          <div className="relative flex h-[420px] flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border border-dashed border-line-strong">
            <div className="scanline absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-brand/10 to-transparent" />
            <div className="w-48 space-y-2">
              <div className="skeleton h-2 w-full" />
              <div className="skeleton h-2 w-2/3" />
            </div>
            <p className="mono text-[0.68rem] uppercase tracking-[0.16em] text-ink-mute">
              Carregando malha do IBGE…
            </p>
          </div>
        )}
        {geo && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label="Mapa coroplético das unidades da federação"
            onMouseLeave={() => setHover(null)}
          >
            <g>
              {paths.map((p, i) => {
                const l = porCodigo.get(p.codigo);
                const uf = siglaPorCodigo.get(p.codigo);
                const valor = l ? (metrica === "taxa" ? l.taxaPor100Mil ?? 0 : l.notificacoesEstimadas) : 0;
                const sel = selecionado === uf?.sigla;
                return (
                  <path
                    key={p.codigo}
                    d={p.d}
                    fill={l ? cor(valor) : "url(#hatch)"}
                    stroke="var(--color-surface)"
                    strokeWidth={1}
                    style={{ ["--i" as string]: i }}
                    className={`map-state cursor-pointer outline-none transition-[fill,opacity] duration-500 ${
                      ativo && ativo !== uf?.sigla ? "opacity-70" : "opacity-100"
                    }`}
                    tabIndex={0}
                    aria-label={uf ? `${uf.nome}: ${l ? int(l.notificacoesEstimadas) + " notificações estimadas" : "sem dados"}` : p.codigo}
                    onFocus={() => setHover(uf?.sigla ?? null)}
                    onBlur={() => setHover(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelecionar(sel ? null : uf?.sigla ?? null);
                      }
                    }}
                    onMouseEnter={() => setHover(uf?.sigla ?? null)}
                    onClick={() => onSelecionar(sel ? null : uf?.sigla ?? null)}
                  >
                    <title>{uf ? `${uf.nome} — ${l ? int(l.notificacoesEstimadas) : "sem dados"}` : p.codigo}</title>
                  </path>
                );
              })}
            </g>
            {/* contornos por cima: hover (tinta) e seleção (acento tracejado em movimento) */}
            <g pointerEvents="none">
              {paths.map((p) => {
                const sigla = siglaPorCodigo.get(p.codigo)?.sigla;
                if (sigla !== hover && sigla !== selecionado) return null;
                const sel = sigla === selecionado;
                return (
                  <g key={`o-${p.codigo}`}>
                    <path
                      d={p.d}
                      fill="none"
                      stroke={sel ? "var(--color-accent)" : "var(--color-ink)"}
                      strokeWidth={sel ? 3.2 : 2}
                      strokeLinejoin="round"
                      style={{ filter: "drop-shadow(0 4px 10px rgb(11 19 36 / 0.35))" }}
                    />
                    {sel && (
                      <path d={p.d} fill="none" stroke="var(--color-surface)" strokeWidth="1.2" className="marching" />
                    )}
                  </g>
                );
              })}
            </g>
            <defs>
              <pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-line-strong)" strokeWidth="1.4" />
              </pattern>
            </defs>
          </svg>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="mono text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">0</span>
            <div className="flex h-2.5 w-44 overflow-hidden rounded-full">
              {Array.from({ length: 24 }).map((_, i) => (
                <span key={i} className="h-full flex-1" style={{ background: cor((i / 23) * max) }} />
              ))}
            </div>
            <span className="mono text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
              {metrica === "taxa" ? `${int(max)} /100 mil` : `${int(max)} notif.`}
            </span>
          </div>
          <span className="mono flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
            <span className="inline-block h-2 w-4 border border-line-strong" style={{ background: "repeating-linear-gradient(45deg, var(--color-line-strong) 0 1px, transparent 1px 4px)" }} />
            sem dados
          </span>
        </div>
      </div>

      <div className="card p-6 lg:sticky lg:top-24 lg:self-start">
        {linhaAtiva ? (
          <div key={linhaAtiva.ufSigla} className="swap-in">
            <p className="kicker">{linhaAtiva.regiao ?? "Brasil"}</p>
            <h3 className="mt-1 font-display text-[2rem] leading-none">{linhaAtiva.ufNome}</h3>
            <p className="mono mt-1 text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
              IBGE {linhaAtiva.ufCodigo} · {linhaAtiva.ufSigla}
            </p>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <dt className="text-ink-soft">Notificações (estimativa)</dt>
                <dd className="mono text-[0.95rem] font-medium">{int(linhaAtiva.notificacoesEstimadas)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <dt className="text-ink-soft">Taxa por 100 mil hab.</dt>
                <dd className="mono text-[0.95rem] font-medium">{linhaAtiva.taxaPor100Mil === null ? "não calculável" : int(linhaAtiva.taxaPor100Mil)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <dt className="text-ink-soft">Óbitos por SRAG (estimativa)</dt>
                <dd className="mono text-[0.95rem] font-medium">{int(linhaAtiva.obitosEstimados)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-b border-line pb-2">
                <dt className="text-ink-soft">Letalidade na amostra</dt>
                <dd className="mono text-[0.95rem] font-medium">{pct(linhaAtiva.letalidadePct, 2)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-soft">Cobertura da amostra</dt>
                <dd className="mono text-[0.95rem] font-medium">{pct(linhaAtiva.coberturaPct)}</dd>
              </div>
            </dl>

            <p className="mt-5 text-[0.72rem] leading-relaxed text-ink-mute">
              População de referência: {int(linhaAtiva.populacao)} habitantes ({linhaAtiva.populacaoAno}).
              Estimativa obtida por amostragem sistemática; não é contagem censitária do período.
            </p>
            <button
              type="button"
              onClick={() => onSelecionar(null)}
              className="mono mt-4 text-[0.68rem] uppercase tracking-[0.14em] text-brand link-underline"
            >
              Limpar seleção
            </button>
          </div>
        ) : (
          <div className="swap-in flex h-full min-h-[220px] flex-col">
            <p className="kicker">Leitura territorial</p>
            <p className="mt-3 text-[0.85rem] leading-relaxed text-ink-soft">
              Passe o cursor sobre uma unidade da federação para ver os indicadores. Clique para
              fixar a seleção e filtrar o restante do painel.
            </p>
            <div className="mt-5 border-t border-line pt-4">
              <p className="kicker">Maiores taxas no recorte</p>
              <ul className="mt-2 divide-y divide-line">
                {linhas.slice(0, 5).map((l, i) => (
                  <li key={l.ufSigla}>
                    <button
                      type="button"
                      onClick={() => onSelecionar(l.ufSigla)}
                      className="flex w-full items-baseline gap-3 py-1.5 text-left hover:text-brand"
                    >
                      <span className="mono text-[0.68rem] text-ink-mute">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-[0.82rem]">{l.ufNome}</span>
                      <span className="mono ml-auto text-[0.72rem]">
                        {metrica === "taxa" ? `${int(l.taxaPor100Mil ?? 0)} /100k` : int(l.notificacoesEstimadas)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-4 border-l-2 border-line-strong pl-3 text-[0.72rem] leading-relaxed text-ink-mute">
              A associação entre notificação e território usa o código IBGE de residência
              (<span className="mono">co_mun_res</span>), com fallback para o município de notificação
              quando o campo está vazio. O nome do município nunca é usado como chave.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
