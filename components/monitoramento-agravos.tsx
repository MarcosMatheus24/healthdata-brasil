import Link from "next/link";
import { AGRAVOS, type AgravoId } from "@/lib/agravos";
import { compacto, dataHora, pct, taxa } from "@/lib/format";
import { Sparkline } from "@/components/charts";
import { AnimatedNumber } from "@/components/animated-number";

export type CartaoAgravo = {
  id: AgravoId;
  estado: "coletado" | "pendente" | "erro";
  mensagem: string | null;
  anoReferencia: number | null;
  ultimaColeta: string | null;
  coberturaPct: number | null;
  resumo: { notificacoes: number; taxaPor100Mil: number | null; letalidadePct: number | null; ufs: number } | null;
  serie: { mes: string; valor: number }[];
};

/** Grade "uma doença por cartão" da página inicial. */
export function MonitoramentoAgravos({ cartoes }: { cartoes: CartaoAgravo[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-reveal-stagger>
      {cartoes.map((c) => {
        const def = AGRAVOS[c.id];
        const ok = c.estado === "coletado" && c.resumo;
        return (
          <Link
            key={c.id}
            href={c.id === "srag" ? "/dashboard" : `/dashboard?agravo=${c.id}`}
            className="card card-hover group relative flex flex-col overflow-hidden p-5"
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: def.cor }} />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-25"
              style={{ background: def.cor }}
            />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[1.35rem] font-semibold leading-none tracking-[-0.03em]">{def.nome}</p>
                <p className="mono mt-1.5 text-[0.62rem] uppercase tracking-[0.12em] text-ink-mute">{def.sistema}</p>
              </div>
              {ok ? (
                <span className="mono inline-flex items-center gap-1.5 rounded-full border border-ok/25 bg-ok-wash px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-ok">
                  <span className="dot-live h-1.5 w-1.5 rounded-full bg-ok" />
                  {c.anoReferencia}
                </span>
              ) : (
                <span
                  className={`mono rounded-full px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] ${
                    c.estado === "erro" ? "bg-danger-wash text-danger" : "bg-canvas-deep text-ink-mute"
                  }`}
                >
                  {c.estado === "erro" ? "coleta falhou" : "sem coleta"}
                </span>
              )}
            </div>

            <p className="mt-3 min-h-[2.6em] text-[0.76rem] leading-snug text-ink-soft">{def.rotuloContagem}</p>

            {ok ? (
              <>
                <p className="mt-4 font-display text-[2.1rem] font-semibold leading-none tracking-[-0.04em]">
                  <AnimatedNumber value={compacto(c.resumo!.notificacoes)} />
                </p>
                <p className="mono mt-1 text-[0.65rem] uppercase tracking-[0.1em] text-ink-mute">
                  {def.metodoColeta === "censo" ? "casos" : "estimativa"} · {c.resumo!.ufs} UFs
                </p>
                <div className="mt-3">
                  <Sparkline dados={c.serie} cor={def.cor} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                  <div>
                    <dt className="kicker text-[0.58rem]">Taxa /100k</dt>
                    <dd className="mono mt-0.5 text-[0.85rem] font-medium">{taxa(c.resumo!.taxaPor100Mil)}</dd>
                  </div>
                  <div>
                    <dt className="kicker text-[0.58rem]">Letalidade</dt>
                    <dd className="mono mt-0.5 text-[0.85rem] font-medium">{pct(c.resumo!.letalidadePct, 2)}</dd>
                  </div>
                </dl>
                <p className="mono mt-3 text-[0.6rem] uppercase tracking-[0.08em] text-ink-mute">
                  cobertura {pct(c.coberturaPct, 2)} · coleta {c.ultimaColeta ? dataHora(c.ultimaColeta).split(",")[0] : "—"}
                </p>
              </>
            ) : (
              <div className="mt-4 flex flex-1 flex-col justify-between gap-4">
                <div className="relative h-[92px] overflow-hidden rounded-xl border border-dashed border-line-strong">
                  <svg viewBox="0 0 240 92" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
                    <path
                      d="M0 70 C40 70 50 40 80 46 S130 70 160 52 S210 30 240 38"
                      fill="none"
                      stroke="var(--color-line-strong)"
                      strokeWidth="1.5"
                      strokeDasharray="4 5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <p className="absolute inset-0 flex items-center justify-center">
                    <span className="mono rounded-full bg-surface px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.14em] text-ink-mute shadow-[0_0_0_6px_var(--color-surface)]">
                      nenhum número sem coleta
                    </span>
                  </p>
                </div>
                <p className="mono truncate rounded-lg bg-canvas px-2.5 py-1.5 text-[0.66rem] text-ink-mute">
                  npm run etl -- --agravos={c.id}
                </p>
              </div>
            )}

            <span className="mono mt-4 inline-flex items-center gap-1 text-[0.65rem] uppercase tracking-[0.12em] text-brand">
              {ok ? "abrir no dashboard" : "ver definição"}
              <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
