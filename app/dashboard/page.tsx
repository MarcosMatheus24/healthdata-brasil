import type { Metadata } from "next";
import { getBase, montarIndicadores, statusAgravos } from "@/lib/data";
import { AGRAVO_PADRAO, lerAgravo } from "@/lib/agravos";
import { DashboardClient } from "@/components/dashboard-client";
import { SectionLabel } from "@/components/ui";
import { AnimatedNumber } from "@/components/animated-number";

export const metadata: Metadata = {
  title: "Dashboard de indicadores",
  description:
    "Indicadores de SRAG, Dengue, Zika e Febre amarela por unidade da federação: casos, taxa por 100 mil habitantes, letalidade e cobertura, com a definição de caso e a proveniência em cada cartão.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ agravo?: string }>;
}) {
  const { agravo: agravoParam } = await searchParams;
  const agravo = lerAgravo(agravoParam) ?? AGRAVO_PADRAO;
  const base = await getBase();
  const estados = statusAgravos(base);
  const inicial = montarIndicadores(base, agravo);
  const coletados = estados.filter((e) => e.estado === "coletado").length;

  return (
    <>
      <header className="page-head border-b border-line">
        <div className="wrap py-14 lg:py-20">
          <SectionLabel numero="02">Leitura crítica</SectionLabel>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 data-reveal className="max-w-[24ch] text-[clamp(2.2rem,4.4vw,3.8rem)] leading-[0.98]">
                Dashboard de indicadores
              </h1>
              <p data-reveal style={{ ["--d" as string]: 100 }} className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink-soft">
                Escolha a doença, o período e o território. Cada doença declara{" "}
                <strong className="font-medium text-ink">o que está sendo contado</strong> — notificação,
                caso provável ou caso confirmado — e a fração amostral aparece ao lado de cada número.
              </p>
            </div>
            <dl className="card grid grid-cols-2 divide-x divide-line" data-reveal="scale">
              <div className="px-5 py-4">
                <dt className="kicker">Doenças monitoradas</dt>
                <dd className="mono mt-1.5 text-[1.1rem] font-medium">
                  <AnimatedNumber value={String(estados.length)} />
                </dd>
              </div>
              <div className="px-5 py-4">
                <dt className="kicker">Com coleta publicada</dt>
                <dd className="mono mt-1.5 text-[1.1rem] font-medium">
                  <AnimatedNumber value={String(coletados)} />
                  <span className="text-ink-mute"> / {estados.length}</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <DashboardClient
        ufs={base.ufs}
        inicial={inicial}
        estados={estados.map((e) => ({ id: e.id, estado: e.estado }))}
      />
    </>
  );
}
