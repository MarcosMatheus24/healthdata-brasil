"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { AGRAVOS, LISTA_AGRAVOS, type AgravoId } from "@/lib/agravos";

export type EstadoAgravoResumo = { id: AgravoId; estado: "coletado" | "pendente" | "erro" };

/**
 * Filtro de doenças: pílulas com cor de identificação e indicação de estado.
 * Agravos sem coleta continuam selecionáveis — a tela explica o porquê em vez
 * de esconder a opção. A pílula ativa desliza entre as opções.
 */
export function AgravoSelector({
  valor,
  onChange,
  estados,
  className = "",
}: {
  valor: AgravoId;
  onChange: (id: AgravoId) => void;
  estados: EstadoAgravoResumo[];
  className?: string;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [pilula, setPilula] = useState({ x: 0, w: 0, pronto: false });
  const estadoDe = (id: AgravoId) => estados.find((e) => e.id === id)?.estado ?? "pendente";

  useLayoutEffect(() => {
    const medir = () => {
      const t = trilho.current;
      const el = t?.querySelector<HTMLElement>(`[data-agravo="${valor}"]`);
      if (!t || !el) return;
      setPilula({ x: el.offsetLeft, w: el.offsetWidth, pronto: true });
      // no celular o trilho rola na horizontal: centraliza a opção ativa
      if (t.scrollWidth > t.clientWidth) {
        t.scrollTo({ left: el.offsetLeft - (t.clientWidth - el.offsetWidth) / 2, behavior: "smooth" });
      }
    };
    medir();
    window.addEventListener("resize", medir);
    document.fonts?.ready.then(medir).catch(() => {});
    return () => window.removeEventListener("resize", medir);
  }, [valor]);

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span className="kicker hidden shrink-0 sm:inline">Doença</span>
      <div
        ref={trilho}
        role="radiogroup"
        aria-label="Filtrar por doença"
        className="relative flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line-strong bg-surface p-1 [scrollbar-width:none]"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          const i = LISTA_AGRAVOS.findIndex((a) => a.id === valor);
          const prox = LISTA_AGRAVOS[(i + (e.key === "ArrowRight" ? 1 : -1) + LISTA_AGRAVOS.length) % LISTA_AGRAVOS.length];
          onChange(prox.id);
          trilho.current?.querySelector<HTMLElement>(`[data-agravo="${prox.id}"]`)?.focus();
        }}
      >
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 rounded-full shadow-[0_6px_16px_-8px_rgb(11_19_36/0.55)] transition-[transform,width,background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: pilula.w,
            transform: `translateX(${pilula.x}px)`,
            opacity: pilula.pronto ? 1 : 0,
            backgroundColor: "var(--color-ink)",
          }}
        />
        {LISTA_AGRAVOS.map((a) => {
          const ativo = a.id === valor;
          const estado = estadoDe(a.id);
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={ativo ? 0 : -1}
              data-agravo={a.id}
              onClick={() => onChange(a.id)}
              title={estado === "coletado" ? a.rotuloContagem : `${a.nome}: aguardando coleta`}
              className={`relative z-10 flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[0.8rem] font-medium transition-colors duration-300 ${
                ativo ? "text-canvas" : "text-ink-soft hover:text-ink"
              }`}
            >
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full transition-transform duration-300 ${ativo ? "scale-125" : ""}`}
                style={{
                  background: a.cor,
                  boxShadow: ativo ? `0 0 0 3px color-mix(in oklab, ${a.cor} 35%, transparent)` : undefined,
                }}
              />
              {a.nome}
              {estado !== "coletado" && (
                <span
                  className={`mono rounded-full px-1.5 py-px text-[0.56rem] uppercase tracking-[0.08em] ${
                    ativo ? "bg-white/15 text-canvas/80" : estado === "erro" ? "bg-danger-wash text-danger" : "bg-canvas-deep text-ink-mute"
                  }`}
                >
                  {estado === "erro" ? "erro" : "sem coleta"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Painel exibido quando o agravo escolhido ainda não tem coleta (ou a última falhou). */
export function AgravoPendente({
  agravo,
  estado,
  mensagem,
}: {
  agravo: AgravoId;
  estado: "pendente" | "erro" | "coletado";
  mensagem?: string | null;
}) {
  const def = AGRAVOS[agravo];
  const comando = `npm run etl -- --agravos=${agravo}`;
  return (
    <section key={agravo} className="swap-in relative overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: def.cor }}
      />
      <div className="relative grid gap-10 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`mono inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
                estado === "erro" ? "bg-danger-wash text-danger" : "bg-accent-wash text-accent"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${estado === "erro" ? "bg-danger" : "dot-live bg-accent"}`} />
              {estado === "erro" ? "última coleta falhou" : "aguardando primeira coleta"}
            </span>
            <span className="mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-mute">{def.sistema}</span>
          </div>
          <h2 className="mt-5 text-[clamp(1.6rem,3vw,2.3rem)] leading-tight">
            {estado === "erro"
              ? `A fonte oficial não entregou ${def.nomeCompleto.toLowerCase()} ao portal`
              : `${def.nomeCompleto} ainda não tem dados publicados aqui`}
          </h2>
          <p className="mt-4 max-w-xl text-[0.92rem] leading-relaxed text-ink-soft">
            O portal só exibe números que vieram de uma coleta real e auditável.{" "}
            {estado === "erro"
              ? "A última tentativa foi recusada pela API — e, em vez de estimar por fora, a tela fica vazia e explica o motivo."
              : "Enquanto o ETL não rodar para este agravo, nada é estimado, interpolado ou preenchido com zero."}
          </p>
          {mensagem && (
            <p className="mono mt-4 max-w-xl rounded-lg bg-canvas px-3 py-2 text-[0.72rem] leading-relaxed text-ink-mute">
              {mensagem}
            </p>
          )}
          <div className="mt-6">
            <p className="kicker">{estado === "erro" ? "Para tentar de novo (só adianta se a API mudar)" : "Para coletar"}</p>
            <pre className="theme-night mono mt-2 overflow-x-auto rounded-xl border border-line px-4 py-3 text-[0.78rem] text-ink">
              <span className="select-none text-ink-mute">$ </span>
              {comando}
            </pre>
          </div>
        </div>

        <dl className="space-y-4 text-[0.84rem]">
          <div>
            <dt className="kicker">O que será contado</dt>
            <dd className="mt-1 font-medium text-ink">{def.rotuloContagem}</dd>
          </div>
          <div>
            <dt className="kicker">Definição</dt>
            <dd className="mt-1 leading-relaxed text-ink-soft">{def.definicao}</dd>
          </div>
          <div>
            <dt className="kicker">Recurso oficial</dt>
            <dd className="mono mt-1 break-all text-[0.74rem] text-ink-soft">apidadosabertos.saude.gov.br{def.recurso}</dd>
          </div>
          <div>
            <dt className="kicker">Método</dt>
            <dd className="mt-1 text-ink-soft">
              {def.metodoColeta === "censo"
                ? "Coleta censitária (todas as páginas), quando o universo é pequeno."
                : "Amostragem sistemática de páginas, estratificada por ano quando a fonte permite, com fração amostral declarada."}
            </dd>
          </div>
          <Link href="/metodologia#agravos" className="mono inline-block text-[0.68rem] uppercase tracking-[0.12em] text-brand link-underline">
            Limitações deste agravo →
          </Link>
        </dl>
      </div>
    </section>
  );
}
