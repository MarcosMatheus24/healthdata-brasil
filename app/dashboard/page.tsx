import type { Metadata } from "next";
import {
  anosDisponiveis,
  anoReferencia,
  getBase,
  linhasIndicadores,
  perfilAgregado,
  resumoNacional,
  serieMensal,
} from "@/lib/data";
import { DashboardClient } from "@/components/dashboard-client";
import { SectionLabel } from "@/components/ui";
import { AnimatedNumber } from "@/components/animated-number";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Dashboard de indicadores",
  description:
    "Indicadores de SRAG por unidade da federação: notificações, taxa por 100 mil habitantes, letalidade e cobertura amostral, com proveniência em cada cartão.",
};

export default async function DashboardPage() {
  const base = await getBase();
  const anos = anosDisponiveis(base);
  const ano = anoReferencia(base);

  const inicial = {
    parametros: { ano, uf: "BR", agravo: "SRAG" },
    resumo: resumoNacional(base, ano),
    ufSelecionada: null,
    linhas: linhasIndicadores(base, { ano }),
    serieMensal: serieMensal(base, "BR"),
    perfil: {
      classificacao: perfilAgregado(base, "classificacao"),
      evolucao: perfilAgregado(base, "evolucao"),
      uti: perfilAgregado(base, "uti"),
      faixaEtaria: perfilAgregado(base, "faixaEtaria"),
    },
    proveniencia: {
      fonte: "API de Dados Abertos do Ministério da Saúde (SRAG 2019-2026)",
      fonteTerritorial: "IBGE — localidades e população residente estimada",
      coleta: base.meta.coletas?.[0]?.finalizadoEm ?? base.meta.geradoEm,
      registrosColetados: base.meta.metodologia.registrosColetados,
      universoFonte: base.meta.metodologia.universoFonte,
      fracaoAmostral: base.meta.metodologia.fracaoAmostral,
      metodo: base.meta.metodologia.tipo,
      origemDados: base.origem,
    },
  };

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
                O seletor altera o recorte e a fonte territorial, não a metodologia. Todo número
                aqui é uma <strong className="font-medium text-ink">estimativa por amostragem</strong>{" "}
                do conjunto oficial de SRAG, com a fração amostral declarada ao lado.
              </p>
            </div>
            <dl className="card grid grid-cols-2 divide-x divide-line" data-reveal="scale">
              <div className="px-5 py-4">
                <dt className="kicker">Universo</dt>
                <dd className="mono mt-1.5 text-[1.1rem] font-medium">
                  <AnimatedNumber value={base.meta.metodologia.universoFonte.toLocaleString("pt-BR")} />
                </dd>
              </div>
              <div className="px-5 py-4">
                <dt className="kicker">Amostra</dt>
                <dd className="mono mt-1.5 text-[1.1rem] font-medium">
                  <AnimatedNumber value={base.meta.metodologia.registrosColetados.toLocaleString("pt-BR")} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <DashboardClient anos={anos} ufs={base.ufs} inicial={inicial} />
    </>
  );
}
