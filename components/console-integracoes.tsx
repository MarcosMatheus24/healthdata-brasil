"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";

type RespostaValidacao = {
  estado: string;
  recurso?: string;
  urlConsultada?: string;
  httpStatus?: number | null;
  latenciaMs?: number;
  totalRegistros?: number | null;
  registrosNaPagina?: number;
  chavesResposta?: string[];
  camposRegistro?: string[];
  schemaValidado?: boolean;
  mensagem?: string;
  verificadoEm?: string;
  segredosEnviados?: boolean;
};

const ESTADOS = [
  { id: "nao_configurada", rotulo: "Não configurada", desc: "Nenhum endpoint confirmado; interface neutra e sem números inventados." },
  { id: "carregando", rotulo: "Carregando", desc: "Requisição em andamento; esqueleto e tempo de espera visíveis." },
  { id: "conectado", rotulo: "Conectado", desc: "HTTP 200 com schema reconhecido e registros > 0." },
  { id: "nao_autorizado", rotulo: "Não autorizado", desc: "HTTP 401/403 ou fonte que exige autorização institucional." },
  { id: "sem_dados", rotulo: "Sem dados", desc: "HTTP 200 com conjunto vazio: ausência não vira zero." },
  { id: "erro_rede", rotulo: "Erro de rede", desc: "Falha de transporte ou 5xx; o último snapshot válido é preservado." },
  { id: "resposta_invalida", rotulo: "Resposta inválida", desc: "Corpo não é JSON ou não contém as chaves esperadas." },
] as const;

const CHECKLIST = [
  { id: "doc", texto: "Documentação oficial lida e referenciada" },
  { id: "auth", texto: "Autorização e controles de acesso confirmados" },
  { id: "servidor", texto: "Credenciais apenas no servidor (nunca no cliente)" },
  { id: "endpoint", texto: "Endpoint confirmado na documentação" },
  { id: "http", texto: "Resposta HTTP real obtida e registrada" },
  { id: "schema", texto: "Schema validado (chaves e tipos conferidos)" },
  { id: "paginacao", texto: "Paginação e limites de requisição respeitados" },
  { id: "atualizacao", texto: "Periodicidade de atualização definida" },
  { id: "rastreio", texto: "Rastreabilidade da origem gravada na coleta" },
  { id: "lgpd", texto: "Proteção de dados e minimização aplicadas" },
];

const CHAVE = "healthdata.checklist.v1";

export function ConsoleIntegracoes({ recursoInicial = "srag" }: { recursoInicial?: string }) {
  const [recurso, setRecurso] = useState(recursoInicial);
  const [resposta, setResposta] = useState<RespostaValidacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [estadoPreview, setEstadoPreview] = useState<string>("conectado");
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) setMarcados(JSON.parse(salvo));
    } catch {
      /* armazenamento indisponível */
    }
  }, []);

  const alternar = (id: string) => {
    setMarcados((m) => {
      const novo = { ...m, [id]: !m[id] };
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo));
      } catch {
        /* ignora */
      }
      return novo;
    });
  };

  const total = CHECKLIST.filter((c) => marcados[c.id]).length;

  const validar = async () => {
    setCarregando(true);
    setResposta(null);
    try {
      const r = await fetch("/api/integracoes/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recurso }),
      });
      setResposta(await r.json());
    } catch (e) {
      setResposta({
        estado: "erro_rede",
        mensagem: e instanceof Error ? e.message : "Falha de rede.",
      });
    } finally {
      setCarregando(false);
    }
  };

  const estadoAtual = carregando ? "carregando" : resposta?.estado ?? "nao_configurada";
  const tom =
    estadoAtual === "conectado"
      ? "ok"
      : estadoAtual === "carregando"
        ? "info"
        : estadoAtual === "nao_configurada"
          ? "neutro"
          : "alerta";

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      {/* -------------------------------------------------------- validação */}
      <section className="card card-hover p-6" data-reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Validar uma fonte</h2>
          <Badge tone={tom as "ok" | "info" | "neutro" | "alerta"}>
            {carregando ? "carregando" : (resposta?.estado ?? "nao configurada").replace("_", " ")}
          </Badge>
        </div>
        <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-soft">
          A validação roda no servidor, com timeout de 25 s e allowlist de recursos. Nenhuma
          credencial é enviada, e a resposta é reduzida a metadados — nunca microdados.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label htmlFor="recurso" className="kicker">
            Recurso
          </label>
          <select
            id="recurso"
            value={recurso}
            onChange={(e) => setRecurso(e.target.value)}
            className="mono border border-line-strong px-3 py-2 text-[0.76rem] transition-colors hover:border-brand focus:border-brand focus:outline-none"
          >
            <option value="srag">SRAG 2019-2026 · MS</option>
            <option value="dengue">Dengue · MS (SINAN)</option>
            <option value="zika">Zika · MS (SINAN)</option>
            <option value="febreamarela">Febre amarela (humanos) · MS</option>
            <option value="populacao">População residente · IBGE</option>
            <option value="esus_notifica">e-SUS Notifica (restrito)</option>
          </select>
          <button type="button" onClick={validar} disabled={carregando} className="btn btn-primary px-4 py-2 text-[0.78rem] disabled:opacity-60">
            {carregando ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Consultando…
              </>
            ) : (
              <>
                Executar validação <span className="btn-arrow" aria-hidden>→</span>
              </>
            )}
          </button>
        </div>

        <div className="relative mt-6 min-h-[210px] overflow-hidden rounded-xl border border-line bg-canvas p-4">
          {carregando && (
            <div className="scanline pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-brand/10 to-transparent" />
          )}
          {carregando && (
            <div className="space-y-2">
              {[70, 45, 90, 60].map((w, i) => (
                <div key={i} className="skeleton h-2" style={{ width: `${w}%` }} />
              ))}
              <p className="mono pt-2 text-[0.68rem] uppercase tracking-[0.14em] text-ink-mute">
                aguardando resposta da fonte oficial
              </p>
            </div>
          )}

          {!carregando && !resposta && (
            <div className="swap-in">
              <p className="mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-mute">Nenhuma consulta feita</p>
              <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-soft">
                Escolha um recurso e execute. HTTP, latência, chaves e contagem só aparecem se
                houver resposta real — nada é presumido.
              </p>
            </div>
          )}

          {!carregando && resposta && (
            <div className="swap-in">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[0.72rem]">
                <div>
                  <dt className="kicker">HTTP</dt>
                  <dd className="mono mt-0.5">{resposta.httpStatus ?? "—"}</dd>
                </div>
                <div>
                  <dt className="kicker">Latência</dt>
                  <dd className="mono mt-0.5">{resposta.latenciaMs ? `${resposta.latenciaMs} ms` : "—"}</dd>
                </div>
                <div>
                  <dt className="kicker">Registros na página</dt>
                  <dd className="mono mt-0.5">{resposta.registrosNaPagina ?? "—"}</dd>
                </div>
                <div>
                  <dt className="kicker">Total da fonte</dt>
                  <dd className="mono mt-0.5">{resposta.totalRegistros?.toLocaleString("pt-BR") ?? "—"}</dd>
                </div>
              </dl>

              <p className="mt-4 text-[0.8rem] leading-relaxed text-ink-soft">{resposta.mensagem}</p>

              {resposta.chavesResposta?.length ? (
                <p className="mono mt-3 truncate text-[0.68rem] text-ink-mute">
                  chaves: {resposta.chavesResposta.join(", ")}
                </p>
              ) : null}

              {resposta.camposRegistro?.length ? (
                <details className="mt-3 rounded-lg border border-line bg-surface px-3 py-2">
                  <summary className="mono cursor-pointer text-[0.66rem] uppercase tracking-[0.1em] text-ink-mute">
                    {resposta.camposRegistro.length} campos por registro (só nomes, sem valores)
                  </summary>
                  <p className="mono mt-2 text-[0.66rem] leading-relaxed text-ink-soft">{resposta.camposRegistro.join(", ")}</p>
                </details>
              ) : null}

              {resposta.urlConsultada && (
                <p className="mono mt-2 truncate text-[0.68rem] text-ink-mute">{resposta.urlConsultada}</p>
              )}

              <p className="mono mt-3 text-[0.65rem] uppercase tracking-[0.12em] text-ink-mute">
                segredos enviados: {resposta.segredosEnviados ? "sim" : "não"}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------- estados */}
      <section className="card card-hover p-6" data-reveal style={{ ["--d" as string]: 120 }}>
        <h2 className="font-display text-xl">Estados de interface</h2>
        <p className="mt-2 text-[0.8rem] leading-relaxed text-ink-soft">
          Sete estados previstos no projeto. Selecione para ver como a interface se comporta — os
          estados são de projeto, não uma resposta oficial.
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEstadoPreview(e.id)}
              className={`mono rounded-full border px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.1em] transition-all duration-300 ${
                estadoPreview === e.id
                  ? "scale-105 border-brand bg-brand text-on-brand shadow-[0_6px_16px_-8px_var(--color-brand)]"
                  : "border-line-strong text-ink-mute hover:border-brand hover:text-brand"
              }`}
            >
              {e.rotulo}
            </button>
          ))}
        </div>

        <div key={estadoPreview} className="swap-in mt-5 rounded-xl border border-line bg-canvas p-4">
          <p className="mono text-[0.68rem] uppercase tracking-[0.14em] text-accent">
            pré-visualização · {ESTADOS.find((e) => e.id === estadoPreview)?.rotulo}
          </p>
          <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-soft">
            {ESTADOS.find((e) => e.id === estadoPreview)?.desc}
          </p>
          <div className="mt-4">
            {estadoPreview === "carregando" && (
              <div className="space-y-2">
                <div className="skeleton h-2 w-3/4" />
                <div className="skeleton h-2 w-1/2" />
              </div>
            )}
            {estadoPreview === "conectado" && (
              <p className="mono text-[0.7rem] text-brand">HTTP 200 · 1.000 registros · schema ok</p>
            )}
            {estadoPreview === "nao_autorizado" && (
              <p className="mono text-[0.7rem] text-accent">HTTP 403 · credencial ausente no servidor</p>
            )}
            {estadoPreview === "sem_dados" && (
              <p className="mono text-[0.7rem] text-ink-mute">HTTP 200 · 0 registros · exibido como ausência, não zero</p>
            )}
            {estadoPreview === "erro_rede" && (
              <p className="mono text-[0.7rem] text-danger">timeout · último snapshot válido preservado</p>
            )}
            {estadoPreview === "resposta_invalida" && (
              <p className="mono text-[0.7rem] text-danger">corpo não-JSON · schema não validado</p>
            )}
            {estadoPreview === "nao_configurada" && (
              <p className="mono text-[0.7rem] text-ink-mute">nenhum endpoint confirmado · sem requisição</p>
            )}
          </div>
        </div>

        <div className="mt-7">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-lg">Checklist de conexão</h3>
            <span className="mono text-[0.68rem] text-ink-mute">{total}/10</span>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-deep"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={CHECKLIST.length}
            aria-valuenow={total}
            aria-label="Progresso do checklist"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-ok transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${(total / CHECKLIST.length) * 100}%` }}
            />
          </div>
          <ul className="mt-3 space-y-1.5">
            {CHECKLIST.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 text-[0.8rem] leading-snug transition-colors hover:bg-canvas">
                  <input
                    type="checkbox"
                    checked={Boolean(marcados[c.id])}
                    onChange={() => alternar(c.id)}
                    className="mt-[2px] h-4 w-4 accent-[var(--color-brand)] transition-transform active:scale-90"
                  />
                  <span
                    className={`transition-colors duration-300 ${
                      marcados[c.id] ? "text-ink line-through decoration-ok/50 decoration-2" : "text-ink-mute"
                    }`}
                  >
                    {c.texto}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-ink-mute">
            Marcado apenas neste navegador (localStorage). Nada é enviado ao servidor.
          </p>
        </div>
      </section>
    </div>
  );
}
