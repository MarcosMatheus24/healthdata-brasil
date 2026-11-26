import type { Metadata } from "next";
import { anosDisponiveis,
  anoReferencia, getBase, linhasIndicadores } from "@/lib/data";
import { MapaClient } from "@/components/mapa-client";
import { SectionLabel } from "@/components/ui";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Mapa territorial",
  description:
    "Mapa coroplético das unidades da federação com taxa de SRAG por 100 mil habitantes, associação por código IBGE e leitura explícita de incerteza.",
};

export default async function MapaPage() {
  const base = await getBase();
  const anos = anosDisponiveis(base);
  const ano = anoReferencia(base);
  const linhas = linhasIndicadores(base, { ano });

  return (
    <>
      <header className="page-head border-b border-line">
        <div className="wrap py-14 lg:py-20">
          <SectionLabel numero="03">Território & incerteza</SectionLabel>
          <h1 data-reveal className="mt-5 max-w-[26ch] text-[clamp(2.2rem,4.4vw,3.8rem)] leading-[0.98]">
            Mapas demonstrativos, nunca mapas de risco
          </h1>
          <p data-reveal style={{ ["--d" as string]: 100 }} className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink-soft">
            A malha vem da API de malhas do IBGE. As cores representam apenas a intensidade do
            indicador no recorte selecionado — não classificam risco, não ordenam prioridade e não
            substituem análise epidemiológica.
          </p>
        </div>
      </header>

      <MapaClient
        ufs={base.ufs}
        anos={anos}
        anoInicial={ano}
        linhasIniciais={linhas}
        municipiosPorUf={Object.fromEntries(
          base.srag.map((s) => [s.ufSigla, s.municipiosAmostra]),
        )}
        cobertura={base.meta.metodologia.fracaoAmostral}
        coleta={base.meta.coletas?.[0]?.finalizadoEm ?? base.meta.geradoEm}
      />
    </>
  );
}
