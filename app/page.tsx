import Link from "next/link";
import {
  anosDisponiveis,
  anoReferencia,
  coberturaGlobal,
  getBase,
  linhasIndicadores,
  resumoNacional,
  serieMensal,
  statusAgravos,
  statusFontes,
} from "@/lib/data";
import { MonitoramentoAgravos } from "@/components/monitoramento-agravos";
import { compacto, dataHora, int, pct } from "@/lib/format";
import { BarRanking, SerieMensal } from "@/components/charts";
import { AnimatedNumber } from "@/components/animated-number";
import { Aviso, Badge, ProvenanceBar, SectionLabel, Stat } from "@/components/ui";

export const revalidate = 60;

const EQUIPE = [
  { nome: "Marcos Matheus Ribeiro Muniz", papel: "Front-end", foco: "Interface, estados de carregamento e acessibilidade" },
  { nome: "Yuri Chaves Cabral", papel: "Back-end", foco: "API REST própria, adaptadores e validação de schema" },
  { nome: "Luis Gustavo Dantas Estrela", papel: "Banco de dados", foco: "Modelo relacional, agregações e trilha de auditoria" },
  { nome: "Gabriel Matos Azevedo", papel: "Documentação", foco: "Proveniência, metodologia e relatório" },
];

const PIPELINE = [
  { n: "01", titulo: "Front-end", desc: "Filtros, estados e leitura dos indicadores" },
  { n: "02", titulo: "API REST própria", desc: "/api/indicadores, /api/territorios" },
  { n: "03", titulo: "Serviço no servidor", desc: "Adaptadores por fonte, timeout e paginação" },
  { n: "04", titulo: "Fonte oficial", desc: "MS Dados Abertos e IBGE" },
  { n: "05", titulo: "Normalização", desc: "Schema validado, códigos IBGE, ausência ≠ zero" },
  { n: "06", titulo: "Banco / cache", desc: "PostgreSQL com trilha de coleta" },
  { n: "07", titulo: "Indicadores", desc: "Taxa, letalidade e cobertura" },
];

const PRINCIPIOS = [
  "Notificação ≠ caso confirmado",
  "Ausência de dado ≠ zero",
  "Taxa exige denominador",
  "Código IBGE, nunca nome",
  "Estimativa amostral declarada",
  "Nenhum microdado publicado",
  "Proveniência em toda tela",
];

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

export default async function Home() {
  const base = await getBase();
  const anos = anosDisponiveis(base);
  const ano = anoReferencia(base);
  const linhas = linhasIndicadores(base, { ano });
  const resumo = resumoNacional(base, ano);
  const serie = serieMensal(base, "BR").filter((d) => d.mes >= `${Math.min(...anos, ano)}-01`);
  const fontes = statusFontes(base);
  const cobertura = coberturaGlobal(base);
  const top = [...linhas].sort((a, b) => (b.taxaPor100Mil ?? 0) - (a.taxaPor100Mil ?? 0)).slice(0, 6);
  const coleta = base.meta.coletas?.[0];
  const cartoes = statusAgravos(base).map((a) => ({
    id: a.id,
    estado: a.estado,
    mensagem: a.mensagem,
    anoReferencia: a.anoReferencia,
    ultimaColeta: a.ultimaColeta,
    coberturaPct: a.coberturaPct,
    resumo: a.resumo,
    serie: a.estado === "coletado" ? serieMensal(base, "BR", a.id).slice(-36) : [],
  }));
  const comColeta = cartoes.filter((c) => c.estado === "coletado").length;

  return (
    <>
      {/* ================================================================ HERO */}
      <section className="theme-night relative overflow-hidden">
        {/* fundo: aurora + grade + linha de varredura */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="aurora -left-32 top-0 h-[30rem] w-[30rem] bg-brand" style={{ opacity: 0.45 }} />
          <span
            className="aurora right-[-10rem] top-[-6rem] h-[34rem] w-[34rem] bg-[#7c4dff]"
            style={{ opacity: 0.3, animationDelay: "-7s" }}
          />
          <span
            className="aurora bottom-[-12rem] left-1/3 h-[26rem] w-[26rem] bg-accent"
            style={{ opacity: 0.16, animationDelay: "-12s" }}
          />
          <div className="grid-lines absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-canvas" />
        </div>

        <div className="wrap relative grid gap-14 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
          <div>
            <div className="reveal">
              <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white/5 py-1 pl-1 pr-3 text-[0.78rem] text-ink-soft backdrop-blur">
                <span className="rounded-full bg-brand px-2 py-0.5 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-on-brand">
                  AV2
                </span>
                Projeto integrador · vigilância em saúde
              </span>
            </div>

            <h1 className="reveal-2 mt-7 max-w-[16ch] text-[clamp(2.7rem,6vw,5.2rem)] leading-[0.92]">
              Dados oficiais de SRAG com a <span className="text-gradient">proveniência</span> à vista.
            </h1>

            <p className="reveal-3 mt-7 max-w-xl text-[1.06rem] leading-relaxed text-ink-soft">
              Integração real com a API de Dados Abertos do Ministério da Saúde e com as APIs do
              IBGE: notificações de síndrome respiratória aguda grave transformadas em indicadores
              com fonte, período, cobertura amostral e limitações declaradas — nunca em certezas
              inventadas.
            </p>

            <div className="reveal-3 mt-9 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className="btn btn-primary px-5 py-3">
                Abrir o dashboard <span className="btn-arrow" aria-hidden>→</span>
              </Link>
              <Link href="/mapa" className="btn btn-ghost px-5 py-3">
                Ver mapa territorial
              </Link>
              <Link
                href="/metodologia"
                className="mono ml-2 text-[0.7rem] uppercase tracking-[0.14em] text-ink-mute link-underline"
              >
                Como calculamos
              </Link>
            </div>

            <dl
              className="mt-14 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-6 sm:grid-cols-4"
              data-reveal-stagger
            >
              <div>
                <dt className="kicker">Universo da fonte</dt>
                <dd className="mono mt-1.5 text-[1.05rem] font-medium text-ink">
                  <AnimatedNumber value={compacto(base.meta.metodologia.universoFonte)} />
                </dd>
              </div>
              <div>
                <dt className="kicker">Amostra coletada</dt>
                <dd className="mono mt-1.5 text-[1.05rem] font-medium text-ink">
                  <AnimatedNumber value={int(base.meta.metodologia.registrosColetados)} />
                </dd>
              </div>
              <div>
                <dt className="kicker">Cobertura</dt>
                <dd className="mono mt-1.5 text-[1.05rem] font-medium text-ink">
                  <AnimatedNumber value={pct(cobertura, 2)} />
                </dd>
              </div>
              <div>
                <dt className="kicker">Última coleta</dt>
                <dd className="mono mt-1.5 text-[1.05rem] font-medium text-ink">
                  {dataHora(coleta?.finalizadoEm ?? base.meta.geradoEm).split(",")[0]}
                </dd>
              </div>
            </dl>
          </div>

          <aside className="reveal-2 relative lg:mt-6">
            {/* halo atrás do cartão */}
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand/30 via-transparent to-accent/20 blur-2xl"
            />
            <div className="card relative overflow-hidden p-6">
              <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-brand/10 to-transparent" />
              <div className="flex items-center justify-between">
                <p className="kicker">Cartão de proveniência</p>
                <Badge tone="ok">
                  <span className="dot-live inline-block h-1.5 w-1.5 rounded-full bg-ok" />
                  dados reais
                </Badge>
              </div>

              <p className="mt-5 font-display text-[1.9rem] font-semibold leading-none tracking-[-0.035em]">
                SRAG <span className="text-ink-mute">·</span> {ano}
              </p>
              <p className="mt-2 text-[0.8rem] text-ink-mute">
                Síndrome respiratória aguda grave — notificações hospitalares
              </p>

              <div className="mt-6">
                <SerieMensal dados={serie.slice(-36)} altura={190} largura={560} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
                <div>
                  <p className="kicker">Notif.</p>
                  <p className="mono mt-1 text-[0.95rem] font-medium">
                    <AnimatedNumber value={compacto(resumo.notificacoes)} />
                  </p>
                </div>
                <div>
                  <p className="kicker">Taxa/100k</p>
                  <p className="mono mt-1 text-[0.95rem] font-medium">
                    <AnimatedNumber value={int(resumo.taxaPor100Mil)} />
                  </p>
                </div>
                <div>
                  <p className="kicker">Letalidade</p>
                  <p className="mono mt-1 text-[0.95rem] font-medium">
                    <AnimatedNumber value={pct(resumo.letalidadePct, 2)} />
                  </p>
                </div>
              </div>

              <p className="mono mt-4 text-[0.65rem] uppercase leading-relaxed tracking-[0.1em] text-ink-mute">
                Estimativas por amostragem sistemática de páginas ·{" "}
                {pct(base.meta.metodologia.fracaoAmostral * 100, 2)} do universo
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* ================================================================ PRINCÍPIOS (faixa em movimento) */}
      <section className="marquee-host relative overflow-hidden border-y border-line bg-surface py-4" aria-label="Princípios de leitura">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-surface to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-surface to-transparent" />
        <div className="marquee">
          {[0, 1].map((copia) => (
            <ul key={copia} className="flex shrink-0 items-center" aria-hidden={copia === 1}>
              {PRINCIPIOS.map((t) => (
                <li
                  key={t}
                  className="mono flex items-center gap-6 whitespace-nowrap px-6 text-[0.72rem] font-medium uppercase tracking-[0.16em] text-ink-soft"
                >
                  {t}
                  <span className="text-accent">✦</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </section>

      {/* ================================================================ MONITORAMENTO POR DOENÇA */}
      <section className="wrap pt-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4" data-reveal>
          <div>
            <p className="kicker">Monitoramento · {comColeta} de {cartoes.length} com coleta publicada</p>
            <h2 className="mt-2 text-[clamp(1.6rem,2.6vw,2.1rem)] leading-tight">Doenças monitoradas</h2>
            <p className="mt-2 max-w-2xl text-[0.88rem] leading-relaxed text-ink-mute">
              Cada cartão declara o que conta como caso. Sem coleta, o cartão fica vazio de propósito —
              o portal não preenche lacunas com zero.
            </p>
          </div>
          <Link href="/metodologia#agravos" className="mono text-[0.7rem] uppercase tracking-[0.14em] text-brand link-underline">
            Definições de caso →
          </Link>
        </div>
        <MonitoramentoAgravos cartoes={cartoes} />
      </section>

      {/* ================================================================ KPIs */}
      <section className="wrap py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4" data-reveal>
          <div>
            <p className="kicker">Painel nacional · SRAG · {ano}</p>
            <h2 className="mt-2 text-[clamp(1.6rem,2.6vw,2.1rem)] leading-tight">Indicadores-chave de SRAG</h2>
          </div>
          <Link href="/metodologia" className="mono text-[0.7rem] uppercase tracking-[0.14em] text-brand link-underline">
            Ler as limitações →
          </Link>
        </div>
        <div className="hairline-grid grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4" data-reveal-stagger>
          <Stat
            rotulo="Notificações de SRAG estimadas no recorte"
            valor={compacto(resumo.notificacoes)}
            nota={`${ano} · ${resumo.ufs} UFs com dados na amostra`}
            destaque
          />
          <Stat
            rotulo="Taxa por 100 mil habitantes"
            valor={int(resumo.taxaPor100Mil)}
            unidade="/100k"
            nota={`Denominador: população residente estimada do IBGE`}
          />
          <Stat
            rotulo="Letalidade na amostra"
            valor={pct(resumo.letalidadePct, 2)}
            nota="Óbitos por SRAG ÷ notificações do recorte"
          />
          <Stat
            rotulo="Cobertura da amostra"
            valor={pct(cobertura, 2)}
            nota={`${int(base.meta.metodologia.registrosColetados)} de ${int(base.meta.metodologia.universoFonte)} registros`}
          />
        </div>
      </section>

      {/* ================================================================ 01 problema */}
      <section className="border-t border-line">
        <div className="wrap grid gap-12 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionLabel numero="01">O problema</SectionLabel>
            <h2 data-reveal className="mt-5 max-w-[20ch] text-[clamp(1.9rem,3.2vw,2.8rem)] leading-[1.05]">
              Como comparar recortes sem misturar fontes ou inventar granularidade?
            </h2>
          </div>
          <div className="space-y-6 text-[0.98rem] leading-relaxed text-ink-soft" data-reveal-stagger>
            <p>
              Uma notificação é um registro de vigilância, não necessariamente um caso confirmado.
              Definições de caso, atraso de publicação, cobertura e duplicidade alteram qualquer
              leitura. Por isso o portal separa três coisas que costumam ser confundidas:{" "}
              <strong className="font-semibold text-ink">o que foi notificado</strong>,{" "}
              <strong className="font-semibold text-ink">o que é estimado</strong> e{" "}
              <strong className="font-semibold text-ink">o que o indicador não prova</strong>.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card card-hover p-5">
                <span className="mono inline-flex rounded-md bg-brand-wash px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-brand">
                  Território
                </span>
                <p className="mt-3 text-[0.86rem] leading-relaxed">
                  Município de residência e de notificação podem diferir. A associação é feita por
                  código IBGE, nunca por nome.
                </p>
              </div>
              <div className="card card-hover p-5">
                <span className="mono inline-flex rounded-md bg-accent-wash px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-accent">
                  Denominador
                </span>
                <p className="mt-3 text-[0.86rem] leading-relaxed">
                  Sem população compatível, não há taxa. O portal usa a estimativa populacional do
                  mesmo ano e exibe o ano usado.
                </p>
              </div>
            </div>
            <Aviso>
              Os indicadores são <strong>estimativas por amostragem</strong> do conjunto oficial
              (não uma contagem censitária do período). A fração amostral e a cobertura aparecem em
              cada cartão e no CSV exportado.
            </Aviso>
          </div>
        </div>
      </section>

      {/* ================================================================ 02 pipeline */}
      <section className="relative overflow-hidden border-t border-line bg-surface">
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-40" />
        <div className="wrap relative py-16 lg:py-24">
          <SectionLabel numero="02">Arquitetura</SectionLabel>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-6" data-reveal>
            <h2 className="max-w-[22ch] text-[clamp(1.9rem,3.2vw,2.8rem)] leading-[1.05]">
              Do contrato da fonte até a interface
            </h2>
            <p className="max-w-sm text-[0.88rem] leading-relaxed text-ink-mute">
              Sete etapas, cada uma com um ponto de falha previsto. Credenciais existem apenas no
              servidor; o navegador nunca recebe segredo.
            </p>
          </div>

          <div className="relative mt-12">
            {/* trilho que se desenha ao entrar na tela */}
            <div aria-hidden className="absolute left-0 right-0 top-[1.15rem] hidden h-px bg-line lg:block">
              <div
                data-reveal="track"
                className="h-full origin-left bg-gradient-to-r from-brand via-[#9b7bff] to-accent"
              />
            </div>
            <ol className="relative grid gap-4 md:grid-cols-4 lg:grid-cols-7 lg:gap-3" data-reveal-stagger>
              {PIPELINE.map((p) => (
                <li key={p.n} className="group">
                  <span className="mono relative z-10 flex h-[2.3rem] w-[2.3rem] items-center justify-center rounded-full border border-line-strong bg-surface text-[0.7rem] font-semibold text-accent transition-all duration-300 group-hover:scale-110 group-hover:border-brand group-hover:bg-brand group-hover:text-on-brand group-hover:shadow-[0_0_0_6px_var(--color-brand-wash)]">
                    {p.n}
                  </span>
                  <div className="mt-4 rounded-xl border border-transparent p-3 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-line group-hover:bg-canvas">
                    <p className="font-display text-[1.06rem] font-semibold leading-tight tracking-[-0.02em]">{p.titulo}</p>
                    <p className="mt-1.5 text-[0.76rem] leading-snug text-ink-mute">{p.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-10 flex flex-wrap gap-2" data-reveal-stagger>
            <Badge tone="info">GET /api/fontes/status</Badge>
            <Badge tone="info">GET /api/indicadores</Badge>
            <Badge tone="info">GET /api/territorios</Badge>
            <Badge tone="alerta">POST /api/integracoes/validar</Badge>
            <Badge tone="info">GET /api/export</Badge>
          </div>
        </div>
      </section>

      {/* ================================================================ 03 preview */}
      <section className="border-t border-line">
        <div className="wrap py-16 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionLabel numero="03">No ar agora</SectionLabel>
              <h2 data-reveal className="mt-5 text-[clamp(1.9rem,3.2vw,2.8rem)] leading-[1.05]">
                Taxa de SRAG por 100 mil habitantes · {ano}
              </h2>
            </div>
            <Link href="/dashboard" className="btn btn-ghost" data-reveal>
              Explorar todos os indicadores <span className="btn-arrow" aria-hidden>→</span>
            </Link>
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr]">
            <div className="card p-6" data-reveal>
              <p className="kicker mb-4">Maiores taxas na amostra</p>
              <BarRanking
                dados={top.map((l) => ({
                  rotulo: l.ufNome,
                  valor: Math.round(l.taxaPor100Mil ?? 0),
                  sub: l.ufSigla,
                }))}
                unidade="/100k"
                maxItens={6}
              />
              <p className="mt-4 text-[0.74rem] leading-relaxed text-ink-mute">
                Ranking descritivo do recorte selecionado. Não é classificação de risco nem
                comparação de qualidade assistencial entre estados.
              </p>
            </div>
            <div className="card p-6" data-reveal style={{ ["--d" as string]: 120 }}>
              <div className="mb-4 flex items-center justify-between">
                <p className="kicker">Série mensal nacional</p>
                <span className="mono text-[0.65rem] text-ink-mute">passe o cursor no gráfico</span>
              </div>
              <SerieMensal dados={serie} altura={330} largura={700} />
              <div className="mt-4">
                <ProvenanceBar
                  fonte="MS Dados Abertos · SRAG"
                  periodo={`${serie[0]?.mes ?? "—"} a ${serie[serie.length - 1]?.mes ?? "—"}`}
                  cobertura={pct(cobertura, 2)}
                  coleta={dataHora(coleta?.finalizadoEm ?? base.meta.geradoEm).split(",")[0]}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ 04 fontes */}
      <section className="border-t border-line bg-canvas-deep">
        <div className="wrap py-16 lg:py-24">
          <SectionLabel numero="04">Fontes e estados</SectionLabel>
          <h2 data-reveal className="mt-5 max-w-[24ch] text-[clamp(1.9rem,3.2vw,2.8rem)] leading-[1.05]">
            Três fontes, três níveis de acesso — declarados na interface
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3" data-reveal-stagger>
            {fontes.map((f) => (
              <div key={f.id} className="card card-hover flex flex-col p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-mute">{f.orgao}</p>
                  <Badge tone={f.estado === "conectado" ? "ok" : f.estado === "erro" ? "erro" : "alerta"}>
                    {f.estado === "conectado" && <span className="dot-live inline-block h-1.5 w-1.5 rounded-full bg-ok" />}
                    {f.estado.replace(/_/g, " ")}
                  </Badge>
                </div>
                <p className="mt-5 font-display text-[1.25rem] font-semibold leading-snug tracking-[-0.025em]">{f.nome}</p>
                <p className="mt-3 flex-1 text-[0.82rem] leading-relaxed text-ink-soft">{f.observacao}</p>
                <p className="mono mt-5 truncate rounded-lg bg-canvas px-2.5 py-1.5 text-[0.68rem] text-ink-mute">{f.urlBase}</p>
              </div>
            ))}
          </div>

          <div className="mt-8" data-reveal>
            <Link href="/integracoes" className="btn btn-primary">
              Abrir console de integrações <span className="btn-arrow" aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================ 05 equipe */}
      <section className="border-t border-line">
        <div className="wrap py-16 lg:py-24">
          <SectionLabel numero="05">Equipe e entregáveis</SectionLabel>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <ul className="grid gap-3 sm:grid-cols-2" data-reveal-stagger>
              {EQUIPE.map((p, i) => (
                <li key={p.nome} className="card card-hover group p-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-[0.95rem] font-semibold text-white transition-transform duration-500 group-hover:rotate-[-6deg] group-hover:scale-110"
                      style={{
                        background: [
                          "linear-gradient(135deg,#4d6bff,#2342d6)",
                          "linear-gradient(135deg,#9b7bff,#5b3fd6)",
                          "linear-gradient(135deg,#ff8f62,#c4461c)",
                          "linear-gradient(135deg,#34c993,#0b7a55)",
                        ][i % 4],
                      }}
                    >
                      {iniciais(p.nome)}
                    </span>
                    <span className="mono rounded-full border border-line px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-brand">
                      {p.papel}
                    </span>
                  </div>
                  <p className="mt-4 font-display text-[1.08rem] font-semibold leading-tight tracking-[-0.02em]">{p.nome}</p>
                  <p className="mt-1.5 text-[0.78rem] leading-snug text-ink-mute">{p.foco}</p>
                </li>
              ))}
            </ul>
            <div className="space-y-5 text-[0.9rem] leading-relaxed text-ink-soft" data-reveal-stagger>
              <p>
                <strong className="font-semibold text-ink">Entregáveis:</strong> repositório no
                GitHub, deploy na Vercel, API REST própria documentada, esquema PostgreSQL com seed,
                protótipo navegável e relatório metodológico.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href="https://github.com/MarcosMatheus24/healthdata-brasil"
                  target="_blank"
                  rel="noreferrer"
                  className="card card-hover group p-4"
                >
                  <p className="mono flex items-center justify-between text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
                    GitHub
                    <span className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
                  </p>
                  <p className="mt-1.5 text-[0.84rem] font-medium text-ink">MarcosMatheus24/healthdata-brasil</p>
                </a>
                <a
                  href="https://healthdata-brasil.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                  className="card card-hover group p-4"
                >
                  <p className="mono flex items-center justify-between text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
                    Vercel
                    <span className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
                  </p>
                  <p className="mt-1.5 text-[0.84rem] font-medium text-ink">healthdata-brasil.vercel.app</p>
                </a>
              </div>
              <p>
                <strong className="font-semibold text-ink">Critérios atendidos:</strong> proveniência
                em todas as telas, segurança e LGPD (nenhum dado pessoal trafega pelo cliente),
                validade metodológica (amostragem declarada), testes de falha e acessibilidade.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge tone="info">Next.js 15</Badge>
                <Badge tone="info">React 19</Badge>
                <Badge tone="info">PostgreSQL</Badge>
                <Badge tone="info">Vercel</Badge>
                <Badge tone="info">GitHub</Badge>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
