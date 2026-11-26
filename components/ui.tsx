import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/animated-number";

export function SectionLabel({
  numero,
  children,
  className = "",
}: {
  numero?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`} data-reveal="left">
      {numero && (
        <span className="mono inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-accent/30 bg-accent-wash px-1.5 text-[0.68rem] font-medium tracking-[0.08em] text-accent">
          {numero}
        </span>
      )}
      <span className="h-px w-10 bg-gradient-to-r from-line-strong to-transparent" />
      <span className="kicker">{children}</span>
    </div>
  );
}

export function Stat({
  rotulo,
  valor,
  unidade,
  nota,
  destaque = false,
}: {
  rotulo: string;
  valor: ReactNode;
  unidade?: string;
  nota?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={`group relative flex min-h-[11.5rem] flex-col justify-between gap-5 overflow-hidden p-6 transition-colors duration-300 ${
        destaque
          ? "bg-brand text-on-brand"
          : "bg-surface hover:bg-canvas"
      }`}
    >
      {destaque && (
        <>
          <span
            aria-hidden
            className="aurora -right-16 -top-20 h-56 w-56 bg-brand-bright"
            style={{ opacity: 0.9, filter: "blur(50px)" }}
          />
          <span
            aria-hidden
            className="aurora -bottom-24 left-0 h-48 w-48 bg-[#9b7bff]"
            style={{ opacity: 0.55, filter: "blur(60px)", animationDelay: "-6s" }}
          />
        </>
      )}
      {!destaque && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-gradient-to-r from-brand to-accent transition-transform duration-500 ease-out group-hover:scale-x-100"
        />
      )}

      <p
        className={`relative mono text-[0.68rem] font-medium uppercase leading-relaxed tracking-[0.12em] ${
          destaque ? "text-white/75" : "text-ink-mute"
        }`}
      >
        {rotulo}
      </p>
      <div className="relative">
        <p
          className={`font-display text-[2.5rem] font-semibold leading-none tracking-[-0.04em] ${
            destaque ? "text-white" : "text-ink"
          }`}
        >
          {typeof valor === "string" ? <AnimatedNumber value={valor} /> : valor}
          {unidade && (
            <span
              className={`ml-1.5 font-sans text-[0.8rem] font-normal tracking-normal ${
                destaque ? "text-white/70" : "text-ink-mute"
              }`}
            >
              {unidade}
            </span>
          )}
        </p>
        {nota && (
          <p className={`mt-3 text-[0.76rem] leading-snug ${destaque ? "text-white/75" : "text-ink-mute"}`}>
            {nota}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProvenanceBar({
  fonte,
  periodo,
  cobertura,
  coleta,
}: {
  fonte: string;
  periodo: string;
  cobertura?: string;
  coleta?: string;
  compacta?: boolean;
}) {
  const itens = [
    { k: "Fonte", v: fonte },
    { k: "Período", v: periodo },
    ...(cobertura ? [{ k: "Cobertura", v: cobertura }] : []),
    ...(coleta ? [{ k: "Coleta", v: coleta }] : []),
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-dashed border-line-strong bg-surface/60 px-4 py-3 md:grid-cols-4">
      {itens.map((i) => (
        <div key={i.k}>
          <dt className="mono flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-ink-mute">
            <span className="h-1 w-1 rounded-full bg-brand" />
            {i.k}
          </dt>
          <dd className="mono mt-1 text-[0.72rem] leading-snug text-ink-soft">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Badge({
  children,
  tone = "neutro",
}: {
  children: ReactNode;
  tone?: "neutro" | "ok" | "alerta" | "erro" | "info";
}) {
  const tons: Record<string, string> = {
    neutro: "border-line-strong bg-surface text-ink-mute",
    ok: "border-ok/30 bg-ok-wash text-ok",
    alerta: "border-accent/30 bg-accent-wash text-accent",
    erro: "border-danger/30 bg-danger-wash text-danger",
    info: "border-brand/20 bg-brand-wash text-brand",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.65rem] font-medium uppercase tracking-[0.1em] transition-colors duration-300 ${tons[tone]}`}
    >
      {children}
    </span>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-wash/70 px-4 py-3.5">
      <svg aria-hidden viewBox="0 0 20 20" className="mt-[1px] h-4 w-4 shrink-0 text-accent" fill="none">
        <path d="M10 2.5 18 17H2L10 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 8v4M10 14.5v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <p className="text-[0.82rem] leading-relaxed text-ink-soft">
        <span className="mono mr-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-accent">
          Atenção
        </span>
        {children}
      </p>
    </div>
  );
}

export function NotaMetodologica({ children }: { children: ReactNode }) {
  return (
    <p className="relative pl-5 text-[0.8rem] leading-relaxed text-ink-soft before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-full before:bg-gradient-to-b before:from-brand before:to-accent">
      {children}
    </p>
  );
}
