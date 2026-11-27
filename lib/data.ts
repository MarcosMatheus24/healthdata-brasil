import metaJson from "@/data/snapshot/meta.json";
import ufsJson from "@/data/snapshot/ufs.json";
import populacaoJson from "@/data/snapshot/populacao.json";
import sragJson from "@/data/snapshot/srag.json";
import municipiosJson from "@/data/snapshot/municipios.json";
import dengueJson from "@/data/snapshot/agravos/dengue.json";
import zikaJson from "@/data/snapshot/agravos/zika.json";
import febreAmarelaJson from "@/data/snapshot/agravos/febreamarela.json";
import { AGRAVOS, AGRAVO_IDS, type AgravoId } from "@/lib/agravos";
import type {
  AgravoUF,
  Coleta,
  DadosAgravo,
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
  /** Atalho para agravos.srag.ufs (mantido por compatibilidade). */
  srag: SragUF[];
  municipios: Municipio[];
  /** Um snapshot por agravo; SRAG é montado a partir de meta.json + srag.json. */
  agravos: Record<AgravoId, DadosAgravo>;
  erroBanco?: string;
};

const PERFIL_VAZIO: PerfilUF = {
  classificacao: {},
  evolucao: {},
  uti: {},
  hospitalizacao: {},
  vacinaGripe: {},
  sexo: {},
  faixaEtaria: {},
};

/** SRAG continua no formato original (meta.json + srag.json) e vira um DadosAgravo aqui. */
function sragComoAgravo(meta: Meta, ufs: SragUF[]): DadosAgravo {
  const coleta = meta.coletas?.[0] ?? null;
  return {
    agravo: "srag",
    estado: ufs.length ? "coletado" : "pendente",
    mensagem: null,
    geradoEm: meta.geradoEm,
    metodologia: meta.metodologia,
    coleta: coleta ? { ...coleta, agravo: "srag" } : null,
    registrosLidos: meta.metodologia.registrosColetados,
    perfilGlobal: meta.perfilGlobal ?? null,
    ufs,
  };
}

function snapshotsAgravos(meta: Meta, srag: SragUF[]): Record<AgravoId, DadosAgravo> {
  return {
    srag: sragComoAgravo(meta, srag),
    dengue: dengueJson as unknown as DadosAgravo,
    zika: zikaJson as unknown as DadosAgravo,
    febreamarela: febreAmarelaJson as unknown as DadosAgravo,
  };
}

const TTL_MS = 60_000;
let cache: { base: Base; ts: number } | null = null;

function carregarDoSnapshot(): Base {
  const meta = metaJson as unknown as Meta;
  const srag = sragJson as unknown as SragUF[];
  return {
    origem: "snapshot",
    meta,
    ufs: ufsJson as unknown as UF[],
    populacao: populacaoJson as unknown as PopulacaoUF[],
    srag,
    municipios: municipiosJson as unknown as Municipio[],
    agravos: snapshotsAgravos(meta, srag),
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
      pool.query("SELECT agravo, uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado FROM indicador"),
      pool.query("SELECT agravo, uf_codigo, dimensao, categoria, contagem FROM perfil"),
      pool.query("SELECT * FROM coleta ORDER BY id DESC"),
      pool.query(
        "SELECT COALESCE(agravo, 'SRAG') AS agravo, uf_codigo, municipio_codigo, municipio_nome, amostra, estimado FROM municipio_amostra",
      ),
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
      obitosPorAno: Record<string, number>;
      obitosPorAnoEstimado: Record<string, number>;
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

    // chave = "<AGRAVO>|<uf_codigo>"
    const buckets = new Map<string, Bucket>();
    const bucket = (codigo: string) => {
      if (!buckets.has(codigo)) {
        buckets.set(codigo, {
          obitosPorAno: {},
          obitosPorAnoEstimado: {},
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

    const chave = (agravo: string, uf: string) => `${String(agravo).toUpperCase()}|${uf}`;

    for (const r of indicadores.rows) {
      const b = bucket(chave(r.agravo, String(r.uf_codigo)));
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
      } else if (r.metrica === "obitos" && r.ano && !r.mes) {
        b.obitosPorAno[String(r.ano)] = amostra;
        b.obitosPorAnoEstimado[String(r.ano)] = estimado;
      }
    }

    for (const r of perfis.rows) {
      const b = bucket(chave(r.agravo, String(r.uf_codigo)));
      b.perfil[r.dimensao] = b.perfil[r.dimensao] ?? {};
      b.perfil[r.dimensao][r.categoria] = Number(r.contagem);
    }

    const municipiosPorUf = new Map<string, { codigo: string; nome: string | null; amostra: number; estimado: number }[]>();
    for (const r of municipios.rows) {
      const k = chave(r.agravo, String(r.uf_codigo));
      const lista = municipiosPorUf.get(k) ?? [];
      lista.push({
        codigo: String(r.municipio_codigo),
        nome: r.municipio_nome,
        amostra: Number(r.amostra),
        estimado: Number(r.estimado ?? 0),
      });
      municipiosPorUf.set(k, lista);
    }

    const snapshots = snapshotsAgravos(metaJson as unknown as Meta, sragJson as unknown as SragUF[]);

    const montarUfs = (agravo: AgravoId): AgravoUF[] =>
      ufList
        .map((u) => {
      const k = chave(agravo, u.codigo);
      const b = buckets.get(k) ?? bucket(k);
      const amostra = Object.values(b.porAno).reduce((s, v) => s + v, 0);
      const fracao = amostra > 0 ? Number(snapshots[agravo].metodologia?.fracaoAmostral ?? 0) : 0;
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
        obitosPorAno: b.obitosPorAno,
        obitosPorAnoEstimado: b.obitosPorAnoEstimado,
        perfil: {
          classificacao: b.perfil.classificacao ?? {},
          evolucao: b.perfil.evolucao ?? {},
          uti: b.perfil.uti ?? {},
          hospitalizacao: b.perfil.hospitalizacao ?? {},
          vacinaGripe: b.perfil.vacinaGripe ?? {},
          sexo: b.perfil.sexo ?? {},
          faixaEtaria: b.perfil.faixaEtaria ?? {},
        } as PerfilUF,
        municipiosAmostra: (municipiosPorUf.get(k) ?? []).sort((a, z) => z.amostra - a.amostra).slice(0, 10),
      };
        })
        .filter((u) => u.amostra > 0);

    const srag = montarUfs("srag");
    const coletaDoAgravo = (agravo: AgravoId) =>
      coletas.rows.find((c) => String(c.agravo ?? "SRAG").toUpperCase() === agravo.toUpperCase());
    const coleta = coletaDoAgravo("srag") ?? coletas.rows[0];
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

    const agravos = Object.fromEntries(
      AGRAVO_IDS.map((id) => {
        if (id === "srag") return [id, sragComoAgravo(meta, srag)];
        const doBanco = montarUfs(id);
        const snap = snapshots[id];
        const c = coletaDoAgravo(id);
        return [
          id,
          doBanco.length
            ? {
                ...snap,
                estado: "coletado",
                geradoEm: c?.finalizado_em ? new Date(c.finalizado_em).toISOString() : snap.geradoEm,
                ufs: doBanco,
              }
            : { ...snap, ufs: [], estado: snap.estado === "coletado" ? "pendente" : snap.estado,
                mensagem: snap.estado === "coletado" ? "Snapshot existe, mas o banco ainda não recebeu o seed deste agravo." : snap.mensagem },
        ];
      }),
    ) as Record<AgravoId, DadosAgravo>;

    return {
      origem: "postgres",
      meta,
      ufs: ufList,
      populacao: popList,
      srag,
      municipios: [],
      agravos,
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

/** Snapshot do agravo (nunca undefined: agravos desconhecidos caem em SRAG). */
export function dadosAgravo(base: Base, agravo: AgravoId = "srag"): DadosAgravo {
  return base.agravos[agravo] ?? base.agravos.srag;
}

export function agravoDisponivel(base: Base, agravo: AgravoId): boolean {
  const d = dadosAgravo(base, agravo);
  return d.estado === "coletado" && d.ufs.length > 0;
}

/**
 * População da UF: usa o ano exato; se ausente, o ano mais próximo em até
 * 3 anos (o IBGE não publica estimativa em anos de censo/contagem, como 2007
 * e 2010). Fora disso não há denominador: a taxa fica "não calculável", em vez
 * de dividir casos de 1999 pela população de 2019.
 */
export function populacaoDaUf(base: Base, ufCodigo: string | null, ano: number): { valor: number | null; ano: number | null } {
  if (!ufCodigo) return { valor: null, ano: null };
  const serie = base.populacao.filter((p) => p.ufCodigo === ufCodigo);
  if (!serie.length) return { valor: null, ano: null };
  const maisProxima = [...serie].sort((a, b) => Math.abs(a.ano - ano) - Math.abs(b.ano - ano) || b.ano - a.ano)[0];
  if (Math.abs(maisProxima.ano - ano) > 3) return { valor: null, ano: null };
  return { valor: maisProxima.populacao, ano: maisProxima.ano };
}

export function anosDisponiveis(base: Base, agravo: AgravoId = "srag"): number[] {
  const limite = new Date().getFullYear();
  const inicio = AGRAVOS[agravo].anoInicial;
  const set = new Set<number>();
  for (const u of dadosAgravo(base, agravo).ufs) for (const a of Object.keys(u.porAno)) set.add(Number(a));
  return [...set].filter((a) => a >= inicio && a <= limite).sort((a, b) => b - a);
}

/**
 * Ano de referência para a visão inicial: o ano COMPLETO mais recente com dados
 * (anterior ao ano corrente), para não abrir num ano ainda em digitação.
 * Uma regra proporcional ao maior ano falharia em doenças de surto: a febre
 * amarela abriria em 2018 e esconderia os casos de 2025.
 */
export function anoReferencia(base: Base, agravo: AgravoId = "srag"): number {
  const anos = anosDisponiveis(base, agravo);
  const atual = new Date().getFullYear();
  return anos.find((a) => a < atual) ?? anos[0] ?? atual - 1;
}

export function regioes(base: Base): string[] {
  return [...new Set(base.ufs.map((u) => u.regiao).filter(Boolean) as string[])].sort();
}

export function linhasIndicadores(
  base: Base,
  opts: { uf?: string; ano?: number; agravo?: AgravoId } = {},
): LinhaIndicador[] {
  const agravo = opts.agravo ?? "srag";
  const dados = dadosAgravo(base, agravo);
  const ano = opts.ano ?? anosDisponiveis(base, agravo)[0] ?? 2025;
  const fracao = dados.metodologia?.fracaoAmostral || 1;

  return dados.ufs
    .filter((u) => !opts.uf || opts.uf === "BR" || u.ufSigla === opts.uf)
    .map((u) => {
      const notificacoesAmostra = u.porAno[String(ano)] ?? 0;
      const notificacoesEstimadas = u.porAnoEstimado[String(ano)] ?? Math.round(notificacoesAmostra / fracao);
      const pop = populacaoDaUf(base, u.ufCodigo, ano);
      // Regra de minimização (LGPD): células com menos de 5 registros na amostra não são publicadas.
      const suprimido = notificacoesAmostra < 5;
      // Coletas novas trazem óbitos por ano; snapshots antigos só o total do período
      // (nesse caso o total é rateado proporcionalmente às notificações do ano).
      // Com óbitos por ano disponíveis, ano ausente = zero óbitos (não rateio).
      const temObitosPorAno = u.obitosPorAno !== undefined;
      const obitosAno = temObitosPorAno ? u.obitosPorAno?.[String(ano)] ?? 0 : undefined;
      const obitosEstimados = temObitosPorAno
        ? u.obitosPorAnoEstimado?.[String(ano)] ?? obitosAno ?? 0
        : notificacoesEstimadas > 0
          ? Math.round(u.obitosEstimado * (notificacoesEstimadas / Math.max(1, u.estimado)))
          : 0;
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
        obitosAmostra: obitosAno ?? u.obitosAmostra,
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

export function serieMensal(
  base: Base,
  ufSigla?: string,
  agravo: AgravoId = "srag",
): { mes: string; valor: number; amostra: number }[] {
  const mapa = new Map<string, { valor: number; amostra: number }>();
  for (const u of dadosAgravo(base, agravo).ufs) {
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
    .filter((d) => d.mes >= `${AGRAVOS[agravo].anoInicial}-01`);
}

export function perfilAgregado(
  base: Base,
  dimensao: keyof PerfilUF,
  ufSigla?: string,
  agravo: AgravoId = "srag",
): { categoria: string; contagem: number }[] {
  const mapa = new Map<string, number>();
  for (const u of dadosAgravo(base, agravo).ufs) {
    if (ufSigla && ufSigla !== "BR" && u.ufSigla !== ufSigla) continue;
    for (const [cat, n] of Object.entries((u.perfil ?? PERFIL_VAZIO)[dimensao] ?? {})) {
      mapa.set(cat, (mapa.get(cat) ?? 0) + n);
    }
  }
  return [...mapa.entries()]
    .map(([categoria, contagem]) => ({ categoria, contagem }))
    .sort((a, b) => b.contagem - a.contagem);
}

export function statusFontes(base: Base): StatusFonte[] {
  const coleta = base.meta.coletas?.[0];
  const fonteMs = base.meta.fontes.find((f) => f.id === "MS_DADOS_ABERTOS");
  const fonteIbge = base.meta.fontes.find((f) => f.id === "IBGE");
  const fonteEsus = base.meta.fontes.find((f) => f.id === "ESUS_NOTIFICA");

  const coletados = AGRAVO_IDS.filter((id) => agravoDisponivel(base, id)).map((id) => AGRAVOS[id].nome);
  const pendentes = AGRAVO_IDS.filter((id) => !agravoDisponivel(base, id)).map((id) => AGRAVOS[id].nome);

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
      observacao: [
        coleta
          ? `SRAG: amostra sistemática de ${coleta.registros.toLocaleString("pt-BR")} registros de ${coleta.totalFonte.toLocaleString("pt-BR")} (${(coleta.fracaoAmostral * 100).toFixed(2)}%).`
          : "Nenhuma coleta registrada.",
        `Agravos com dados: ${coletados.join(", ") || "nenhum"}.`,
        pendentes.length ? `Aguardando coleta: ${pendentes.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
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

/** Estado resumido de cada agravo — usado em /api/agravos, na home e nos filtros. */
export function statusAgravos(base: Base) {
  return AGRAVO_IDS.map((id) => {
    const d = dadosAgravo(base, id);
    const def = AGRAVOS[id];
    const disponivel = agravoDisponivel(base, id);
    const anos = disponivel ? anosDisponiveis(base, id) : [];
    const ano = disponivel ? anoReferencia(base, id) : null;
    const resumo = disponivel && ano ? resumoNacional(base, ano, id) : null;
    return {
      id,
      nome: def.nome,
      nomeCompleto: def.nomeCompleto,
      rotuloContagem: def.rotuloContagem,
      sistema: def.sistema,
      recurso: def.recurso,
      metodoColeta: def.metodoColeta,
      estado: disponivel ? ("coletado" as const) : d.estado === "erro" ? ("erro" as const) : ("pendente" as const),
      mensagem: disponivel ? null : d.mensagem ?? "Aguardando a primeira coleta.",
      ultimaColeta: d.coleta?.finalizadoEm ?? d.geradoEm ?? null,
      anosDisponiveis: anos,
      anoReferencia: ano,
      resumo,
      coberturaPct: disponivel ? coberturaAgravo(base, id) : null,
    };
  });
}

export function coberturaAgravo(base: Base, agravo: AgravoId = "srag"): number {
  const m = dadosAgravo(base, agravo).metodologia;
  if (!m) return 0;
  return m.universoFonte > 0 ? (m.registrosColetados / m.universoFonte) * 100 : 0;
}

/** Mantida por compatibilidade: cobertura da coleta de SRAG. */
export function coberturaGlobal(base: Base): number {
  return coberturaAgravo(base, "srag");
}

export function resumoNacional(base: Base, ano: number, agravo: AgravoId = "srag") {
  const linhas = linhasIndicadores(base, { ano, agravo });
  const notificacoes = linhas.reduce((s, l) => s + l.notificacoesEstimadas, 0);
  const obitos = linhas.reduce((s, l) => s + l.obitosEstimados, 0);
  // Denominador nacional = população de TODAS as UFs, não só das que tiveram casos
  // (em doenças raras, somar só as UFs com casos inflaria a taxa "Brasil").
  const pops = base.ufs.map((u) => populacaoDaUf(base, u.codigo, ano).valor);
  const populacao = pops.every((v) => v !== null) ? pops.reduce<number>((s, v) => s + (v ?? 0), 0) : 0;
  return {
    notificacoes,
    obitos,
    populacao,
    taxaPor100Mil: populacao > 0 ? Number(((notificacoes / populacao) * 100000).toFixed(2)) : null,
    letalidadePct: notificacoes > 0 ? Number(((obitos / notificacoes) * 100).toFixed(2)) : null,
    ufs: linhas.length,
  };
}

export function proveniencia(base: Base, agravo: AgravoId = "srag") {
  const d = dadosAgravo(base, agravo);
  const def = AGRAVOS[agravo];
  return {
    fonte: `API de Dados Abertos do Ministério da Saúde — ${def.sistema} (${def.recurso})`,
    definicao: def.rotuloContagem,
    fonteTerritorial: "IBGE — localidades e população residente estimada",
    coleta: d.coleta?.finalizadoEm ?? d.geradoEm ?? "",
    registrosColetados: d.metodologia?.registrosColetados ?? 0,
    universoFonte: d.metodologia?.universoFonte ?? 0,
    fracaoAmostral: d.metodologia?.fracaoAmostral ?? 0,
    metodo: d.metodologia?.tipo ?? "sem coleta",
    origemDados: base.origem,
  };
}

/**
 * Resposta completa de /api/indicadores — também usada pelas páginas no
 * servidor para a primeira renderização (mesmo contrato, zero divergência).
 */
export function montarIndicadores(base: Base, agravo: AgravoId, opts: { ano?: number; uf?: string } = {}) {
  const uf = (opts.uf ?? "BR").toUpperCase();
  const disponivel = agravoDisponivel(base, agravo);
  const anos = disponivel ? anosDisponiveis(base, agravo) : [];
  const ano = opts.ano ?? (disponivel ? anoReferencia(base, agravo) : new Date().getFullYear() - 1);
  const linhas = disponivel ? linhasIndicadores(base, { ano, agravo }) : [];
  const filtradas = uf === "BR" ? linhas : linhas.filter((l) => l.ufSigla === uf);
  const d = dadosAgravo(base, agravo);

  return {
    parametros: { ano, uf, agravo },
    disponivel,
    estado: disponivel ? ("coletado" as const) : d.estado === "erro" ? ("erro" as const) : ("pendente" as const),
    mensagem: disponivel ? null : d.mensagem ?? "Aguardando a primeira coleta.",
    anosDisponiveis: anos,
    resumo: resumoNacional(base, ano, agravo),
    ufSelecionada: uf === "BR" ? null : filtradas[0] ?? null,
    linhas: filtradas,
    serieMensal: disponivel ? serieMensal(base, uf, agravo) : [],
    perfil: {
      classificacao: perfilAgregado(base, "classificacao", uf, agravo),
      evolucao: perfilAgregado(base, "evolucao", uf, agravo),
      uti: perfilAgregado(base, "uti", uf, agravo),
      faixaEtaria: perfilAgregado(base, "faixaEtaria", uf, agravo),
    },
    proveniencia: proveniencia(base, agravo),
  };
}

export type RespostaIndicadores = ReturnType<typeof montarIndicadores>;
