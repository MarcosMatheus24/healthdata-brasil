import { NextResponse } from "next/server";
import { getBase } from "@/lib/data";

export const dynamic = "force-dynamic";

/** GET /api/saude — verificação de saúde usada por monitoramento e pela Vercel. */
export async function GET() {
  const inicio = Date.now();
  try {
    const base = await getBase();
    return NextResponse.json(
      {
        status: "ok",
        origemDados: base.origem,
        bancoConfigurado: Boolean(process.env.DATABASE_URL),
        ufs: base.ufs.length,
        coleta: base.meta.coletas?.[0]?.finalizadoEm ?? base.meta.geradoEm,
        latenciaMs: Date.now() - inicio,
        versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: "degradado",
        erro: err instanceof Error ? err.message : "falha desconhecida",
        latenciaMs: Date.now() - inicio,
      },
      { status: 503 },
    );
  }
}
