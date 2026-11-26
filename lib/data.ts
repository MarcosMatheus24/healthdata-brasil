import metaJson from "@/data/snapshot/meta.json";
import ufsJson from "@/data/snapshot/ufs.json";
import populacaoJson from "@/data/snapshot/populacao.json";
import sragJson from "@/data/snapshot/srag.json";
import municipiosJson from "@/data/snapshot/municipios.json";
import type {
  Coleta,
  LinhaIndicador,
  Meta,
  Municipio,
  PerfilUF,
  PopulacaoUF,
  SragUF,
  StatusFonte,
  UF,
} from "@/lib/types";

export type OrigemDados = "postgres" | "snapshot";

export type Base = {
  origem: OrigemDados;
  meta: Meta;
  ufs: UF[];
  populacao: PopulacaoUF[];
  srag: SragUF[];
  municipios: Municipio[];
  erroBanco?: string;
};

const TTL_MS = 60_000;
let cache: { base: Base; ts: number } | null = null;

function carregarDoSnapshot(): Base {
  return {
    origem: "snapshot",
    meta: metaJson as unknown as Meta,
    ufs: ufsJson as unknown as UF[],
    populacao: populacaoJson as unknown as PopulacaoUF[],
    srag: sragJson as unknown as SragUF[],
    municipios: municipiosJson as unknown as Municipio[],
  };
}

/**
 * Quando DATABASE_URL está definida, a aplicação lê os agregados do PostgreSQL
 * (Supabase). Sem banco, usa o snapshot versionado gerado pelo ETL — a mesma
 * estrutura, com a mesma trilha de proveniência.
 */
async function carregarDoBanco(): Promise<Base> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: process.env.DATABASE_URL?.includes("supabase.co")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  try {
    const [ufs, populacao, indicadores, perfis, coletas, municipios] = await Promise.all([
      pool.query("SELECT codigo_ibge, sigla, nome, regiao FROM uf ORDER BY nome"),
      pool.query("SELECT uf_codigo, ano, populacao FROM populacao"),
      pool.query(
        "SELECT uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado FROM indicador WHERE agravo = 'SRAG'",
      ),
      pool.query("SELECT uf_codigo, dimensao, categoria, contagem FROM perfil WHERE agravo = 'SRAG'"),
      pool.query("SELECT * FROM coleta ORDER BY id DESC LIMIT 1"),
      pool.query("SELECT uf_codigo, municipio_codigo, municipio_nome, amostra, estimado FROM municipio_amostra"),
    ]);

    const ufList: UF[] = ufs.rows.map((r) => ({
      codigo: String(r.codigo_ibge),
      sigla: r.sigla,
      nome: r.nome,
      regiao: r.regiao,
      regiaoSigla: null,
    }));

    const popList: PopulacaoUF[] = populacao.rows.map((r) => ({
      ufCodigo: String(r.uf_codigo),
      ano: Number(r.ano),
      populacao: Number(r.populacao),
    }));

    type Bucket = {
      porAno: Record<string, number>;
      porAnoEstimado: Record<string, number>;
      porMes: Record<string, number>;
      porMesEstimado: Record<string, number>;
      obitosAmostra: number;
      obitosEstimado: number;
      utiAmostra: number;
      internadosAmostra: number;
      amostra: number;
      perfil: Record<string, Record<string, number>>;
    };

    const buckets = new Map<string, Bucket>();
    const bucket = (codigo: string) => {
      if (!buckets.has(codigo)) {
        buckets.set(codigo, {
          porAno: {},
          porAnoEstimado: {},
          porMes: {},
          porMesEstimado: {},
          obitosAmostra: 0,
          obitosEstimado: 0,
          utiAmostra: 0,
          internadosAmostra: 0,
          amostra: 0,
          perfil: {},
        });
      }
      return buckets.get(codigo)!;
    };

    for (const r of indicadores.rows) {
      const b = bucket(String(r.uf_codigo));
      const amostra = Number(r.valor_amostra);
      const estimado = Number(r.valor_estimado);
      if (r.metrica === "notificacoes" && r.ano && !r.mes) {
        b.porAno[String(r.ano)] = amostra;
        b.porAnoEstimado[String(r.ano)] = estimado;
      } else if (r.metrica === "notificacoes" && r.ano && r.mes) {
        const chave = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
        b.porMes[chave] = amostra;
        b.porMesEstimado[chave] = estimado;
      } else if (r.metrica === "obitos" && !r.ano) {
        b.obitosAmostra = amostra;
        b.obitosEstimado = estimado;
      }
    }

    for (const r of perfis.rows) {
      const b = bucket(String(r.uf_codigo));
      b.perfil[r.dimensao] = b.perfil[r.dimensao] ?? {};
      b.perfil[r.dimensao][r.categoria] = Number(r.contagem);
    }

    const municipiosPorUf = new Map<string, { codigo: string; nome: string | null; amostra: number; estimado: number }[]>();
    for (const r of municipios.rows) {
      const lista = municipiosPorUf.get(String(r.uf_codigo)) ?? [];
      lista.push({
        codigo: String(r.municipio_codigo),
        nome: r.municipio_nome,
        amostra: Number(r.amostra),
        estimado: Number(r.estimado ?? 0),
      });
      municipiosPorUf.set(String(r.uf_codigo), lista);
    }

    const srag: SragUF[] = ufList.map((u) => {
      const b = buckets.get(u.codigo) ?? bucket(u.codigo);
      const amostra = Object.values(b.porAno).reduce((s, v) => s + v, 0);
      const fracao =
        amostra > 0
          ? Number((metaJson as unknown as Meta).metodologia.fracaoAmostral ?? 0)
          : 0;
      return {
        ufSigla: u.sigla,
        ufCodigo: u.codigo,
        ufNome: u.nome,
        regiao: u.regiao,
        amostra,
        estimado: Object.values(b.porAnoEstimado).reduce((s, v) => s + v, 0),
        fracaoAmostral: fracao,
        obitosAmostra: b.obitosAmostra,
        obitosEstimado: b.obitosEstimado,
        utiAmostra: b.utiAmostra,
        internadosAmostra: b.internadosAmostra,
        porAno: b.porAno,
        porAnoEstimado: b.porAnoEstimado,
        porMes: b.porMes,
        porMesEstimado: b.porMesEstimado,
        perfil: {
          classificacao: b.perfil.classificacao ?? {},
          evolucao: b.perfil.evolucao ?? {},
          uti: b.perfil.uti ?? {},
          hospitalizacao: b.perfil.hospitalizacao ?? {},
          vacinaGripe: b.perfil.vacinaGripe ?? {},
          sexo: b.perfil.sexo ?? {},
          faixaEtaria: b.perfil.faixaEtaria ?? {},
        } as PerfilUF,
        municipiosAmostra: (municipiosPorUf.get(u.codigo) ?? []).sort((a, z) => z.amostra - a.amostra).slice(0, 10),
      };
    });

    const coleta = coletas.rows[0];
    const metaBase = metaJson as unknown as Meta;
    const meta: Meta = {
      ...metaBase,
      geradoEm: coleta?.finalizado_em ? new Date(coleta.finalizado_em).toISOString() : metaBase.geradoEm,
      coletas: coleta
        ? [
            {
              fonte: coleta.fonte,
              recurso: coleta.recurso,
              parametros: coleta.parametros ?? {},
              iniciadoEm: new Date(coleta.iniciado_em).toISOString(),
              finalizadoEm: coleta.finalizado_em ? new Date(coleta.finalizado_em).toISOString() : "",
              httpStatus: coleta.http_status,
              paginas: (coleta.paginas ?? []) as Coleta["paginas"],
              registros: coleta.registros ?? 0,
              totalFonte: coleta.total_fonte ?? 0,
              fracaoAmostral: Number(coleta.fracao_amostral ?? 0),
              status: coleta.status,
            },
          ]
        : metaBase.coletas,
    };

    return {
      origem: "postgres",
      meta,
      ufs: ufList,
      populacao: popList,
      srag: srag.filter((u) => u.amostra > 0),
      municipios: [],
    };
  } finally {
    await pool.end();
  }
}

export async function getBase(): Promise<Base> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.base;

  let base: Base;
  if (process.env.DATABASE_URL) {
    try {
      base = await carregarDoBanco();
    } catch (err) {
      base = {
        ...carregarDoSnapshot(),
        erroBanco: err instanceof Error ? err.message : String(err),
      };
    }
  } else {
    base = carregarDoSnapshot();
  }

  cache = { base, ts: Date.now() };
  return base;
}

/* ------------------------------------------------------------------ helpers */

/** População da UF: usa o ano exato; se ausente, o ano disponível mais próximo. */
export function populacaoDaUf(base: Base, ufCodigo: string | null, ano: number): { valor: number | null; ano: number | null } {
  if (!ufCodigo) return { valor: null, ano: null };
  const serie = base.populacao.filter((p) => p.ufCodigo === ufCodigo);
  if (!serie.length) return { valor: null, ano: null };
  const exato = serie.find((p) => p.ano === ano);
  if (exato) return { valor: exato.populacao, ano: exato.ano };
  const anteriores = serie.filter((p) => p.ano <= ano).sort((a, b) => b.ano - a.ano);
  if (anteriores.length) return { valor: anteriores[0].populacao, ano: anteriores[0].ano };
  const proximos = [...serie].sort((a, b) => a.ano - b.ano);
  return { valor: proximos[0].populacao, ano: proximos[0].ano };
}

/**
 * Ano de referência para a visão inicial: o mais recente com amostra suficiente
 * (>= 1.000 registros). Evita abrir a interface em um ano ainda incompleto.
 */
export function anoReferencia(base: Base): number {
  const anos = anosDisponiveis(base);
  const total = (a: number) => base.srag.reduce((soma, u) => soma + (u.porAno[String(a)] ?? 0), 0);
  return anos.find((a) => total(a) >= 1000) ?? anos[0] ?? 2025;
}

export function anosDisponiveis(base: Base): number[] {
  const set = new Set<number>();
  for (const u of base.srag) for (const a of Object.keys(u.porAno)) set.add(Number(a));
  return [...set].filter((a) => a >= 2019 && a <= 2026).sort((a, b) => b - a);
}

export function regioes(base: Base): string[] {
  return [...new Set(base.ufs.map((u) => u.regiao).filter(Boolean) as string[])].sort();
}

export function linhasIndicadores(base: Base, opts: { uf?: string; ano?: number } = {}): LinhaIndicador[] {
  const ano = opts.ano ?? anosDisponiveis(base)[0] ?? 2025;
  const fracao = base.meta.metodologia.fracaoAmostral || 1;

  return base.srag
    .filter((u) => !opts.uf || opts.uf === "BR" || u.ufSigla === opts.uf)
    .map((u) => {
      const notificacoesAmostra = u.porAno[String(ano)] ?? 0;
      const notificacoesEstimadas = u.porAnoEstimado[String(ano)] ?? Math.round(notificacoesAmostra / fracao);
      const pop = populacaoDaUf(base, u.ufCodigo, ano);
      // Regra de minimização (LGPD): células com menos de 5 registros na amostra não são publicadas.
      const suprimido = notificacoesAmostra < 5;
      const obitosEstimados = notificacoesEstimadas > 0 ? Math.round(u.obitosEstimado * (notificacoesEstimadas / Math.max(1, u.estimado))) : 0;
      const taxa =
        !suprimido && pop.valor && pop.valor > 0 ? Number(((notificacoesEstimadas / pop.valor) * 100000).toFixed(2)) : null;
      const taxaObitos =
        !suprimido && pop.valor && pop.valor > 0 ? Number(((obitosEstimados / pop.valor) * 100000).toFixed(2)) : null;
      return {
        ufSigla: u.ufSigla,
        ufNome: u.ufNome,
        ufCodigo: u.ufCodigo,
        regiao: u.regiao,
        ano,
        populacao: pop.valor,
        populacaoAno: pop.ano,
        suprimido,
        notificacoesAmostra,
        notificacoesEstimadas,
        obitosAmostra: u.obitosAmostra,
        obitosEstimados,
        utiAmostra: u.utiAmostra,
        taxaPor100Mil: taxa,
        taxaObitosPor100Mil: taxaObitos,
        letalidadePct:
          !suprimido && notificacoesEstimadas > 0 ? Number(((obitosEstimados / notificacoesEstimadas) * 100).toFixed(2)) : null,
        coberturaPct: Number(((u.amostra / Math.max(1, u.estimado)) * 100).toFixed(2)),
      };
    })
    .filter((l) => l.notificacoesEstimadas > 0)
    .sort((a, b) => (b.taxaPor100Mil ?? 0) - (a.taxaPor100Mil ?? 0));
}

export function serieMensal(base: Base, ufSigla?: string): { mes: string; valor: number; amostra: number }[] {
  const mapa = new Map<string, { valor: number; amostra: number }>();
  for (const u of base.srag) {
    if (ufSigla && ufSigla !== "BR" && u.ufSigla !== ufSigla) continue;
    for (const [mes, amostra] of Object.entries(u.porMes)) {
      const atual = mapa.get(mes) ?? { valor: 0, amostra: 0 };
      mapa.set(mes, {
        valor: atual.valor + (u.porMesEstimado[mes] ?? 0),
        amostra: atual.amostra + amostra,
      });
    }
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, valor: v.valor, amostra: v.amostra }))
    .filter((d) => d.mes >= "2019-01");
}

export function perfilAgregado(base: Base, dimensao: keyof PerfilUF, ufSigla?: string): { categoria: string; contagem: number }[] {
  const mapa = new Map<string, number>();
  for (const u of base.srag) {
    if (ufSigla && ufSigla !== "BR" && u.ufSigla !== ufSigla) continue;
    for (const [cat, n] of Object.entries(u.perfil[dimensao] ?? {})) {
      mapa.set(cat, (mapa.get(cat) ?? 0) + n);
    }
  }
  const total = [...mapa.values()].reduce((s, v) => s + v, 0) || 1;
  return [...mapa.entries()]
    .map(([categoria, contagem]) => ({ categoria, contagem, proporcao: contagem / total }))
    .sort((a, b) => b.contagem - a.contagem)
    .map(({ categoria, contagem }) => ({ categoria, contagem }));
}

export function statusFontes(base: Base): StatusFonte[] {
  const coleta = base.meta.coletas?.[0];
  const fonteMs = base.meta.fontes.find((f) => f.id === "MS_DADOS_ABERTOS");
  const fonteIbge = base.meta.fontes.find((f) => f.id === "IBGE");
  const fonteEsus = base.meta.fontes.find((f) => f.id === "ESUS_NOTIFICA");

  const status: StatusFonte[] = [
    {
      id: "MS_DADOS_ABERTOS",
      nome: fonteMs?.nome ?? "API de Dados Abertos do Ministério da Saúde",
      orgao: fonteMs?.orgao ?? "Ministério da Saúde",
      urlBase: fonteMs?.urlBase ?? "https://apidadosabertos.saude.gov.br",
      estado: coleta && coleta.status !== "erro" ? "conectado" : "erro",
      requerAutenticacao: false,
      ultimaColeta: coleta?.finalizadoEm ?? null,
      httpStatus: coleta?.httpStatus ?? null,
      registros: coleta?.registros ?? null,
      totalFonte: coleta?.totalFonte ?? null,
      observacao: coleta
        ? `Amostra sistemática de ${coleta.registros.toLocaleString("pt-BR")} registros de ${coleta.totalFonte.toLocaleString("pt-BR")} (${(coleta.fracaoAmostral * 100).toFixed(2)}%).`
        : "Nenhuma coleta registrada.",
    },
    {
      id: "IBGE",
      nome: fonteIbge?.nome ?? "API de Localidades e Agregados do IBGE",
      orgao: "IBGE",
      urlBase: fonteIbge?.urlBase ?? "https://servicodados.ibge.gov.br/api",
      estado: "conectado",
      requerAutenticacao: false,
      ultimaColeta: base.meta.geradoEm,
      httpStatus: 200,
      registros: base.ufs.length,
      totalFonte: base.ufs.length,
      observacao: `Territórios (${base.ufs.length} UFs) e população residente estimada por ano.`,
    },
    {
      id: "ESUS_NOTIFICA",
      nome: fonteEsus?.nome ?? "e-SUS Notifica",
      orgao: "Ministério da Saúde",
      urlBase: fonteEsus?.urlBase ?? "https://esusnotifica.saude.gov.br",
      estado: "requer_autorizacao",
      requerAutenticacao: true,
      ultimaColeta: null,
      httpStatus: null,
      registros: null,
      totalFonte: null,
      observacao:
        "Acesso mediante autorização, IP liberado e credenciais mantidas exclusivamente no servidor. Adaptador implementado, integração não habilitada.",
    },
  ];

  return status;
}

export function coberturaGlobal(base: Base): number {
  const { registrosColetados, universoFonte } = base.meta.metodologia;
  return universoFonte > 0 ? (registrosColetados / universoFonte) * 100 : 0;
}

export function resumoNacional(base: Base, ano: number) {
  const linhas = linhasIndicadores(base, { ano });
  const notificacoes = linhas.reduce((s, l) => s + l.notificacoesEstimadas, 0);
  const obitos = linhas.reduce((s, l) => s + l.obitosEstimados, 0);
  const populacao = linhas.reduce((s, l) => s + (l.populacao ?? 0), 0);
  return {
    notificacoes,
    obitos,
    populacao,
    taxaPor100Mil: populacao > 0 ? Number(((notificacoes / populacao) * 100000).toFixed(2)) : null,
    letalidadePct: notificacoes > 0 ? Number(((obitos / notificacoes) * 100).toFixed(2)) : null,
    ufs: linhas.length,
  };
}
