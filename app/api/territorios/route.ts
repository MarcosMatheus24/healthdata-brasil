import { NextResponse } from "next/server";
import { lerAgravo } from "@/lib/agravos";
import { dadosAgravo, getBase, populacaoDaUf } from "@/lib/data";

export const revalidate = 3600;

/**
 * GET /api/territorios?uf=BA&codigo=2927408
 * Códigos IBGE disponíveis + validação de código territorial.
 * A validação usa o índice oficial de municípios do IBGE (7 dígitos) e NUNCA
 * compara nomes — apenas códigos, evitando falsos positivos por homônimos.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = await getBase();
  const ufFiltro = searchParams.get("uf")?.toUpperCase();
  const codigo = searchParams.get("codigo");
  const agravo = lerAgravo(searchParams.get("agravo")) ?? "srag";

  if (codigo) {
    const limpo = codigo.replace(/\D/g, "");
    const municipio = base.municipios.find((m) => m.codigo === limpo);
    const uf = base.ufs.find((u) => u.codigo === limpo || u.sigla === codigo.toUpperCase());
    return NextResponse.json({
      consulta: { codigo: limpo },
      valido: Boolean(municipio || uf),
      nivel: municipio ? "municipio" : uf ? "uf" : null,
      territorio: municipio ?? uf ?? null,
      observacao: municipio || uf
        ? "Código localizado no índice oficial do IBGE."
        : "Código não localizado no índice do IBGE. Ausência de correspondência não significa ausência de notificação.",
    });
  }

  const ufs = base.ufs
    .filter((u) => !ufFiltro || u.sigla === ufFiltro)
    .map((u) => {
      const pop = populacaoDaUf(base, u.codigo, 2025);
      return {
        ...u,
        populacao: pop.valor,
        populacaoAno: pop.ano,
        municipios: base.municipios.filter((m) => m.ufCodigo === u.codigo).length,
        agravo,
        municipiosAmostrados: dadosAgravo(base, agravo).ufs.find((s) => s.ufSigla === u.sigla)?.municipiosAmostra ?? [],
      };
    });

  if (ufFiltro && ufs.length === 0) {
    return NextResponse.json(
      {
        erro: "UF não encontrada",
        detalhe: `A sigla "${ufFiltro}" não corresponde a nenhuma unidade da federação do IBGE.`,
        total: 0,
        ufs: [],
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      nivel: "UF",
      total: ufs.length,
      fonte: "IBGE — API de Localidades (v1) e Agregado 6579",
      ufs,
      observacao:
        "Códigos de 2 dígitos identificam UF; 7 dígitos identificam município. O município de residência prevalece sobre o de notificação nos indicadores.",
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
