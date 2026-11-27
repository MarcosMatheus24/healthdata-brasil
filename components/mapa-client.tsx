"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LinhaIndicador, MunicipioAmostra, UF } from "@/lib/types";
import { AGRAVOS, type AgravoId } from "@/lib/agravos";
import { AgravoPendente, AgravoSelector, type EstadoAgravoResumo } from "@/components/agravo-selector";
import { MapaBrasil } from "@/components/mapa-brasil";
import { Badge, ProvenanceBar } from "@/components/ui";
import { dataHora, int, pct, taxa } from "@/lib/format";

type Estado = {
  agravo: AgravoId;
  disponivel: boolean;
  estado: "coletado" | "pendente" | "erro";
  mensagem: string | null;
  anos: number[];
  ano: number;
  linhas: LinhaIndicador[];
  municipiosPorUf: Record<string, MunicipioAmostra[]>;
  cobertura: number;
  coleta: string;
};

export function MapaClient({ ufs, inicial, estados }: { ufs: UF[]; inicial: Estado; estados: EstadoAgravoResumo[] }) {
  const [dados, setDados] = useState<Estado>(inicial);
  const [agravo, setAgravo] = useState<AgravoId>(inicial.agravo);
  const [ano, setAno] = useState(inicial.ano);
  const [metrica, setMetrica] = useState<"taxa" | "absoluto">("taxa");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const pedido = useRef(0);
  const { linhas, anos, municipiosPorUf, cobertura, coleta } = dados;
  const def = AGRAVOS[agravo];

  /** Busca indicadores + municípios do agravo. Sem `anoAlvo`, o servidor escolhe o ano de referência. */
  const carregar = async (novoAgravo: AgravoId, anoAlvo?: number) => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ agravo: novoAgravo, uf: "BR" });
      if (anoAlvo) qs.set("ano", String(anoAlvo));
      const [ind, terr] = await Promise.all([
        fetch(`/api/indicadores?${qs}`).then((r) => r.json()),
        fetch(`/api/territorios?agravo=${novoAgravo}`).then((r) => r.json()),
      ]);
      if (meu !== pedido.current) return; // resposta atrasada de um clique anterior
      const municipios: Record<string, MunicipioAmostra[]> = Object.fromEntries(
        (terr.ufs ?? []).map((u: { sigla: string; municipiosAmostrados?: MunicipioAmostra[] }) => [u.sigla, u.municipiosAmostrados ?? []]),
      );
      setDados({
        agravo: novoAgravo,
        disponivel: Boolean(ind.disponivel),
        estado: ind.estado ?? "pendente",
        mensagem: ind.mensagem ?? null,
        anos: ind.anosDisponiveis ?? [],
        ano: ind.parametros?.ano ?? anoAlvo ?? ano,
        linhas: ind.linhas ?? [],
        municipiosPorUf: municipios,
        cobertura: ind.proveniencia?.fracaoAmostral ?? 0,
        coleta: ind.proveniencia?.coleta ?? "",
      });
      setAno(ind.parametros?.ano ?? anoAlvo ?? ano);
    } catch {
      if (meu === pedido.current) setDados((d) => ({ ...d, linhas: [] }));
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  };

  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    void carregar(agravo, ano);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano]);

  const trocarAgravo = (novo: AgravoId) => {
    if (novo === agravo) return;
    setAgravo(novo);
    setSelecionado(null);
    const url = new URL(window.location.href);
    if (novo === "srag") url.searchParams.delete("agravo");
    else url.searchParams.set("agravo", novo);
    window.history.replaceState(null, "", url);
    void carregar(novo);
  };

  const disponivel = dados.disponivel && dados.agravo === agravo;

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
        <AgravoSelector valor={agravo} onChange={trocarAgravo} estados={estados} className="w-full xl:w-auto" />
        <div className="flex items-center gap-2">
          <label htmlFor="ano-mapa" className="kicker">
            Período
          </label>
          <select
            id="ano-mapa"
            value={ano}
            disabled={!disponivel}
            onChange={(e) => setAno(Number(e.target.value))}
            className="mono border border-line-strong px-3 py-1.5 text-[0.78rem] transition-colors hover:border-brand focus:border-brand focus:outline-none"
          >
            {anos.length ? (
              anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))
            ) : (
              <option value={ano}>—</option>
            )}
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

      {!disponivel && !carregando ? (
        <AgravoPendente agravo={agravo} estado={dados.estado} mensagem={dados.mensagem} />
      ) : (
      <>
      <MapaBrasil
        ufs={ufs}
        linhas={linhas}
        metrica={metrica}
        selecionado={selecionado}
        onSelecionar={setSelecionado}
        agravo={agravo}
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
              <dt className="text-ink-soft">Cobertura amostral · {def.nome}</dt>
              <dd className="mono">{pct(cobertura * 100, 2)}</dd>
            </div>
          </dl>

          <p className="mt-5 border-l-2 border-line-strong pl-4 text-[0.72rem] leading-relaxed text-ink-mute">
            UF sem dado não é UF sem caso: significa que a amostra sistemática não capturou
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
                      <td className="mono py-2 text-right">{l.suprimido ? "< 5" : int(l.notificacoesEstimadas)}</td>
                      <td className="mono py-2 text-right">{taxa(l.taxaPor100Mil)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      </>
      )}

      <div className="mt-10" data-reveal>
        <ProvenanceBar
          fonte={`Malha e territórios: IBGE · Indicadores: MS Dados Abertos (${def.sistema})`}
          periodo={String(ano)}
          cobertura={pct(cobertura * 100, 2)}
          coleta={dataHora(coleta)}
        />
      </div>
    </div>
  );
}
