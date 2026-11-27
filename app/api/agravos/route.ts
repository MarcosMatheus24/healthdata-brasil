import { NextResponse } from "next/server";
import { AGRAVOS } from "@/lib/agravos";
import { getBase, statusAgravos } from "@/lib/data";

export const revalidate = 60;

/**
 * GET /api/agravos
 * Catálogo dos agravos monitorados com a definição de caso, a fonte e o estado
 * da última coleta de cada um (coletado | pendente | erro).
 */
export async function GET() {
  const base = await getBase();
  const agravos = statusAgravos(base).map((a) => ({
    ...a,
    definicao: AGRAVOS[a.id].definicao,
    limitacoes: AGRAVOS[a.id].limitacoes,
    referenciaTemporal: AGRAVOS[a.id].referenciaTemporal,
  }));

  return NextResponse.json(
    {
      geradoEm: new Date().toISOString(),
      origemDados: base.origem,
      total: agravos.length,
      coletados: agravos.filter((a) => a.estado === "coletado").length,
      agravos,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
