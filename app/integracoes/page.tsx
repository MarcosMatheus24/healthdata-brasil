import type { Metadata } from "next";
import { getBase, statusFontes } from "@/lib/data";
import { dataHora, int, pct } from "@/lib/format";
import { ConsoleIntegracoes } from "@/components/console-integracoes";
import { Badge, NotaMetodologica, ProvenanceBar, SectionLabel } from "@/components/ui";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Integrações e fontes oficiais",
  description:
    "Estado das fontes oficiais, contrato do adaptador, validação real de endpoint no servidor e catálogo da API REST própria.",
};

const ENDPOINTS = [
  { metodo: "GET", rota: "/api/fontes/status", desc: "Estado das fontes sem expor segredos" },
  { metodo: "GET", rota: "/api/indicadores?ano=&uf=", desc: "Agregados validados por UF e período" },
  { metodo: "GET", rota: "/api/territorios?uf=&codigo=", desc: "Códigos IBGE e validação territorial" },
  { metodo: "POST", rota: "/api/integracoes/validar", desc: "Ação restrita, executada no servidor" },
  { metodo: "GET", rota: "/api/export?ano=&uf=", desc: "CSV agregado com proveniência embutida" },
  { metodo: "GET", rota: "/api/saude", desc: "Verificação de saúde do serviço" },
];

const ADAPTADOR = `// Contrato do adaptador de fonte (executado apenas no servidor)
interface Fonte {
  id: string;
  consultar(filtros: Filtros): Promise<{ registros: RegistroBruto[]; metadados: Metadados }>;
  validarSchema(resposta: unknown): ResultadoValidacao;
  normalizar(registros: RegistroBruto[]): RegistroAgregado[];
}

// Metadados obrigatórios em toda coleta
type Metadados = {
  fonte: string;
  recurso: string;
  httpStatus: number;
  coletadoEm: string;
  totalFonte: number | null;
  fracaoAmostral: number | null;
  paginas: number[];
};`;

export default async function IntegracoesPage() {
  const base = await getBase();
  const fontes = statusFontes(base);
  const coleta = base.meta.coletas?.[0];

  return (
    <>
      <header className="page-head border-b border-line">
        <div className="wrap py-14 lg:py-20">
          <SectionLabel numero="04">Fontes & arquitetura</SectionLabel>
          <h1 data-reveal className="mt-5 max-w-[26ch] text-[clamp(2.2rem,4.4vw,3.8rem)] leading-[0.98]">
            Integração oficial, com acesso declarado
          </h1>
          <p data-reveal style={{ ["--d" as string]: 100 }} className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink-soft">
            Três fontes, três níveis de acesso: dados abertos do Ministério da Saúde, APIs do IBGE e
            a API restrita do e-SUS Notifica — esta última documentada, mas deliberadamente não
            habilitada.
          </p>
        </div>
      </header>

      <div className="wrap py-10">
        {/* -------------------------------------------------------- fontes */}
        <div data-reveal-stagger className="hairline-grid grid gap-px bg-line md:grid-cols-3">
          {fontes.map((f) => (
            <article key={f.id} className="bg-surface p-6 transition-colors duration-300 hover:bg-canvas">
              <div className="flex items-start justify-between gap-3">
                <p className="mono text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">{f.orgao}</p>
                <Badge tone={f.estado === "conectado" ? "ok" : f.estado === "erro" ? "erro" : "alerta"}>
                  {f.estado.replace(/_/g, " ")}
                </Badge>
              </div>
              <h2 className="mt-4 font-display text-[1.2rem] leading-snug">{f.nome}</h2>
              <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-soft">{f.observacao}</p>

              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[0.7rem]">
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">Autenticação</dt>
                  <dd className="mono">{f.requerAutenticacao ? "obrigatória" : "não exige"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">HTTP</dt>
                  <dd className="mono">{f.httpStatus ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">Registros</dt>
                  <dd className="mono">{f.registros === null ? "—" : int(f.registros)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-mute">Última coleta</dt>
                  <dd className="mono text-right">{f.ultimaColeta ? dataHora(f.ultimaColeta) : "—"}</dd>
                </div>
              </dl>

              <a
                href={f.urlBase}
                target="_blank"
                rel="noreferrer"
                className="mono mt-4 inline-block truncate text-[0.68rem] text-brand link-underline"
              >
                {f.urlBase}
              </a>
            </article>
          ))}
        </div>

        {/* -------------------------------------------------------- console */}
        <div className="mt-14">
          <SectionLabel numero="4.1">Console de integração</SectionLabel>
          <div className="mt-6">
            <ConsoleIntegracoes />
          </div>
        </div>

        {/* -------------------------------------------------------- contrato */}
        <div className="mt-16 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">Contrato do adaptador</h2>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-soft">
              Cada fonte implementa a mesma interface. O serviço no servidor aplica timeout,
              paginação e validação de schema antes de qualquer normalização; o front-end nunca fala
              com a fonte oficial diretamente.
            </p>
            <pre data-reveal className="theme-night mono mt-5 overflow-x-auto rounded-2xl border border-line p-5 text-[0.72rem] leading-relaxed text-ink-soft shadow-[0_20px_50px_-24px_rgb(6_13_28/0.6)]">
              <code>{ADAPTADOR}</code>
            </pre>
            <div className="mt-5">
              <NotaMetodologica>
                O e-SUS Notifica exige autorização institucional, IP liberado e credenciais que
                permanecem apenas no servidor. O adaptador existe no código, mas a integração fica
                desabilitada até que a autorização seja formalizada — e a interface declara isso em
                vez de simular dados.
              </NotaMetodologica>
            </div>
          </div>

          <div>
            <h2 data-reveal className="text-[1.7rem] leading-tight">API REST própria</h2>
            <p className="mt-3 text-[0.88rem] leading-relaxed text-ink-soft">
              Caminhos propostos e implementados neste projeto. Não são endpoints oficiais do
              Ministério da Saúde.
            </p>
            <ul data-reveal-stagger className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {ENDPOINTS.map((e) => (
                <li key={e.rota} className="flex flex-wrap items-baseline gap-3 px-4 py-3 transition-colors hover:bg-canvas">
                  <span
                    className={`mono rounded-md border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] ${
                      e.metodo === "GET" ? "border-brand/30 bg-brand-wash text-brand" : "border-accent/40 bg-accent-wash text-accent"
                    }`}
                  >
                    {e.metodo}
                  </span>
                  <code className="mono text-[0.76rem]">{e.rota}</code>
                  <span className="ml-auto text-[0.72rem] text-ink-mute">{e.desc}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-2">
              <a href="/api/fontes/status" className="btn btn-ghost px-3 py-1.5 text-[0.72rem]" target="_blank" rel="noreferrer">
                Abrir /api/fontes/status
              </a>
              <a href="/api/indicadores?ano=2025" className="btn btn-ghost px-3 py-1.5 text-[0.72rem]" target="_blank" rel="noreferrer">
                Abrir /api/indicadores
              </a>
              <a href="/api/territorios" className="btn btn-ghost px-3 py-1.5 text-[0.72rem]" target="_blank" rel="noreferrer">
                Abrir /api/territorios
              </a>
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------- coleta */}
        <div className="mt-16">
          <h2 data-reveal className="text-[1.7rem] leading-tight">Trilha da última coleta</h2>
          <p className="mt-2 text-[0.85rem] text-ink-soft">
            Cada extração registra parâmetros, HTTP, páginas e fração amostral — a auditoria fica no
            banco, não na memória do processo.
          </p>

          <div className="mt-6 table-shell overflow-x-auto border border-line">
            <table className="w-full min-w-[720px] text-[0.78rem]">
              <thead>
                <tr className="border-b border-line bg-canvas-deep text-left">
                  <th className="px-3 py-2 font-medium">Recurso</th>
                  <th className="px-3 py-2 font-medium">HTTP</th>
                  <th className="px-3 py-2 text-right font-medium">Páginas</th>
                  <th className="px-3 py-2 text-right font-medium">Registros</th>
                  <th className="px-3 py-2 text-right font-medium">Universo</th>
                  <th className="px-3 py-2 text-right font-medium">Fração</th>
                  <th className="px-3 py-2 font-medium">Concluída em</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono px-3 py-2 text-[0.68rem]">{coleta?.recurso ?? "/vigilancia-e-meio-ambiente/srag-2019-2026"}</td>
                  <td className="mono px-3 py-2">{coleta?.httpStatus ?? 200}</td>
                  <td className="mono px-3 py-2 text-right">{coleta?.paginas?.length ?? "—"}</td>
                  <td className="mono px-3 py-2 text-right">{int(coleta?.registros ?? base.meta.metodologia.registrosColetados)}</td>
                  <td className="mono px-3 py-2 text-right">{int(coleta?.totalFonte ?? base.meta.metodologia.universoFonte)}</td>
                  <td className="mono px-3 py-2 text-right">
                    {pct((coleta?.fracaoAmostral ?? base.meta.metodologia.fracaoAmostral) * 100, 2)}
                  </td>
                  <td className="mono px-3 py-2 text-[0.68rem]">{dataHora(coleta?.finalizadoEm ?? base.meta.geradoEm)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <ProvenanceBar
              fonte="MS Dados Abertos + IBGE"
              periodo={`${base.meta.metodologia.periodoObservado.min} → ${base.meta.metodologia.periodoObservado.max}`}
              cobertura={pct(base.meta.metodologia.fracaoAmostral * 100, 2)}
              coleta={dataHora(coleta?.finalizadoEm ?? base.meta.geradoEm)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
