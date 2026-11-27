import type { Metadata } from "next";
import { anoReferencia, agravoDisponivel, anosDisponiveis, dadosAgravo, getBase, linhasIndicadores, statusAgravos } from "@/lib/data";
import { AGRAVO_PADRAO, lerAgravo } from "@/lib/agravos";
import { MapaClient } from "@/components/mapa-client";
import { SectionLabel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Mapa territorial",
  description:
    "Mapa coroplético das unidades da federação com taxa por 100 mil habitantes de SRAG, Dengue, Zika e Febre amarela, associação por código IBGE e leitura explícita de incerteza.",
};

export default async function MapaPage({ searchParams }: { searchParams: Promise<{ agravo?: string }> }) {
  const { agravo: agravoParam } = await searchParams;
  const agravo = lerAgravo(agravoParam) ?? AGRAVO_PADRAO;
  const base = await getBase();
  const disponivel = agravoDisponivel(base, agravo);
  const dados = dadosAgravo(base, agravo);
  const anos = disponivel ? anosDisponiveis(base, agravo) : [];
  const ano = disponivel ? anoReferencia(base, agravo) : new Date().getFullYear() - 1;
  const linhas = disponivel ? linhasIndicadores(base, { ano, agravo }) : [];

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
        estados={statusAgravos(base).map((e) => ({ id: e.id, estado: e.estado }))}
        inicial={{
          agravo,
          disponivel,
          estado: disponivel ? "coletado" : dados.estado === "erro" ? "erro" : "pendente",
          mensagem: disponivel ? null : dados.mensagem ?? null,
          anos,
          ano,
          linhas,
          municipiosPorUf: Object.fromEntries(dados.ufs.map((s) => [s.ufSigla, s.municipiosAmostra])),
          cobertura: dados.metodologia?.fracaoAmostral ?? 0,
          coleta: dados.coleta?.finalizadoEm ?? dados.geradoEm ?? "",
        }}
      />
    </>
  );
}
