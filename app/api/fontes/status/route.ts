import { NextResponse } from "next/server";
import { coberturaGlobal, getBase, statusAgravos, statusFontes } from "@/lib/data";

export const revalidate = 60;

/**
 * GET /api/fontes/status
 * Estado das fontes sem expor segredos: nunca retorna credenciais, tokens ou
 * cabeçalhos de autenticação — apenas estado, HTTP e volumes coletados.
 */
export async function GET() {
  const base = await getBase();
  const fontes = statusFontes(base);

  return NextResponse.json(
    {
      geradoEm: new Date().toISOString(),
      origemDados: base.origem,
      coberturaGlobalPct: Number(coberturaGlobal(base).toFixed(3)),
      fontes,
      agravos: statusAgravos(base).map((a) => ({
        id: a.id,
        nome: a.nome,
        recurso: a.recurso,
        estado: a.estado,
        ultimaColeta: a.ultimaColeta,
        mensagem: a.mensagem,
      })),
      aviso:
        "Este endpoint não expõe credenciais. Integrações restritas (e-SUS Notifica) permanecem desabilitadas até autorização formal.",
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
