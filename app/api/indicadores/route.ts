import { NextResponse } from "next/server";
import {
  anosDisponiveis,
  anoReferencia,
  getBase,
  linhasIndicadores,
  perfilAgregado,
  resumoNacional,
  serieMensal,
} from "@/lib/data";

export const revalidate = 60;

/**
 * GET /api/indicadores?ano=2025&uf=BA&agravo=SRAG
 * Agregados normalizados e validados: notificações, óbitos, taxa por 100 mil,
 * letalidade e cobertura amostral por UF.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = await getBase();
  const anos = anosDisponiveis(base);
  const ano = Number(searchParams.get("ano") ?? anoReferencia(base));
  const uf = (searchParams.get("uf") ?? "BR").toUpperCase();

  if (!anos.includes(ano)) {
    return NextResponse.json(
      {
        erro: "periodo_invalido",
        mensagem: `Ano ${ano} fora do recorte disponível.`,
        anosDisponiveis: anos,
      },
      { status: 400 },
    );
  }

  const linhas = linhasIndicadores(base, { ano });
  const filtradas = uf === "BR" ? linhas : linhas.filter((l) => l.ufSigla === uf);

  if (uf !== "BR" && filtradas.length === 0) {
    return NextResponse.json(
      { erro: "sem_dados", mensagem: `Nenhuma notificação amostrada para ${uf} em ${ano}.` },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      parametros: { ano, uf, agravo: "SRAG" },
      resumo: resumoNacional(base, ano),
      ufSelecionada: uf === "BR" ? null : filtradas[0] ?? null,
      linhas: filtradas,
      serieMensal: serieMensal(base, uf),
      perfil: {
        classificacao: perfilAgregado(base, "classificacao", uf),
        evolucao: perfilAgregado(base, "evolucao", uf),
        uti: perfilAgregado(base, "uti", uf),
        faixaEtaria: perfilAgregado(base, "faixaEtaria", uf),
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
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
