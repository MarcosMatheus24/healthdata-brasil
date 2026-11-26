"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { LinhaIndicador, UF } from "@/lib/types";
import { compacto, dataHora, int, pct } from "@/lib/format";
import { BarRanking, Distribuicao, SerieMensal } from "@/components/charts";
import { Badge, ProvenanceBar, Stat } from "@/components/ui";

type Resposta = {
  parametros: { ano: number; uf: string; agravo: string };
  resumo: {
    notificacoes: number;
    obitos: number;
    populacao: number;
    taxaPor100Mil: number | null;
    letalidadePct: number | null;
    ufs: number;
  };
  ufSelecionada: LinhaIndicador | null;
  linhas: LinhaIndicador[];
  serieMensal: { mes: string; valor: number; amostra: number }[];
  perfil: Record<string, { categoria: string; contagem: number }[]>;
  proveniencia: {
    fonte: string;
    fonteTerritorial: string;
    coleta: string;
    registrosColetados: number;
    universoFonte: number;
    fracaoAmostral: number;
    metodo: string;
    origemDados: string;
  };
};

type Props = {
  anos: number[];
  ufs: UF[];
  inicial: Resposta;
};

export function DashboardClient({ anos, ufs, inicial }: Props) {
  const [ano, setAno] = useState(inicial.parametros.ano);
  const [uf, setUf] = useState("BR");
  const [metrica, setMetrica] = useState<"taxa" | "absoluto">("taxa");
  const [dados, setDados] = useState<Resposta>(inicial);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const buscar = useCallback(
    async (novoAno: number, novaUf: string) => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await fetch(`/api/indicadores?ano=${novoAno}&uf=${novaUf}`, { cache: "no-store" });
        if (r.status === 404) {
          const corpo = await r.json();
          setErro(corpo.mensagem ?? "Sem dados para o recorte selecionado.");
          setDados((d) => ({ ...d, parametros: { ...d.parametros, ano: novoAno, uf: novaUf }, linhas: [], serieMensal: [], ufSelecionada: null }));
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const corpo: Resposta = await r.json();
        startTransition(() => setDados(corpo));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha de rede ao consultar a API própria.");
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (ano === inicial.parametros.ano && uf === "BR") return;
    void buscar(ano, uf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, uf]);

  const linhas = dados.linhas;
  const selecionada = dados.ufSelecionada;
  const resumo = dados.resumo;

  const ranking = useMemo(
    () =>
      [...linhas]
        .sort((a, b) =>
          metrica === "taxa"
            ? (b.taxaPor100Mil ?? 0) - (a.taxaPor100Mil ?? 0)
            : b.notificacoesEstimadas - a.notificacoesEstimadas,
        )
        .slice(0, 10)
        .map((l) => ({
          rotulo: l.ufNome,
          valor: metrica === "taxa" ? Math.round(l.taxaPor100Mil ?? 0) : l.notificacoesEstimadas,
          sub: l.ufSigla,
        })),
    [linhas, metrica],
  );

  const tabela = useMemo(
    () =>
      [...linhas].sort((a, b) =>
        metrica === "taxa"
          ? (b.taxaPor100Mil ?? 0) - (a.taxaPor100Mil ?? 0)
          : b.notificacoesEstimadas - a.notificacoesEstimadas,
      ),
    [linhas, metrica],
  );

  const csvHref = `/api/export?ano=${ano}&uf=${uf}`;

  return (
    <div>
      {/* ------------------------------------------------------------- filtros */}
      <div className="sticky top-16 z-30 border-b border-line bg-canvas/80 backdrop-blur-xl max-md:top-[6.6rem]">
        <div className="wrap flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
          <div className="flex items-center gap-2">
            <label htmlFor="ano" className="kicker">
              Período
            </label>
            <select
              id="ano"
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

          <div className="flex items-center gap-2">
            <label htmlFor="uf" className="kicker">
              Território
            </label>
            <select
              id="uf"
              value={uf}
              onChange={(e) => setUf(e.target.value)}
              className="mono border border-line-strong px-3 py-1.5 text-[0.78rem] transition-colors hover:border-brand focus:border-brand focus:outline-none"
            >
              <option value="BR">Brasil (todas as UFs)</option>
              {[...ufs]
                .sort((a, b) => a.nome.localeCompare(b.nome))
                .map((u) => (
                  <option key={u.codigo} value={u.sigla}>
                    {u.nome} ({u.sigla})
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
                className={`mono relative z-10 rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.1em] transition-colors duration-300 ${
                  metrica === m ? "text-canvas" : "text-ink-mute hover:text-ink"
                }`}
              >
                {m === "taxa" ? "taxa /100 mil" : "absoluto"}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {carregando && (
              <span className="swap-in mono flex items-center gap-2 rounded-full bg-accent-wash px-2.5 py-1 text-[0.68rem] uppercase tracking-[0.12em] text-accent">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
                consultando API
              </span>
            )}
            <a href={csvHref} className="btn btn-ghost px-3 py-1.5 text-[0.74rem]">
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Exportar CSV
            </a>
          </div>
        </div>
      </div>

      <div className="wrap py-10">
        {erro && (
          <div className="swap-in mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-danger/30 bg-danger-wash px-5 py-4">
            <p className="text-[0.85rem] text-danger">
              <strong className="font-medium">Sem dados para este recorte.</strong> {erro}
            </p>
            <button
              type="button"
              onClick={() => void buscar(ano, uf)}
              className="mono rounded-lg border border-danger/40 px-3 py-1.5 text-[0.65rem] uppercase tracking-[0.12em] text-danger transition-colors hover:bg-danger hover:text-white"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- KPIs */}
        <div className={`hairline-grid grid gap-px bg-line transition-opacity duration-300 sm:grid-cols-2 lg:grid-cols-4 ${carregando ? "opacity-60" : ""}`} data-reveal-stagger>
          <Stat
            rotulo={selecionada ? `Notificações estimadas · ${selecionada.ufSigla}` : "Notificações estimadas · Brasil"}
            valor={compacto(selecionada ? selecionada.notificacoesEstimadas : resumo.notificacoes)}
            nota={`${ano} · amostra de ${int(selecionada ? selecionada.notificacoesAmostra : linhas.reduce((s, l) => s + l.notificacoesAmostra, 0))} registros`}
            destaque
          />
          <Stat
            rotulo="Taxa por 100 mil habitantes"
            valor={int(selecionada ? selecionada.taxaPor100Mil : resumo.taxaPor100Mil)}
            unidade="/100k"
            nota={`População ${int(selecionada ? selecionada.populacao : resumo.populacao)} (${selecionada?.populacaoAno ?? ano})`}
          />
          <Stat
            rotulo="Letalidade na amostra"
            valor={pct(selecionada ? selecionada.letalidadePct : resumo.letalidadePct, 2)}
            nota="Óbitos por SRAG ÷ notificações do recorte"
          />
          <Stat
            rotulo="Cobertura da amostra"
            valor={pct(selecionada ? selecionada.coberturaPct : (dados.proveniencia.fracaoAmostral * 100), 2)}
            nota={`${int(dados.proveniencia.registrosColetados)} de ${int(dados.proveniencia.universoFonte)} registros da fonte`}
          />
        </div>

        {/* ------------------------------------------------------------- gráficos */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <section aria-labelledby="ranking" className="card p-6" data-reveal>
            <div className="flex items-baseline justify-between">
              <h2 id="ranking" className="font-display text-xl">
                {metrica === "taxa" ? "Taxa por 100 mil hab." : "Notificações estimadas"}
              </h2>
              <span className="kicker">{linhas.length} UFs</span>
            </div>
            <div className="mt-4">
              <BarRanking
                dados={ranking}
                unidade={metrica === "taxa" ? "/100k" : ""}
                destacar={selecionada?.ufNome}
                maxItens={10}
              />
            </div>
            <p className="mt-4 text-[0.7rem] leading-relaxed text-ink-mute">
              Ranking descritivo do recorte. Não é classificação de risco e não mede qualidade
              assistencial.
            </p>
          </section>

          <section aria-labelledby="serie" className="card p-6" data-reveal style={{ ["--d" as string]: 120 }}>
            <div className="flex items-baseline justify-between">
              <h2 id="serie" className="font-display text-xl">
                Série mensal {selecionada ? `· ${selecionada.ufSigla}` : "· Brasil"}
              </h2>
              <span className="kicker">por data de primeiros sintomas</span>
            </div>
            <div className="mt-4">
              {dados.serieMensal.length ? (
                <SerieMensal dados={dados.serieMensal} altura={420} largura={760} />
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded-xl border border-dashed border-line-strong">
                  <p className="mono text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
                    sem série no recorte
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5">
              <ProvenanceBar
                fonte="MS Dados Abertos · SRAG 2019-2026"
                periodo={`${ano} · ${dados.proveniencia.metodo}`}
                cobertura={pct(dados.proveniencia.fracaoAmostral * 100, 2)}
                coleta={dataHora(dados.proveniencia.coleta)}
              />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------------- perfis */}
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section className="card card-hover p-6" data-reveal>
            <h2 className="font-display text-xl">Classificação final</h2>
            <p className="kicker mt-1">Categoria encerrada na ficha de notificação</p>
            <div className="mt-5">
              <Distribuicao dados={dados.perfil.classificacao ?? []} />
            </div>
          </section>
          <section className="card card-hover p-6" data-reveal style={{ ["--d" as string]: 120 }}>
            <h2 className="font-display text-xl">Faixa etária</h2>
            <p className="kicker mt-1">Agrupamento calculado a partir de nu_idade_n e tp_idade</p>
            <div className="mt-5">
              <Distribuicao
                dados={dados.perfil.faixaEtaria ?? []}
                cores={["var(--color-brand)", "var(--color-brand-bright)", "var(--color-brand-muted)", "var(--color-accent)", "var(--color-line-strong)", "var(--color-ink-mute)"]}
              />
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------------- tabela */}
        <section className="mt-16" data-reveal>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-xl">Tabela por unidade da federação</h2>
              <p className="kicker mt-1">Códigos IBGE · população de referência · cobertura amostral</p>
            </div>
            <a href={csvHref} className="mono text-[0.65rem] uppercase tracking-[0.12em] text-brand link-underline">
              Baixar CSV com proveniência →
            </a>
          </div>

          <div className="table-shell mt-5 overflow-x-auto border border-line">
            <table className="w-full min-w-[760px] border-collapse text-[0.8rem]">
              <thead>
                <tr className="border-b border-line bg-canvas-deep text-left text-[0.72rem] uppercase tracking-[0.06em] text-ink-soft">
                  <th className="px-4 py-2.5 font-medium">UF</th>
                  <th className="px-4 py-2.5 font-medium">IBGE</th>
                  <th className="px-4 py-2.5 text-right font-medium">População</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amostra</th>
                  <th className="px-4 py-2.5 text-right font-medium">Estimativa</th>
                  <th className="px-4 py-2.5 text-right font-medium">Taxa/100k</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cobertura</th>
                </tr>
              </thead>
              <tbody>
                {tabela.map((l) => (
                  <tr
                    key={l.ufSigla}
                    className={`border-b border-line/60 transition-colors last:border-0 hover:bg-brand-wash/50 ${
                      selecionada?.ufSigla === l.ufSigla ? "bg-accent-wash/70" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setUf(l.ufSigla)}
                        className="text-left font-medium transition-colors hover:text-brand"
                        title={`Filtrar por ${l.ufNome}`}
                      >
                        {l.ufNome} <span className="mono text-[0.68rem] text-ink-mute">{l.ufSigla}</span>
                      </button>
                    </td>
                    <td className="mono px-4 py-2.5 text-[0.7rem] text-ink-mute">{l.ufCodigo}</td>
                    <td className="mono px-4 py-2.5 text-right">{int(l.populacao)}</td>
                    <td className="mono px-4 py-2.5 text-right text-ink-mute">{int(l.notificacoesAmostra)}</td>
                    <td className="mono px-4 py-2.5 text-right">{int(l.notificacoesEstimadas)}</td>
                    <td className="mono px-4 py-2.5 text-right">{int(l.taxaPor100Mil)}</td>
                    <td className="mono px-4 py-2.5 text-right text-ink-mute">{pct(l.coberturaPct, 2)}</td>
                  </tr>
                ))}
                {!tabela.length && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[0.8rem] text-ink-mute">
                      Nenhuma linha para o recorte selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Badge tone="info">origem dos dados: {dados.proveniencia.origemDados === "postgres" ? "PostgreSQL" : "snapshot versionado"}</Badge>
            <Badge tone="alerta">estimativas por amostragem</Badge>
            <Link href="/metodologia" className="mono text-[0.68rem] uppercase tracking-[0.12em] text-ink-mute link-underline">
              entenda o cálculo
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
