import type { Metadata } from "next";
import { getBase, statusAgravos } from "@/lib/data";
import { dataHora, int, pct } from "@/lib/format";
import { Badge, NotaMetodologica, ProvenanceBar, SectionLabel } from "@/components/ui";
import { LISTA_AGRAVOS } from "@/lib/agravos";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Metodologia, proveniência e limites",
  description:
    "Como os indicadores são calculados, o que a amostragem permite afirmar, quais inconsistências existem no arquivo de origem e como o projeto trata dados pessoais.",
};

const PIPELINE = [
  ["Interface", "Filtros de ano, UF e métrica. Nenhuma chamada direta à fonte oficial."],
  ["API própria", "Rotas /api/* com contrato estável, cache de 60 s e resposta normalizada."],
  ["Serviço no servidor", "Adaptador com timeout, retry único e validação de schema."],
  ["Fonte oficial", "MS Dados Abertos (SRAG) e IBGE (localidades, malha, população)."],
  ["Normalização", "Datas, códigos IBGE, categorias e tipos padronizados."],
  ["Banco / cache", "Snapshot versionado; Postgres quando DATABASE_URL está definida."],
  ["Indicadores", "Taxas, letalidade e cobertura calculadas no servidor."],
  ["Dashboard e mapa", "Visualização com proveniência, estados e exportação CSV."],
];

const GLOSSARIO = [
  ["SRAG", "Síndrome Respiratória Aguda Grave — agravo de notificação compulsória no Brasil."],
  ["dt_sin_pri", "Data de primeiros sintomas; referência temporal adotada neste projeto."],
  ["dt_notific", "Data de notificação no sistema de vigilância; usada apenas como fallback."],
  ["Fração amostral", "Registros coletados divididos pelo total do conjunto na fonte."],
  ["Estimativa", "Valor observado na amostra dividido pela fração amostral."],
  ["Cobertura", "Percentual do total estimado que a amostra efetivamente representa."],
  ["Suprimir", "Não publicar uma célula cuja amostra é pequena demais para ser confiável."],
];

export default async function MetodologiaPage() {
  const base = await getBase();
  const estadosAgravos = statusAgravos(base);
  const m = base.meta.metodologia;
  const q = base.meta.qualidade;
  const erroAmostral = Number((1.96 * Math.sqrt(0.25 / m.registrosColetados) * 100).toFixed(2));
  const div = q.divergenciaDias;
  const parte = (v: number | undefined) =>
    div && div.amostra ? pct(((v ?? 0) / div.amostra) * 100, 1) : "—";

  return (
    <>
      <header className="page-head border-b border-line">
        <div className="wrap py-14 lg:py-20">
          <SectionLabel numero="05">Método & limites</SectionLabel>
          <h1 data-reveal className="mt-5 max-w-[30ch] text-[clamp(2.2rem,4.4vw,3.8rem)] leading-[0.98]">
            Como o número foi produzido — e até onde ele vale
          </h1>
          <p data-reveal style={{ ["--d" as string]: 100 }} className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink-soft">
            Este projeto não publica microdados. Publica agregados por unidade da federação, com
            fração amostral declarada, inconsistências contabilizadas e limitações escritas antes de
            qualquer conclusão.
          </p>
          <div className="mt-8 max-w-3xl">
            <ProvenanceBar
              fonte="MS Dados Abertos (SRAG) + IBGE"
              periodo={`${m.periodoObservado.min ?? "—"} → ${m.periodoObservado.max ?? "—"}`}
              cobertura={pct(m.fracaoAmostral * 100, 2)}
              coleta={dataHora(base.meta.geradoEm)}
            />
          </div>
        </div>
      </header>

      <div className="wrap py-14 lg:py-20">
        {/* ------------------------------------------------ fluxo */}
        <section>
          <h2 data-reveal className="text-[1.7rem] leading-tight">O caminho do dado</h2>
          <ol data-reveal-stagger className="hairline-grid mt-6 grid gap-px bg-line md:grid-cols-4">
            {PIPELINE.map(([titulo, desc], i) => (
              <li key={titulo} className="group bg-surface p-5 transition-colors duration-300 hover:bg-canvas">
                <span className="mono text-[0.68rem] tracking-[0.14em] text-accent">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-display text-[1.02rem] leading-tight">{titulo}</h3>
                <p className="mt-2 text-[0.74rem] leading-relaxed text-ink-soft">{desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------ fórmulas */}
        <section className="mt-16">
          <h2 data-reveal className="text-[1.7rem] leading-tight">Definição dos indicadores</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="card card-hover p-5" data-reveal>
              <p className="kicker">Taxa por 100 mil habitantes</p>
              <p className="mono mt-3 rounded-lg bg-brand-wash px-3 py-3 text-[0.78rem] text-brand leading-relaxed">
                (notificações estimadas ÷ população residente) × 100.000
              </p>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-soft">
                População do IBGE para o mesmo ano do indicador. Quando a estimativa populacional do
                ano não existe, o projeto usa o ano mais próximo disponível e informa qual foi.
              </p>
            </div>
            <div className="card card-hover p-5" data-reveal>
              <p className="kicker">Estimativa a partir da amostra</p>
              <p className="mono mt-3 rounded-lg bg-brand-wash px-3 py-3 text-[0.78rem] text-brand leading-relaxed">
                valor estimado = valor observado ÷ {m.fracaoAmostral.toFixed(6)}
              </p>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-soft">
                A amostra é sistemática: uma página a cada {m.passo}, o que distribui a coleta ao
                longo de todo o arquivo, sem concentrar em um período.
              </p>
            </div>
            <div className="card card-hover p-5" data-reveal>
              <p className="kicker">Letalidade</p>
              <p className="mono mt-3 rounded-lg bg-brand-wash px-3 py-3 text-[0.78rem] text-brand">
                (óbitos por SRAG ÷ notificações estimadas) × 100
              </p>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-soft">
                Óbitos com evolução registrada como “óbito por SRAG”. Óbitos por outras causas não
                entram no numerador.
              </p>
            </div>
            <div className="card card-hover p-5" data-reveal>
              <p className="kicker">Cobertura da amostra</p>
              <p className="mono mt-3 rounded-lg bg-brand-wash px-3 py-3 text-[0.78rem] text-brand">
                cobertura = (amostra ÷ estimativa) × 100
              </p>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-soft">
                Serve como semáforo de confiança por UF: cobertura muito baixa indica que o número
                daquela unidade é mais frágil, mesmo quando a taxa parece alta.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- agravos */}
        <section id="agravos" className="mt-16 scroll-mt-28">
          <h2 data-reveal className="text-[1.7rem] leading-tight">Doenças monitoradas e definição de caso</h2>
          <p data-reveal className="mt-3 max-w-3xl text-[0.9rem] leading-relaxed text-ink-soft">
            “Monitorar uma doença” só faz sentido com uma definição explícita do que é contado. Cada
            agravo abaixo tem a sua — e ela aparece em todo cartão, tabela e CSV do portal. Agravos
            sem coleta ficam marcados como pendentes: nenhum número é preenchido por estimativa
            externa, média histórica ou zero.
          </p>
          <div data-reveal-stagger className="mt-8 grid gap-5 lg:grid-cols-2">
            {LISTA_AGRAVOS.map((a) => {
              const st = estadosAgravos.find((e) => e.id === a.id);
              return (
                <article key={a.id} className="card relative overflow-hidden p-6">
                  <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: a.cor }} />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[1.3rem] leading-tight">{a.nomeCompleto}</h3>
                    <Badge tone={st?.estado === "coletado" ? "ok" : st?.estado === "erro" ? "erro" : "neutro"}>
                      {st?.estado === "coletado" ? `coletado · ${st.anoReferencia}` : st?.estado === "erro" ? "coleta falhou" : "aguardando coleta"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-[0.86rem] font-medium text-ink">{a.rotuloContagem}</p>
                  <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-soft">{a.definicao}</p>
                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-[0.76rem] sm:grid-cols-2">
                    <div>
                      <dt className="kicker">Sistema</dt>
                      <dd className="mt-0.5 text-ink-soft">{a.sistema}</dd>
                    </div>
                    <div>
                      <dt className="kicker">Método</dt>
                      <dd className="mt-0.5 text-ink-soft">
                        {a.metodoColeta === "censo" ? "Censo (todas as páginas)" : "Amostragem sistemática"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="kicker">Recurso</dt>
                      <dd className="mono mt-0.5 break-all text-[0.7rem] text-ink-mute">{a.recurso}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="kicker">Referência temporal</dt>
                      <dd className="mono mt-0.5 text-[0.7rem] text-ink-mute">{a.referenciaTemporal}</dd>
                    </div>
                  </dl>
                  <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-[0.78rem] leading-snug text-ink-soft">
                    {a.limitacoes.map((l) => (
                      <li key={l} className="flex gap-2">
                        <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent" />
                        {l}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
          <div data-reveal className="mt-6">
            <NotaMetodologica>
              Dengue e Zika usam a definição de “caso provável” dos boletins de arboviroses do
              Ministério da Saúde (notificações exceto descartadas). Como essas rotas não informam o
              total de registros, o universo é medido por busca binária de páginas e a amostra é
              estratificada por ano. Febre amarela é coletada inteira (censo): são casos humanos
              confirmados, localizados pelo local provável de infecção. A regra de supressão
              (&lt; 5 registros) esconde UFs com contagens muito baixas.
            </NotaMetodologica>
          </div>
        </section>

        {/* ------------------------------------------------ amostragem */}
        <section className="mt-16 grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">Amostragem declarada</h2>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-soft">
              O conjunto SRAG 2019-2026 tem {int(m.universoFonte)} registros distribuídos em{" "}
              {int(m.paginasTotais)} páginas de {int(m.limitePorPagina)}. Foram solicitadas{" "}
              {m.paginasSolicitadas} páginas, com passo de {m.passo}, resultando em{" "}
              {int(m.registrosColetados)} registros — {pct(m.fracaoAmostral * 100, 2)} do universo.
            </p>
            <dl data-reveal className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4">
              {[
                ["Universo na fonte", int(m.universoFonte)],
                ["Registros coletados", int(m.registrosColetados)],
                ["Páginas solicitadas", `${m.paginasSolicitadas} de ${int(m.paginasTotais)}`],
                ["Fração amostral", pct(m.fracaoAmostral * 100, 2)],
                ["Erro amostral aproximado", `± ${erroAmostral} p.p.`],
                ["Período observado", `${m.periodoObservado.min} → ${m.periodoObservado.max}`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-[0.8rem] text-ink-soft">{k}</dt>
                  <dd className="mono text-[0.78rem]">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5">
              <NotaMetodologica>
                O erro de ± {erroAmostral} p.p. vale para proporções próximas de 50% sob amostragem
                aleatória simples. Como as páginas agrupam registros sem ordem aleatória, o erro
                efetivo é maior — por isso as taxas são apresentadas como ordem de grandeza, não como
                medida exata. Para valores oficiais, consulte o DATASUS.
              </NotaMetodologica>
            </div>
          </div>

          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">Qualidade do arquivo de origem</h2>
            <p className="mt-3 text-[0.9rem] leading-relaxed text-ink-soft">
              Durante a validação apareceu um problema que muda a série histórica: a data de
              notificação é anterior à data de primeiros sintomas em{" "}
              <strong className="font-semibold">{pct(q.inconsistenciasDataPct, 2)}</strong> dos{" "}
              {int(q.inconsistenciasData)} registros analisados.
            </p>

            <div data-reveal className="mt-6 rounded-xl border border-accent/25 border-l-4 border-l-accent bg-surface p-5">
              <p className="mono text-[0.68rem] uppercase tracking-[0.14em] text-accent">
                divergência em dias · {int(div?.amostra ?? m.registrosColetados)} registros
              </p>
              <ul className="mt-3 space-y-2 text-[0.78rem] leading-relaxed text-ink-soft">
                <li>
                  <span className="mono text-ink">{parte(div?.normal)}</span> — notificação anterior aos
                  sintomas (atraso de digitação, plausível).
                </li>
                <li>
                  <span className="mono text-ink">{parte((div?.ate7 ?? 0) + (div?.ate30 ?? 0))}</span> — até
                  30 dias entre notificação e primeiros sintomas (dentro do esperado).
                </li>
                <li>
                  <span className="mono text-ink">{parte(div?.ate180)}</span> — de 31 a 180 dias de
                  defasagem: já incompatível com o fluxo de notificação.
                </li>
                <li>
                  <span className="mono text-ink">{parte(div?.ate400)}</span> — de 181 a 400 dias, com
                  concentração em torno de <span className="mono text-ink">365 dias</span>: o campo de
                  notificação parece deslocado em um ano.
                </li>
              </ul>
            </div>

            <p className="mt-5 text-[0.88rem] leading-relaxed text-ink-soft">
              Consequência prática: agrupando por data de notificação, o ano de 2022 praticamente
              desaparecia da série. A decisão metodológica foi usar{" "}
              <span className="mono text-[0.78rem]">dt_sin_pri</span> como referência temporal, com
              fallback para <span className="mono text-[0.78rem]">dt_notific</span> quando ausente — e
              registrar a divergência no metadado de cada coleta, em vez de escondê-la.
            </p>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-soft">
              A série resultante é compatível com o que se conhece da pandemia: crescimento em 2020,
              pico em 2021, queda a partir de 2022.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------ território */}
        <section className="mt-16 grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">Território e mapa</h2>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-soft">
              A malha das 27 unidades da federação vem da API de malhas do IBGE, em GeoJSON, e é
              projetada no cliente. Os códigos de 2 dígitos do IBGE são a chave de junção entre
              território, população e indicador.
            </p>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-soft">
              O mapa usa rampa sequencial em uma única família de cor, com hachura para unidades sem
              dados. Não há cor de “risco”: classificar territórios em vermelho sem modelo
              epidemiológico seria afirmar algo que o dado não sustenta.
            </p>
          </div>
          <div className="card card-hover p-5" data-reveal>
            <p className="kicker">Chaves territoriais</p>
            <ul className="mt-3 space-y-2 text-[0.78rem] leading-relaxed text-ink-soft">
              <li>
                <span className="mono text-ink">codarea</span> — código IBGE de 2 dígitos da UF na
                malha.
              </li>
              <li>
                <span className="mono text-ink">co_mun_not</span> — código de 6 dígitos do município de
                notificação no SRAG.
              </li>
              <li>
                <span className="mono text-ink">N3[all]</span> — nível territorial usado nos agregados
                populacionais do IBGE.
              </li>
            </ul>
            <p className="mt-4 text-[0.72rem] leading-relaxed text-ink-mute">
              Junções que falham não são preenchidas por aproximação: a linha fica sem taxa e o mapa
              mostra a UF como sem dados.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------ LGPD */}
        <section className="mt-16">
          <h2 data-reveal className="text-[1.7rem] leading-tight">Dados pessoais e segurança</h2>
          <div data-reveal-stagger className="hairline-grid mt-6 grid gap-px bg-line md:grid-cols-2">
            {[
              [
                "Nenhum microdado publicado",
                "O pipeline agrega por UF e mês antes de qualquer resposta. Nenhum campo identificável — nome, data de nascimento, CNS, endereço — sai do servidor.",
              ],
              [
                "Minimização por célula",
                "Células com menos de 5 registros na amostra são suprimidas: a taxa não é exibida, em vez de ser calculada sobre base instável.",
              ],
              [
                "Credenciais só no servidor",
                "Variáveis sensíveis ficam em ambiente de servidor. O cliente nunca recebe chave, token ou URL com credencial embutida.",
              ],
              [
                "Superfície de rede restrita",
                "A rota de validação aceita apenas recursos de uma allowlist, com timeout de 25 s, retry único e sem repassar o corpo bruto da fonte.",
              ],
              [
                "Sem rastreamento de usuário",
                "Não há cookie de analytics, pixel de terceiros nem criação de perfil de navegação. O checklist de integração fica no localStorage do próprio navegador.",
              ],
              [
                "Auditoria da coleta",
                "Cada execução grava fonte, parâmetros, HTTP, páginas e horário — a proveniência é verificável, não narrada.",
              ],
            ].map(([titulo, texto]) => (
              <div key={titulo} className="bg-surface p-6 transition-colors duration-300 hover:bg-canvas">
                <h3 className="font-display text-[1.05rem]">{titulo}</h3>
                <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-soft">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ limitações */}
        <section className="mt-16 grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">Limitações</h2>
            <ul data-reveal-stagger className="mt-4 space-y-3 text-[0.88rem] leading-relaxed text-ink-soft">
              {[
                "Os valores são estimativas amostrais, não contagens oficiais. Não servem para decisão clínica nem para comparação com boletins oficiais sem ressalva.",
                "O conjunto SRAG é atualizado conforme publicação do Ministério da Saúde; o snapshot tem data e não se atualiza sozinho.",
                "A inconsistência entre datas de notificação e de sintomas é do arquivo de origem e não foi corrigida registro a registro — foi contornada pela escolha da referência temporal.",
                "Municípios aparecem apenas quando há amostra suficiente; a lista municipal é indicativa, não um ranking.",
                "Não há dados de leitos ou de cobertura vacinal integrados nesta versão; as fontes correspondentes estão catalogadas, mas não habilitadas.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">Glossário</h2>
            <dl data-reveal-stagger className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4">
              {GLOSSARIO.map(([termo, def]) => (
                <div key={termo} className="py-2.5">
                  <dt className="mono text-[0.72rem] text-ink">{termo}</dt>
                  <dd className="mt-1 text-[0.78rem] leading-relaxed text-ink-soft">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ------------------------------------------------ referências */}
        <section className="mt-16">
          <h2 data-reveal className="text-[1.7rem] leading-tight">Referências e documentação</h2>
          <ul data-reveal-stagger className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface px-4">
            {[
              ["API de Dados Abertos do Ministério da Saúde", "https://apidadosabertos.saude.gov.br/v1/"],
              ["Manual de utilização da API e-SUS Notifica (DATASUS)", "https://datasus.saude.gov.br/wp-content/uploads/2022/02/Manual-de-Utilizacao-da-API-e-Sus-Notifica.pdf"],
              ["API de Localidades do IBGE", "https://servicodados.ibge.gov.br/api/docs/localidades"],
              ["API de Agregados do IBGE", "https://servicodados.ibge.gov.br/api/docs/agregados?versao=3"],
              ["Lei Geral de Proteção de Dados (Lei 13.709/2018)", "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm"],
              ["Open Datasheets — documentação de conjuntos de dados", "https://opendatasheets.github.io/"],
            ].map(([titulo, url]) => (
              <li key={url} className="flex flex-wrap items-baseline gap-3 py-3">
                <a href={url} target="_blank" rel="noreferrer" className="text-[0.86rem] text-ink link-underline">
                  {titulo}
                </a>
                <span className="mono ml-auto max-w-[45%] truncate text-[0.68rem] text-ink-mute">{url}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <NotaMetodologica>
              Snapshot gerado em {dataHora(base.meta.geradoEm)} pelo ETL do próprio projeto
              (<span className="mono text-[0.72rem]">scripts/etl.mjs</span>), com{" "}
              {int(base.meta.metodologia.registrosColetados)} registros e{" "}
              {base.ufs.length} unidades da federação. O banco Postgres recebe o mesmo recorte via{" "}
              <span className="mono text-[0.72rem]">db/seed.sql</span>; a aplicação usa o snapshot
              quando não há banco configurado e declara isso na interface.
            </NotaMetodologica>
          </div>
        </section>
      </div>
    </>
  );
}
