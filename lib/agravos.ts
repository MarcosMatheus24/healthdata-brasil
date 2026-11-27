/**
 * Catálogo de agravos monitorados.
 *
 * Cada agravo declara, de forma explícita, O QUE está sendo contado. Esse é o
 * ponto central da metodologia: cada doença tem a sua definição de caso, e a
 * interface mostra * esse rótulo em todo cartão, tabela e CSV.
 * "Febre amarela", por exemplo, é "caso humano confirmado por local provável de
 * infecção" — não notificação suspeita nem local de residência.
 *
 * Arquivo compartilhado entre servidor e cliente: não importe nada de Node aqui.
 */

export const AGRAVO_IDS = ["srag", "dengue", "zika", "febreamarela"] as const;
export type AgravoId = (typeof AGRAVO_IDS)[number];

export const AGRAVO_PADRAO: AgravoId = "srag";

export type DefinicaoAgravo = {
  id: AgravoId;
  /** Nome curto para chips e filtros. */
  nome: string;
  /** Nome completo para títulos. */
  nomeCompleto: string;
  /** O que exatamente é contado como "caso" na métrica principal. */
  rotuloContagem: string;
  /** Versão curta do rótulo para cartões ("notificações", "casos prováveis"). */
  unidadeContagem: string;
  /** Rótulo do desfecho óbito usado na letalidade. */
  rotuloObito: string;
  definicao: string;
  sistema: string;
  recurso: string;
  metodoColeta: "amostragem" | "censo";
  /** Primeiro ano exibido. A maioria começa em 2019; febre amarela é série histórica. */
  anoInicial: number;
  referenciaTemporal: string;
  limitacoes: string[];
  /** Cor de identificação (chips e legendas). Não é escala de risco. */
  cor: string;
  rotulosPerfil: {
    classificacao: string;
    faixaEtaria: string;
  };
};

export const AGRAVOS: Record<AgravoId, DefinicaoAgravo> = {
  srag: {
    id: "srag",
    nome: "SRAG",
    nomeCompleto: "Síndrome respiratória aguda grave",
    rotuloContagem: "Notificações de SRAG hospitalizada",
    unidadeContagem: "notificações",
    rotuloObito: "Óbito por SRAG",
    definicao:
      "Toda notificação de SRAG hospitalizada no SIVEP-Gripe, independentemente do agente etiológico.",
    sistema: "SIVEP-Gripe",
    recurso: "/vigilancia-e-meio-ambiente/srag-2019-2026",
    metodoColeta: "amostragem",
    anoInicial: 2019,
    referenciaTemporal: "dt_sin_pri (primeiros sintomas), com fallback para dt_notific",
    limitacoes: [
      "Notificação não é caso confirmado: inclui SRAG por qualquer causa.",
      "O arquivo de origem tem data de notificação anterior à de sintomas em grande parte dos registros.",
    ],
    cor: "#2342d6",
    rotulosPerfil: {
      classificacao: "Classificação final",
      faixaEtaria: "Faixa etária",
    },
  },
  zika: {
    id: "zika",
    nome: "Zika",
    nomeCompleto: "Zika vírus",
    rotuloContagem: "Casos prováveis de Zika (notificações exceto descartadas)",
    unidadeContagem: "casos prováveis",
    rotuloObito: "Óbito por Zika",
    definicao:
      "Notificações do SINAN Zika excluindo as descartadas (classi_fin = 2) — mesma definição de 'caso provável' usada nos boletins de arboviroses do Ministério da Saúde.",
    sistema: "SINAN Zika",
    recurso: "/arboviroses/zikavirus",
    metodoColeta: "censo",
    anoInicial: 2019,
    referenciaTemporal: "dt_sin_pri (primeiros sintomas), com fallback para dt_notific; estratos por nu_ano",
    limitacoes: [
      "Casos prováveis incluem notificações ainda sem classificação final.",
      "Contagens baixas desde 2018: muitas UFs ficam abaixo do limite de supressão (5 registros).",
      "Diagnóstico clínico se confunde com dengue e chikungunya; parte das notificações migra de agravo após investigação.",
    ],
    cor: "#7c4dff",
    rotulosPerfil: {
      classificacao: "Classificação final",
      faixaEtaria: "Faixa etária",
    },
  },
  dengue: {
    id: "dengue",
    nome: "Dengue",
    nomeCompleto: "Dengue",
    rotuloContagem: "Casos prováveis de dengue (notificações exceto descartadas)",
    unidadeContagem: "casos prováveis",
    rotuloObito: "Óbito por dengue",
    definicao:
      "Notificações do SINAN Dengue excluindo as descartadas (classi_fin = 5) — mesma definição de 'caso provável' usada nos boletins do Ministério da Saúde.",
    sistema: "SINAN Dengue",
    recurso: "/arboviroses/dengue",
    metodoColeta: "amostragem",
    anoInicial: 2019,
    referenciaTemporal: "dt_sin_pri (primeiros sintomas), com fallback para dt_notific",
    limitacoes: [
      "Casos prováveis incluem notificações ainda em investigação.",
      "Forte sazonalidade e atraso de digitação: o ano corrente costuma estar incompleto.",
      "Óbitos em investigação (evolução 4) não entram na letalidade.",
    ],
    cor: "#e0612f",
    rotulosPerfil: {
      classificacao: "Classificação final",
      faixaEtaria: "Faixa etária",
    },
  },
  febreamarela: {
    id: "febreamarela",
    nome: "Febre amarela",
    nomeCompleto: "Febre amarela (casos humanos)",
    rotuloContagem: "Casos humanos confirmados de febre amarela, por local provável de infecção",
    unidadeContagem: "casos confirmados",
    rotuloObito: "Óbito por febre amarela",
    definicao:
      "Registros do conjunto de febre amarela em humanos do Ministério da Saúde (casos confirmados). A UF é a do local provável de infecção (uf_lpi), não a de residência.",
    sistema: "Vigilância da febre amarela (SVSA)",
    recurso: "/arboviroses/febre-amarela-humanos-primatas-nao-humanos",
    metodoColeta: "censo",
    anoInicial: 2001,
    referenciaTemporal: "dt_is (início dos sintomas); ano_is/mes_is como fallback",
    limitacoes: [
      "Território = local provável de infecção: a taxa por 100 mil usa a população da UF onde a pessoa se infectou.",
      "Doença rara e concentrada em surtos (2017–2018, 2025): anos sem casos são esperados, não falha de coleta.",
      "Série exibida a partir de 2001 (primeiro ano da estimativa populacional IBGE 6579 por UF); a fonte tem registros desde 1994.",
      "Epizootias (morte de macacos) ficam em outro recurso e não entram nesta contagem.",
    ],
    cor: "#d9a400",
    rotulosPerfil: {
      classificacao: "Desfecho",
      faixaEtaria: "Faixa etária",
    },
  },
};

export const LISTA_AGRAVOS = AGRAVO_IDS.map((id) => AGRAVOS[id]);

export function ehAgravo(valor: unknown): valor is AgravoId {
  return typeof valor === "string" && (AGRAVO_IDS as readonly string[]).includes(valor);
}

/** Normaliza o parâmetro de URL: aceita "COVID-19", "covid", "Dengue"… */
export function lerAgravo(valor: string | null | undefined): AgravoId | null {
  if (!valor) return AGRAVO_PADRAO;
  const v = valor.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (v === "zikavirus") return "zika";
  if (v === "fa" || v === "febreamarelahumanos") return "febreamarela";
  return ehAgravo(v) ? v : null;
}
