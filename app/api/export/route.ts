import { AGRAVOS, lerAgravo } from "@/lib/agravos";
import { agravoDisponivel, anoReferencia, dadosAgravo, getBase, linhasIndicadores } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/export?agravo=dengue&ano=2025&uf=BR
 * Exporta o agregado com a proveniência embutida no próprio arquivo:
 * fonte, período, data da consulta, fração amostral e aviso de agregação.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agravo = lerAgravo(searchParams.get("agravo"));
  if (!agravo) {
    return new Response(`Agravo invalido: ${searchParams.get("agravo")}`, { status: 400 });
  }
  const base = await getBase();
  if (!agravoDisponivel(base, agravo)) {
    return new Response(
      `O agravo ${AGRAVOS[agravo].nome} ainda nao tem coleta. Nenhum CSV e gerado com dados ausentes.`,
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  const def = AGRAVOS[agravo];
  const dados = dadosAgravo(base, agravo);
  const m = dados.metodologia!;
  const ano = Number(searchParams.get("ano") ?? anoReferencia(base, agravo));
  const uf = (searchParams.get("uf") ?? "BR").toUpperCase();

  const linhas = linhasIndicadores(base, { ano, agravo }).filter((l) => uf === "BR" || l.ufSigla === uf);
  const coleta = dados.coleta;
  const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const cabecalhoProveniencia = [
    `# HealthData Brasil — agregado de ${semAcento(def.nomeCompleto)}`,
    `# Definicao de caso: ${semAcento(def.rotuloContagem)}`,
    `# Fonte: API de Dados Abertos do Ministerio da Saude — ${def.sistema} (${def.recurso})`,
    `# Fonte territorial/populacional: IBGE (localidades e agregado 6579)`,
    `# Periodo: ${ano}`,
    `# Data da consulta: ${new Date().toISOString()}`,
    `# Coleta de referencia: ${coleta?.finalizadoEm ?? dados.geradoEm}`,
    `# Metodo: ${semAcento(m.tipo)} (${m.paginasSolicitadas} paginas de ${m.limitePorPagina} registros)`,
    `# Fracao amostral: ${(m.fracaoAmostral * 100).toFixed(2)}%`,
    m.fracaoAmostral >= 0.999
      ? `# Coleta censitaria: valores sao contagens diretas da fonte.`
      : `# AVISO: valores estimados por amostragem; nao sao contagem oficial do periodo.`,
    `# AVISO: celulas com menos de 5 registros na amostra sao suprimidas (LGPD).`,
    `# AVISO: incidencia exige denominador populacional; ${semAcento(def.limitacoes[0])}`,
  ].join("\n");

  const colunas = [
    "uf_sigla",
    "uf_nome",
    "codigo_ibge_uf",
    "regiao",
    "agravo",
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
        agravo,
        l.ano,
        l.populacao ?? "",
        l.populacaoAno ?? "",
        l.suprimido ? "" : l.notificacoesAmostra,
        l.suprimido ? "" : l.notificacoesEstimadas,
        l.suprimido ? "" : l.obitosEstimados,
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
      "Content-Disposition": `attachment; filename="healthdata-${agravo}-${ano}-${uf.toLowerCase()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
