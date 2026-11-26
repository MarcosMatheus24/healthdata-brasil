"use client";

import { useEffect, useMemo, useState } from "react";
import type { LinhaIndicador, MunicipioAmostra, UF } from "@/lib/types";
import { MapaBrasil } from "@/components/mapa-brasil";
import { Badge, ProvenanceBar } from "@/components/ui";
import { dataHora, int, pct } from "@/lib/format";

export function MapaClient({
  ufs,
  anos,
  anoInicial,
  linhasIniciais,
  municipiosPorUf,
  cobertura,
  coleta,
}: {
  ufs: UF[];
  anos: number[];
  anoInicial: number;
  linhasIniciais: LinhaIndicador[];
  municipiosPorUf: Record<string, MunicipioAmostra[]>;
  cobertura: number;
  coleta: string;
}) {
  const [ano, setAno] = useState(anoInicial);
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [metrica, setMetrica] = useState<"taxa" | "absoluto">("taxa");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (ano === anoInicial) return;
    let ativo = true;
    setCarregando(true);
    fetch(`/api/indicadores?ano=${ano}&uf=BR`)
      .then((r) => r.json())
      .then((d) => ativo && setLinhas(d.linhas ?? []))
      .catch(() => ativo && setLinhas([]))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [ano, anoInicial]);

  const municipios = useMemo(
    () => (selecionado ? municipiosPorUf[selecionado] ?? [] : []),
    [selecionado, municipiosPorUf],
  );

  const semDados = useMemo(() => {
    const comDados = new Set(linhas.map((l) => l.ufSigla));
    return ufs.filter((u) => !comDados.has(u.sigla));
  }, [linhas, ufs]);

  return (
    <div className="wrap py-10">
      <div className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface/80 px-4 py-3 shadow-[0_1px_3px_rgb(11_19_36/0.04)] backdrop-blur" data-reveal>
        <div className="flex items-center gap-2">
          <label htmlFor="ano-mapa" className="kicker">
            Período
          </label>
          <select
            id="ano-mapa"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="mono border border-line-strong px-3 py-1.5 text-[0.78rem] transition-colors hover:border-brand focus:border-brand focus:outline-none"
          >
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="relative grid grid-cols-2 rounded-full border border-line-strong bg-surface p-0.5" role="group" aria-label="Métrica">
          <span
            aria-hidden
            className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-ink transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ transform: metrica === "taxa" ? "translateX(0)" : "translateX(100%)" }}
          />
          {(["taxa", "absoluto"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metrica === m}
              onClick={() => setMetrica(m)}
              className={`mono relative z-10 rounded-full px-3 py-1 text-center text-[0.68rem] uppercase tracking-[0.1em] transition-colors duration-300 ${
                metrica === m ? "text-canvas" : "text-ink-mute hover:text-ink"
              }`}
            >
              {m === "taxa" ? "taxa /100 mil" : "quantidade absoluta"}
            </button>
          ))}
        </div>

        {carregando && (
          <span className="swap-in mono flex items-center gap-2 rounded-full bg-accent-wash px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-accent">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            atualizando
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Badge tone="alerta">cor = intensidade, não risco</Badge>
          <Badge tone="info">malha IBGE</Badge>
        </div>
      </div>

      <MapaBrasil
        ufs={ufs}
        linhas={linhas}
        metrica={metrica}
        selecionado={selecionado}
        onSelecionar={setSelecionado}
      />

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        <section className="card card-hover p-6" data-reveal>
          <h2 className="font-display text-xl">Qualidade da associação territorial</h2>
          <p className="kicker mt-1">Código IBGE como chave — nunca o nome do município</p>

          <dl className="mt-5 space-y-3 text-[0.82rem]">
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <dt className="text-ink-soft">UFs com dados no recorte</dt>
              <dd className="mono">{linhas.length} de {ufs.length}</dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <dt className="text-ink-soft">UFs sem notificação amostrada</dt>
              <dd className="mono">{semDados.length ? semDados.map((u) => u.sigla).join(", ") : "nenhuma"}</dd>
            </div>
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <dt className="text-ink-soft">Municípios associados (amostra)</dt>
              <dd className="mono">
                {selecionado ? municipios.length : Object.values(municipiosPorUf).reduce((s, m) => s + m.length, 0)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-soft">Cobertura amostral global</dt>
              <dd className="mono">{pct(cobertura * 100, 2)}</dd>
            </div>
          </dl>

          <p className="mt-5 border-l-2 border-line-strong pl-4 text-[0.72rem] leading-relaxed text-ink-mute">
            UF sem dado não é UF sem notificação: significa que a amostra sistemática não capturou
            registros daquele território no recorte. A ausência é exibida com hachura, nunca como
            zero.
          </p>
        </section>

        <section className="card card-hover p-6" data-reveal style={{ ["--d" as string]: 120 }}>
          <h2 className="font-display text-xl">
            {selecionado ? `Municípios mais frequentes · ${selecionado}` : "Alternativa tabular"}
          </h2>
          <p className="kicker mt-1">
            {selecionado ? "Contagem na amostra e estimativa" : "Selecione uma UF no mapa"}
          </p>

          {selecionado && municipios.length ? (
            <ul key={selecionado} className="mt-5 divide-y divide-line" data-reveal-stagger>
              {municipios.slice(0, 8).map((m) => (
                <li key={m.codigo} className="flex items-baseline justify-between gap-3 py-2 text-[0.82rem]">
                  <span className="truncate text-ink-soft">{m.nome ?? m.codigo}</span>
                  <span className="mono shrink-0 text-[0.72rem] text-ink-mute">
                    {m.codigo} · {int(m.amostra)} · est. {int(m.estimado)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <table className="mt-5 w-full text-[0.78rem]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="py-2 font-medium">UF</th>
                  <th className="py-2 font-medium">IBGE</th>
                  <th className="py-2 text-right font-medium">Estimativa</th>
                  <th className="py-2 text-right font-medium">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {[...linhas]
                  .sort((a, b) => (b.taxaPor100Mil ?? 0) - (a.taxaPor100Mil ?? 0))
                  .slice(0, 8)
                  .map((l) => (
                    <tr key={l.ufSigla} className="border-b border-line/60 last:border-0">
                      <td className="py-2">{l.ufNome}</td>
                      <td className="mono py-2 text-[0.68rem] text-ink-mute">{l.ufCodigo}</td>
                      <td className="mono py-2 text-right">{int(l.notificacoesEstimadas)}</td>
                      <td className="mono py-2 text-right">{int(l.taxaPor100Mil)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="mt-10" data-reveal>
        <ProvenanceBar
          fonte="Malha e territórios: IBGE · Indicadores: MS Dados Abertos (SRAG)"
          periodo={String(ano)}
          cobertura={pct(cobertura * 100, 2)}
          coleta={dataHora(coleta)}
        />
      </div>
    </div>
  );
}
