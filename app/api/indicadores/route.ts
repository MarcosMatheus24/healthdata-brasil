import { NextResponse } from "next/server";
import { AGRAVO_IDS, lerAgravo } from "@/lib/agravos";
import { agravoDisponivel, anosDisponiveis, getBase, montarIndicadores } from "@/lib/data";

export const revalidate = 60;

/**
 * GET /api/indicadores?agravo=dengue&ano=2025&uf=BA
 *
 * agravo: srag (padrão) | dengue | zika | febreamarela
 * Agregados normalizados e validados: casos (pela definição do agravo), óbitos,
 * taxa por 100 mil, letalidade e cobertura amostral por UF.
 *
 * Agravo ainda sem coleta → 200 com `disponivel: false` e `estado: "pendente"`
 * (a interface mostra "aguardando primeira coleta", nunca zeros).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agravo = lerAgravo(searchParams.get("agravo"));

  if (!agravo) {
    return NextResponse.json(
      {
        erro: "agravo_invalido",
        mensagem: `Agravo "${searchParams.get("agravo")}" não é monitorado.`,
        agravosDisponiveis: AGRAVO_IDS,
      },
      { status: 400 },
    );
  }

  const base = await getBase();
  const uf = (searchParams.get("uf") ?? "BR").toUpperCase();
  const anoParam = searchParams.get("ano");

  if (!agravoDisponivel(base, agravo)) {
    return NextResponse.json(montarIndicadores(base, agravo, { uf }), {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  }

  const anos = anosDisponiveis(base, agravo);
  const ano = anoParam ? Number(anoParam) : undefined;

  if (ano !== undefined && !anos.includes(ano)) {
    return NextResponse.json(
      {
        erro: "periodo_invalido",
        mensagem: `Ano ${anoParam} fora do recorte disponível para ${agravo}.`,
        anosDisponiveis: anos,
      },
      { status: 400 },
    );
  }

  const resposta = montarIndicadores(base, agravo, { ano, uf });

  if (uf !== "BR" && resposta.linhas.length === 0) {
    return NextResponse.json(
      {
        erro: "sem_dados",
        mensagem: `Nenhum registro de ${agravo} na amostra para ${uf} em ${resposta.parametros.ano}.`,
        anosDisponiveis: anos,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(resposta, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
