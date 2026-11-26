import { anoReferencia, getBase, linhasIndicadores } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/export?ano=2025&uf=BR
 * Exporta o agregado com a proveniência embutida no próprio arquivo:
 * fonte, período, data da consulta, fração amostral e aviso de agregação.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = await getBase();
  const ano = Number(searchParams.get("ano") ?? anoReferencia(base));
  const uf = (searchParams.get("uf") ?? "BR").toUpperCase();

  const linhas = linhasIndicadores(base, { ano }).filter((l) => uf === "BR" || l.ufSigla === uf);
  const coleta = base.meta.coletas?.[0];

  const cabecalhoProveniencia = [
    `# HealthData Brasil — agregado de SRAG`,
    `# Fonte: API de Dados Abertos do Ministerio da Saude (${coleta?.recurso ?? "srag-2019-2026"})`,
    `# Fonte territorial/populacional: IBGE (localidades e agregado 6579)`,
    `# Periodo: ${ano}`,
    `# Data da consulta: ${new Date().toISOString()}`,
    `# Coleta de referencia: ${coleta?.finalizadoEm ?? base.meta.geradoEm}`,
    `# Metodo: ${base.meta.metodologia.tipo} (${base.meta.metodologia.paginasSolicitadas} paginas de ${base.meta.metodologia.limitePorPagina} registros)`,
    `# Fracao amostral: ${(base.meta.metodologia.fracaoAmostral * 100).toFixed(2)}%`,
    `# AVISO: valores estimados por amostragem; nao sao contagem oficial do periodo.`,
    `# AVISO: notificacao nao equivale a caso confirmado; incidencia exige denominador populacional.`,
  ].join("\n");

  const colunas = [
    "uf_sigla",
    "uf_nome",
    "codigo_ibge_uf",
    "regiao",
    "ano",
    "populacao",
    "ano_populacao",
    "notificacoes_amostra",
    "notificacoes_estimadas",
    "obitos_estimados",
    "taxa_por_100mil",
    "taxa_obitos_por_100mil",
    "letalidade_pct",
    "cobertura_amostra_pct",
  ];

  const corpo = linhas
    .map((l) =>
      [
        l.ufSigla,
        `"${l.ufNome}"`,
        l.ufCodigo ?? "",
        `"${l.regiao ?? ""}"`,
        l.ano,
        l.populacao ?? "",
        l.populacaoAno ?? "",
        l.notificacoesAmostra,
        l.notificacoesEstimadas,
        l.obitosEstimados,
        l.taxaPor100Mil ?? "",
        l.taxaObitosPor100Mil ?? "",
        l.letalidadePct ?? "",
        l.coberturaPct,
      ].join(";"),
    )
    .join("\n");

  const csv = `${cabecalhoProveniencia}\n\n${colunas.join(";")}\n${corpo}\n`;

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="healthdata-srag-${ano}-${uf.toLowerCase()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
