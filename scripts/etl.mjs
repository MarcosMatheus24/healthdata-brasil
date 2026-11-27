#!/usr/bin/env node
/**
 * HealthData Brasil — ETL de dados oficiais (v2.1, multiagravo)
 * ---------------------------------------------------------------------------
 * Fontes oficiais:
 *  1. API de Dados Abertos do Ministério da Saúde (DEMAS/SVSA)
 *     - SRAG ............ GET /vigilancia-e-meio-ambiente/srag-2019-2026        (SIVEP-Gripe)
 *     - Dengue .......... GET /arboviroses/dengue                               (SINAN)
 *     - Zika ............ GET /arboviroses/zikavirus                            (SINAN)
 *     - Febre amarela ... GET /arboviroses/febre-amarela-humanos-primatas-nao-humanos
 *  2. API de Localidades e Agregados do IBGE (UFs, municípios, população 6579/9324)
 *
 * Uso:
 *   npm run etl                                # todos os agravos
 *   npm run etl -- --agravos=zika,febreamarela # só alguns
 *   npm run etl -- --importar=coleta.json      # grava o resultado de uma coleta feita no navegador
 *   npm run etl -- --so-seed                   # só regenera db/seed.sql a partir dos snapshots
 *
 * Desenho de coleta (detalhes em scripts/coleta-nucleo.mjs):
 *  - SRAG: a rota informa total_registros → amostra sistemática de páginas.
 *  - Zika: a rota NÃO informa total, mas aceita nu_ano → um estrato por ano;
 *    universo medido por busca binária; cada ano é coletado inteiro (censo).
 *  - Febre amarela (humanos): poucos milhares de registros → censo da rota.
 *  - Dengue: sem total, nu_ano devolve 502 e a série começa em 2000 → busca
 *    binária do total e do 1º registro de 2019; amostra só desse intervalo.
 *  - O modo do `offset` (página × índice de registro) é detectado a cada coleta:
 *    a API mudou de comportamento e o modo errado gera páginas sobrepostas.
 *  - `campos=` não é usado: em várias rotas o servidor estoura o tempo (502).
 *
 * Robustez:
 *  - Cada agravo é independente: se a Dengue falhar, os outros continuam.
 *  - Uma falha NUNCA apaga um snapshot bom anterior; só registra `ultimaTentativa`.
 *  - Campos vazios chegam como o texto "nan" no SINAN e são tratados como vazio.
 *  - Se UF/data não forem reconhecidos na maioria dos registros, o agravo falha
 *    com mensagem clara — nada é inventado.
 *
 * Saídas:
 *  - data/snapshot/{meta,ufs,populacao,municipios,srag}.json  (formato original do SRAG)
 *  - data/snapshot/agravos/{dengue,zika,febreamarela}.json
 *  - db/seed.sql
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Contagem,
  coletarEstrato,
  expandir,
  inicioDoAno,
  medirUniverso,
  normalizarDengue,
  normalizarFebreAmarela,
  normalizarSrag,
  normalizarZika,
  obterJson,
  perfilGlobal,
  somaVerificacao,
} from "./coleta-nucleo.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAP_DIR = process.env.ETL_OUT ? path.resolve(process.env.ETL_OUT) : path.join(ROOT, "data", "snapshot");
const AGR_DIR = path.join(SNAP_DIR, "agravos");
const DB_DIR = process.env.ETL_DB_OUT ? path.resolve(process.env.ETL_DB_OUT) : path.join(ROOT, "db");

const MS_BASE = "https://apidadosabertos.saude.gov.br";
const IBGE_BASE = "https://servicodados.ibge.gov.br/api";

export const RECURSOS = {
  srag: "/vigilancia-e-meio-ambiente/srag-2019-2026",
  dengue: "/arboviroses/dengue",
  zika: "/arboviroses/zikavirus",
  febreamarela: "/arboviroses/febre-amarela-humanos-primatas-nao-humanos",
};

const LIMIT = Number(process.env.ETL_LIMIT || process.env.SRAG_LIMIT || 1000);
const PAGINAS = {
  srag: Number(process.env.SRAG_PAGES || 80),
  dengue: Number(process.env.DENGUE_PAGES || 80),
  zikaPorAno: Number(process.env.ZIKA_PAGES_POR_ANO || 80),
};
const CONCURRENCY = Number(process.env.ETL_CONCURRENCY || 4);
const ANO_ATUAL = new Date().getFullYear();
const ANOS_POPULACAO = Array.from({ length: ANO_ATUAL - 2019 + 1 }, (_, i) => 2019 + i);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const getJson = async (u, o) => ({ data: await obterJson(u, o) });

/* =============================================================== coleta (núcleo compartilhado) */

const coletaLog = (m) => log(`  ${m}`);

function camposDe(registros) {
  const set = new Set();
  for (const r of registros.slice(0, 50)) for (const k of Object.keys(r ?? {})) set.add(k);
  return [...set].sort();
}

/**
 * Se a fonte mudar o nome dos campos, a maioria dos registros fica sem UF ou
 * sem data: a coleta é recusada (com a lista de campos) em vez de publicar zeros.
 */
export function validarSchema(nome, normalizados) {
  const n = Math.max(1, normalizados.length);
  const comUf = normalizados.filter((x) => x.uf).length;
  const comData = normalizados.filter((x) => x.data).length;
  if (comUf / n < 0.5 || comData / n < 0.5) {
    throw new Error(
      `${nome}: schema não reconhecido (UF em ${((comUf / n) * 100).toFixed(0)}% e data em ${((comData / n) * 100).toFixed(0)}% dos registros)`,
    );
  }
}

/** Metodologia agregada a partir dos estratos coletados. */
function metodologiaDeEstratos(estratos, extra = {}) {
  const universo = estratos.reduce((s, e) => s + e.universo, 0);
  const coletados = estratos.reduce((s, e) => s + e.coletados, 0);
  const paginas = estratos.reduce((s, e) => s + e.paginas, 0);
  const totalPaginas = estratos.reduce((s, e) => s + (e.totalPaginas ?? e.paginas), 0);
  const censo = estratos.every((e) => e.censo && e.erros === 0);
  return {
    tipo: censo
      ? estratos.length > 1
        ? "coleta censitária por estrato (ano de notificação)"
        : "coleta censitária (todas as páginas)"
      : "amostragem sistemática de páginas",
    limitePorPagina: LIMIT,
    paginasSolicitadas: paginas,
    paginasTotais: totalPaginas,
    passo: paginas > 0 ? Math.max(1, Math.round(totalPaginas / paginas)) : 1,
    registrosColetados: coletados,
    universoFonte: universo,
    fracaoAmostral: Number((universo > 0 ? coletados / universo : 0).toFixed(6)),
    estimativa: censo ? "contagem direta (sem estimativa)" : "valor_estimado = soma dos pesos (universo do estrato ÷ registros coletados)",
    estratos,
    ...extra,
  };
}

/**
 * Grava o snapshot de um agravo a partir do formato compacto — o mesmo formato
 * que a coleta pelo navegador produz (ver scripts/coleta-navegador.md).
 */
export function gravarCompacto(id, { compacto, estratos, recurso, camposFonte = [], iniciadoEm = null, extra = {} }, ctx) {
  const met = metodologiaDeEstratos(estratos, {
    periodoObservado: { min: compacto.q.min, max: compacto.q.max },
    referenciaTemporal: extra.referenciaTemporal ?? "dt_sin_pri (primeiros sintomas), com fallback para dt_notific",
    universoMedidoPor: extra.universoMedidoPor ?? null,
  });
  const ufs = expandir(compacto, { ufsInfo: ctx.ufs, municipios: ctx.municipios, fracao: met.fracaoAmostral });
  if (!ufs.length) throw new Error(`${id}: nenhum registro atendeu à definição de caso no período`);
  const agora = new Date().toISOString();
  escreverAgravo(id, {
    agravo: id,
    estado: "coletado",
    mensagem: null,
    geradoEm: agora,
    metodologia: met,
    coleta: {
      agravo: id,
      fonte: "MS_DADOS_ABERTOS",
      recurso,
      parametros: { limit: LIMIT, estratos: estratos.map((e) => e.rotulo) },
      iniciadoEm: iniciadoEm ?? agora,
      finalizadoEm: agora,
      httpStatus: estratos.some((e) => e.erros) ? 207 : 200,
      paginas: [],
      registros: met.registrosColetados,
      totalFonte: met.universoFonte,
      fracaoAmostral: met.fracaoAmostral,
      status: estratos.some((e) => e.erros) ? "parcial" : "sucesso",
      origemColeta: extra.origemColeta ?? "etl",
    },
    registrosLidos: compacto.q.lidos,
    camposFonte,
    qualidade: compacto.q,
    perfilGlobal: perfilGlobal(ufs),
    ufs,
  });
  log(`  ${id}: ${compacto.q.contados.toLocaleString("pt-BR")} casos de ${compacto.q.lidos.toLocaleString("pt-BR")} registros lidos · ${ufs.length} UFs`);
}

/* ---------------------------------------------------------------- SRAG */

async function coletarSrag(ctx) {
  log("SRAG (SIVEP-Gripe)");
  const t0 = Date.now();
  const iniciadoEm = new Date().toISOString();
  const brutos = [];
  const r = await coletarEstrato({
    base: MS_BASE,
    rota: RECURSOS.srag,
    limit: LIMIT,
    amostraPaginas: PAGINAS.srag,
    censoAte: 0,
    concorrencia: CONCURRENCY,
    normalizar: (linha) => {
      if (brutos.length < 50) brutos.push(linha);
      return normalizarSrag(linha);
    },
    log: coletaLog,
  });
  validarSchema("SRAG", r.registros);

  const c = new Contagem();
  const divergencia = { normal: 0, ate7: 0, ate30: 0, ate180: 0, ate400: 0, acima400: 0 };
  let inconsistencias = 0;
  for (const n of r.registros) {
    c.add(n, r.peso);
    if (n.dataSin && n.dataNot) {
      if (n.dataNot.slice(0, 4) < n.dataSin.slice(0, 4)) inconsistencias++;
      const dias = Math.round((Date.parse(`${n.dataSin}T00:00:00Z`) - Date.parse(`${n.dataNot}T00:00:00Z`)) / 86400000);
      if (Number.isFinite(dias)) {
        if (dias < 0) divergencia.normal++;
        else if (dias <= 7) divergencia.ate7++;
        else if (dias <= 30) divergencia.ate30++;
        else if (dias <= 180) divergencia.ate180++;
        else if (dias <= 400) divergencia.ate400++;
        else divergencia.acima400++;
      }
    }
  }
  const compacto = c.compactar({ pesoUnico: r.peso });
  const fracao = r.coletados / Math.max(1, r.universo);
  const ufs = expandir(compacto, { ufsInfo: ctx.ufs, municipios: ctx.municipios, fracao });

  // formato original do SRAG (meta.json + srag.json)
  const meta = {
    geradoEm: new Date().toISOString(),
    duracaoSegundos: Math.round((Date.now() - t0) / 1000),
    versaoSchema: "2.1.0",
    agravo: "SRAG",
    metodologia: {
      tipo: "amostragem sistemática de páginas",
      limitePorPagina: LIMIT,
      paginasSolicitadas: r.paginas.length,
      paginasTotais: r.totalPaginas,
      passo: Math.round(r.totalPaginas / Math.max(1, r.paginas.length)),
      registrosColetados: r.coletados,
      universoFonte: r.universo,
      fracaoAmostral: Number(fracao.toFixed(6)),
      estimativa: "valor_estimado = valor_observado / fração amostral",
      periodoObservado: { min: compacto.q.min, max: compacto.q.max },
      referenciaTemporal: "dt_sin_pri (data de primeiros sintomas), com fallback para dt_notific",
    },
    qualidade: {
      inconsistenciasData: inconsistencias,
      inconsistenciasDataPct: Number(((inconsistencias / Math.max(1, r.coletados)) * 100).toFixed(2)),
      descricao:
        "Registros em que a data de notificação é anterior à data de primeiros sintomas — inconsistência presente no arquivo de origem.",
      divergenciaDias: { ...divergencia, amostra: Object.values(divergencia).reduce((s, v) => s + v, 0) },
    },
    fontes: FONTES,
    coletas: [
      {
        fonte: "MS_DADOS_ABERTOS",
        recurso: RECURSOS.srag,
        parametros: { limit: LIMIT, paginas: r.paginas },
        iniciadoEm,
        finalizadoEm: new Date().toISOString(),
        httpStatus: r.erros ? 207 : 200,
        paginas: [],
        registros: r.coletados,
        totalFonte: r.universo,
        fracaoAmostral: Number(fracao.toFixed(6)),
        status: r.erros ? "parcial" : "sucesso",
      },
    ],
    totais: {
      ufsComDados: ufs.length,
      registrosAmostrados: r.coletados,
      universoFonte: r.universo,
      fracaoAmostralGlobal: Number(fracao.toFixed(6)),
    },
    perfilGlobal: perfilGlobal(ufs),
    camposFonte: camposDe(brutos),
  };
  escrever("meta.json", meta);
  escrever("srag.json", ufs);
  log(`  SRAG: ${compacto.q.contados.toLocaleString("pt-BR")} registros em ${ufs.length} UFs`);
}

/* ---------------------------------------------------------------- Zika: um estrato por ano, censo */

async function coletarZika(ctx) {
  log("Zika (SINAN) — estratos por nu_ano");
  const iniciadoEm = new Date().toISOString();
  const c = new Contagem();
  const estratos = [];
  for (let ano = 2019; ano <= ANO_ATUAL; ano++) {
    const r = await coletarEstrato({
      base: MS_BASE,
      rota: RECURSOS.zika,
      qs: `nu_ano=${ano}`,
      limit: LIMIT,
      amostraPaginas: PAGINAS.zikaPorAno,
      censoAte: PAGINAS.zikaPorAno,
      concorrencia: CONCURRENCY,
      normalizar: normalizarZika,
      log: coletaLog,
    });
    if (r.coletados) validarSchema(`Zika ${ano}`, r.registros);
    for (const n of r.registros) c.add(n, r.peso);
    estratos.push({ rotulo: `nu_ano=${ano}`, universo: r.universo, coletados: r.coletados, paginas: r.paginas.length, totalPaginas: r.totalPaginas ?? 0, erros: r.erros, peso: r.peso, censo: r.censo });
  }
  gravarCompacto("zika", { compacto: c.compactar(), estratos, recurso: RECURSOS.zika, iniciadoEm, extra: { universoMedidoPor: "busca binária por estrato (a rota não informa total_registros)" } }, ctx);
}

/* ---------------------------------------------------------------- Febre amarela: rota inteira, censo */

async function coletarFebreAmarela(ctx) {
  log("Febre amarela em humanos — censo");
  const iniciadoEm = new Date().toISOString();
  const r = await coletarEstrato({
    base: MS_BASE,
    rota: RECURSOS.febreamarela,
    limit: LIMIT,
    censoAte: 500,
    concorrencia: CONCURRENCY,
    normalizar: normalizarFebreAmarela,
    log: coletaLog,
  });
  validarSchema("Febre amarela", r.registros);
  const c = new Contagem();
  for (const n of r.registros) c.add(n, r.peso);
  gravarCompacto(
    "febreamarela",
    {
      compacto: c.compactar(),
      estratos: [{ rotulo: "rota inteira", universo: r.universo, coletados: r.coletados, paginas: r.paginas.length, totalPaginas: r.totalPaginas ?? 0, erros: r.erros, peso: r.peso, censo: r.censo }],
      recurso: RECURSOS.febreamarela,
      iniciadoEm,
      extra: { referenciaTemporal: "dt_is (início dos sintomas); ano_is/mes_is como fallback" },
    },
    ctx,
  );
}

/* ---------------------------------------------------------------- Dengue: intervalo 2019+, amostra */

/**
 * A rota de Dengue não informa total, recusa o filtro nu_ano (502) e começa em 2000.
 * Como os registros vêm ordenados por ano, a coleta mede o total, acha por busca
 * binária o primeiro registro de 2019 e amostra páginas só desse intervalo.
 * Consultas com offset profundo são lentas nesse servidor: timeout longo.
 */
async function coletarDengue(ctx) {
  log("Dengue (SINAN) — intervalo 2019+");
  const iniciadoEm = new Date().toISOString();
  let total;
  let inicio;
  try {
    ({ total } = await medirUniverso(MS_BASE, RECURSOS.dengue, ""));
    inicio = await inicioDoAno(MS_BASE, RECURSOS.dengue, total, 2019);
  } catch (err) {
    // Comportamento observado em 27/11/2026: offsets profundos passam de 60 s e o
    // proxy do MS devolve 502; nu_ano também dá 502. Mensagem explícita em vez de genérica.
    throw new Error(
      `a rota ${RECURSOS.dengue} não alcança 2019+: sem total_registros, nu_ano devolve 502 e offsets profundos excedem o tempo do servidor (${err.message})`,
    );
  }
  log(`  universo ${total.toLocaleString("pt-BR")} · 2019 começa no registro ${inicio.toLocaleString("pt-BR")}`);
  const r = await coletarEstrato({
    base: MS_BASE,
    rota: RECURSOS.dengue,
    limit: LIMIT,
    inicio,
    fim: total,
    total,
    amostraPaginas: PAGINAS.dengue,
    censoAte: 0,
    concorrencia: CONCURRENCY,
    normalizar: normalizarDengue,
    log: coletaLog,
  });
  validarSchema("Dengue", r.registros);
  const c = new Contagem();
  for (const n of r.registros) c.add(n, r.peso);
  gravarCompacto(
    "dengue",
    {
      compacto: c.compactar({ pesoUnico: r.peso }),
      estratos: [{ rotulo: `registros [${inicio}, ${total})`, universo: r.universo, coletados: r.coletados, paginas: r.paginas.length, totalPaginas: r.totalPaginas ?? 0, erros: r.erros, peso: r.peso, censo: r.censo }],
      recurso: RECURSOS.dengue,
      iniciadoEm,
      extra: { universoMedidoPor: "busca binária (a rota não informa total_registros)" },
    },
    ctx,
  );
}

/**
 * Importa o resultado de uma coleta feita no navegador (scripts/coleta-navegador.md).
 * O arquivo traz, por agravo: { compacto, estratos, soma }. A soma de verificação
 * é recalculada; se não bater, nada é gravado.
 */
async function importarColeta(arquivo, ctx) {
  const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  for (const [id, d] of Object.entries(dados)) {
    if (!["dengue", "zika", "febreamarela"].includes(id)) continue;
    const soma = somaVerificacao(d.compacto);
    if (d.soma !== undefined && soma !== d.soma) throw new Error(`${id}: soma de verificação não confere (${soma} ≠ ${d.soma})`);
    gravarCompacto(
      id,
      {
        compacto: d.compacto,
        estratos: d.estratos,
        recurso: RECURSOS[id],
        iniciadoEm: d.iniciadoEm ?? null,
        extra: {
          origemColeta: "navegador",
          universoMedidoPor: d.universoMedidoPor ?? null,
          ...(id === "febreamarela" ? { referenciaTemporal: "dt_is (início dos sintomas); ano_is/mes_is como fallback" } : {}),
        },
      },
      ctx,
    );
  }
}

/* =============================================================== IBGE */

async function territorios() {
  const anterior = (arq) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, arq), "utf8"));
    } catch {
      return null;
    }
  };

  let ufs = null;
  try {
    log("IBGE: unidades da federação");
    const { data } = await getJson(`${IBGE_BASE}/v1/localidades/estados?orderBy=nome`);
    ufs = data.map((e) => ({
      codigo: String(e.id),
      sigla: e.sigla,
      nome: e.nome,
      regiao: e.regiao?.nome ?? null,
      regiaoSigla: e.regiao?.sigla ?? null,
    }));
    log(`  ${ufs.length} UFs`);
  } catch (err) {
    ufs = anterior("ufs.json");
    if (!ufs) throw new Error(`IBGE indisponível e sem snapshot anterior de UFs (${err.message})`);
    log(`  IBGE indisponível (${err.message}) — usando ufs.json existente`);
  }

  log("IBGE: população residente estimada (agregado 6579, variável 9324)");
  const populacao = [];
  for (const ano of ANOS_POPULACAO) {
    try {
      const { data } = await getJson(`${IBGE_BASE}/v3/agregados/6579/periodos/${ano}/variaveis/9324?localidades=N3[all]`);
      const serie = data?.[0]?.resultados?.[0]?.series ?? [];
      let n = 0;
      for (const s of serie) {
        const valor = num(s.serie?.[String(ano)]);
        if (valor) {
          populacao.push({ ufCodigo: String(s.localidade.id), ano, populacao: valor });
          n++;
        }
      }
      log(`  ${ano}: ${n} UFs`);
    } catch (err) {
      log(`  ${ano}: indisponível (${err.message})`);
    }
  }
  const popFinal = populacao.length ? populacao : anterior("populacao.json") ?? [];

  let municipios = [];
  try {
    log("IBGE: índice de municípios (validação de código IBGE)");
    const { data } = await getJson(`${IBGE_BASE}/v1/localidades/municipios?view=nivelado`, { timeoutMs: 180000 });
    municipios = data.map((m) => ({
      codigo: String(m["municipio-id"]),
      nome: m["municipio-nome"],
      ufCodigo: String(m["UF-id"]),
      ufSigla: m["UF-sigla"],
    }));
    log(`  ${municipios.length} municípios`);
  } catch (err) {
    municipios = anterior("municipios.json") ?? [];
    log(`  indisponível (${err.message}) — usando municipios.json existente (${municipios.length})`);
  }

  escrever("ufs.json", ufs);
  escrever("populacao.json", popFinal);
  fs.writeFileSync(path.join(SNAP_DIR, "municipios.json"), JSON.stringify(municipios));
  return { ufs, municipios };
}

/* =============================================================== saída */

const FONTES = [
  {
    id: "MS_DADOS_ABERTOS",
    nome: "API de Dados Abertos do Ministério da Saúde (DEMAS/SVSA)",
    orgao: "Ministério da Saúde",
    urlBase: MS_BASE,
    recurso: Object.values(RECURSOS).join(", "),
    documentacao: "https://apidadosabertos.saude.gov.br/v1/",
    licenca: "Dados abertos governamentais",
    requerAutenticacao: false,
    atualizacao: "conforme publicação de cada conjunto (SRAG, Dengue, Zika, Febre amarela)",
    granularidade: "notificação individual (microdado) agregada por UF e mês",
  },
  {
    id: "IBGE",
    nome: "API de Localidades, Malhas e Agregados do IBGE",
    orgao: "IBGE",
    urlBase: IBGE_BASE,
    documentacao: "https://servicodados.ibge.gov.br/api/docs",
    licenca: "Dados abertos (IBGE)",
    requerAutenticacao: false,
    atualizacao: "anual (estimativas populacionais)",
    granularidade: "UF e município",
  },
  {
    id: "ESUS_NOTIFICA",
    nome: "e-SUS Notifica (API restrita)",
    orgao: "Ministério da Saúde",
    urlBase: "https://esusnotifica.saude.gov.br",
    documentacao: "https://datasus.saude.gov.br/wp-content/uploads/2022/02/Manual-de-Utilizacao-da-API-e-Sus-Notifica.pdf",
    licenca: "Acesso autorizado",
    requerAutenticacao: true,
    atualizacao: "tempo real",
    granularidade: "notificação individual",
  },
];

function escrever(arquivo, dados) {
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  fs.writeFileSync(path.join(SNAP_DIR, arquivo), JSON.stringify(dados, null, 2));
}

function lerAgravo(id) {
  try {
    return JSON.parse(fs.readFileSync(path.join(AGR_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

function escreverAgravo(id, dados) {
  fs.mkdirSync(AGR_DIR, { recursive: true });
  fs.writeFileSync(path.join(AGR_DIR, `${id}.json`), JSON.stringify(dados, null, 2));
}

/** Falha não apaga dado bom: só anota a tentativa. Sem dado anterior, grava estado "erro". */
function registrarFalha(id, err) {
  const anterior = lerAgravo(id);
  const tentativa = { em: new Date().toISOString(), erro: String(err.message ?? err).slice(0, 600) };
  if (anterior?.estado === "coletado") {
    escreverAgravo(id, { ...anterior, ultimaTentativa: tentativa });
    log(`  ${id}: falhou, snapshot anterior preservado (${tentativa.erro})`);
  } else {
    escreverAgravo(id, {
      agravo: id,
      estado: "erro",
      mensagem: `Última coleta falhou: ${tentativa.erro}`,
      geradoEm: null,
      metodologia: null,
      coleta: null,
      registrosLidos: null,
      camposFonte: [],
      perfilGlobal: null,
      ultimaTentativa: tentativa,
      ufs: [],
    });
    log(`  ${id}: falhou — ${tentativa.erro}`);
  }
}

/* ---------------------------------------------------------------- seed SQL */

export function gerarSeed() {
  const ler = (arq) => JSON.parse(fs.readFileSync(path.join(SNAP_DIR, arq), "utf8"));
  const ufs = ler("ufs.json");
  const populacao = ler("populacao.json");
  const meta = ler("meta.json");
  const srag = ler("srag.json");

  const conjuntos = [
    { agravo: "SRAG", coleta: { ...meta.coletas?.[0], agravo: "srag" }, ufs: srag },
    ...["dengue", "zika", "febreamarela"]
      .map((id) => lerAgravo(id))
      .filter((d) => d?.estado === "coletado" && d.ufs?.length)
      .map((d) => ({ agravo: d.agravo.toUpperCase(), coleta: d.coleta, ufs: d.ufs })),
  ];

  const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const L = [];
  L.push("-- HealthData Brasil — seed gerado por scripts/etl.mjs (v2, multiagravo)");
  L.push(`-- gerado em ${new Date().toISOString()} | agravos: ${conjuntos.map((c) => c.agravo).join(", ")}`);
  L.push("BEGIN;");
  L.push("TRUNCATE indicador, perfil, coleta, populacao, uf, municipio_amostra RESTART IDENTITY CASCADE;");
  for (const u of ufs) {
    L.push(`INSERT INTO uf (codigo_ibge, sigla, nome, regiao) VALUES (${q(u.codigo)}, ${q(u.sigla)}, ${q(u.nome)}, ${q(u.regiao)}) ON CONFLICT DO NOTHING;`);
  }
  for (const p of populacao) {
    L.push(`INSERT INTO populacao (uf_codigo, ano, populacao, fonte) VALUES (${q(p.ufCodigo)}, ${p.ano}, ${p.populacao}, 'IBGE 6579/9324') ON CONFLICT DO NOTHING;`);
  }

  conjuntos.forEach((conj, i) => {
    const id = i + 1;
    const c = conj.coleta ?? {};
    const ins = (ufCodigo, ano, mes, metrica, amostra, estimado) =>
      `INSERT INTO indicador (agravo, uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado, unidade, coleta_id) VALUES ('${conj.agravo}', ${q(ufCodigo)}, ${ano ?? "NULL"}, ${mes ?? "NULL"}, '${metrica}', ${amostra}, ${estimado}, 'registros', ${id});`;
    L.push(
      `INSERT INTO coleta (id, agravo, fonte, recurso, parametros, http_status, iniciado_em, finalizado_em, registros, total_fonte, fracao_amostral, status, paginas) VALUES (${id}, '${conj.agravo}', ${q(c.fonte ?? "MS_DADOS_ABERTOS")}, ${q(c.recurso)}, ${q(JSON.stringify(c.parametros ?? {}))}::jsonb, ${c.httpStatus ?? "NULL"}, ${q(c.iniciadoEm)}, ${q(c.finalizadoEm)}, ${c.registros ?? 0}, ${c.totalFonte ?? 0}, ${c.fracaoAmostral ?? 0}, ${q(c.status ?? "sucesso")}, ${q(JSON.stringify(c.paginas ?? []))}::jsonb);`,
    );
    for (const u of conj.ufs) {
      for (const [ano, valor] of Object.entries(u.porAno)) L.push(ins(u.ufCodigo, Number(ano), null, "notificacoes", valor, u.porAnoEstimado[ano]));
      for (const [mes, valor] of Object.entries(u.porMes)) {
        const [ano, mm] = mes.split("-");
        L.push(ins(u.ufCodigo, Number(ano), Number(mm), "notificacoes", valor, u.porMesEstimado[mes]));
      }
      L.push(ins(u.ufCodigo, null, null, "obitos", u.obitosAmostra, u.obitosEstimado));
      for (const [ano, valor] of Object.entries(u.obitosPorAno ?? {})) {
        L.push(ins(u.ufCodigo, Number(ano), null, "obitos", valor, u.obitosPorAnoEstimado?.[ano] ?? valor));
      }
      for (const [dim, obj] of Object.entries(u.perfil)) {
        for (const [cat, n] of Object.entries(obj)) {
          L.push(
            `INSERT INTO perfil (agravo, uf_codigo, dimensao, categoria, contagem, proporcao, coleta_id) VALUES ('${conj.agravo}', ${q(u.ufCodigo)}, ${q(dim)}, ${q(cat)}, ${n}, ${(n / Math.max(1, u.amostra)).toFixed(6)}, ${id});`,
          );
        }
      }
      for (const mun of u.municipiosAmostra ?? []) {
        L.push(
          `INSERT INTO municipio_amostra (agravo, uf_codigo, municipio_codigo, municipio_nome, amostra, estimado, coleta_id) VALUES ('${conj.agravo}', ${q(u.ufCodigo)}, ${q(mun.codigo)}, ${q(mun.nome)}, ${mun.amostra}, ${mun.estimado}, ${id});`,
        );
      }
    }
  });
  L.push(`SELECT setval(pg_get_serial_sequence('coleta', 'id'), ${conjuntos.length});`);
  L.push("COMMIT;");
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.writeFileSync(path.join(DB_DIR, "seed.sql"), L.join("\n") + "\n");
  log(`seed.sql: ${conjuntos.map((c) => c.agravo).join(", ")}`);
}

/* =============================================================== main */

const COLETORES = { srag: coletarSrag, dengue: coletarDengue, zika: coletarZika, febreamarela: coletarFebreAmarela };

function argumentos(argv) {
  const a = { agravos: Object.keys(COLETORES), soSeed: false, importar: null };
  for (const arg of argv) {
    if (arg === "--so-seed") a.soSeed = true;
    const m = arg.match(/^--agravos=(.+)$/);
    if (m) a.agravos = m[1].split(",").map((s) => s.trim().toLowerCase().replace("febre-amarela", "febreamarela").replace("zikavirus", "zika"));
    const i = arg.match(/^--importar=(.+)$/);
    if (i) a.importar = i[1];
  }
  if (process.env.AGRAVOS) a.agravos = process.env.AGRAVOS.split(",").map((s) => s.trim().toLowerCase());
  a.agravos = [...new Set(a.agravos)].filter((x) => x in COLETORES);
  return a;
}

/** Contexto territorial sem rede: usado ao importar uma coleta feita no navegador. */
function territoriosDoSnapshot() {
  const ler = (arq) => JSON.parse(fs.readFileSync(path.join(SNAP_DIR, arq), "utf8"));
  return { ufs: ler("ufs.json"), municipios: ler("municipios.json") };
}

export async function main(argv = process.argv.slice(2)) {
  const args = argumentos(argv);
  const t0 = Date.now();
  fs.mkdirSync(AGR_DIR, { recursive: true });

  if (args.soSeed) {
    gerarSeed();
    return { ok: [], falhas: [] };
  }

  if (args.importar) {
    await importarColeta(path.resolve(args.importar), territoriosDoSnapshot());
    gerarSeed();
    return { ok: ["importado"], falhas: [] };
  }

  const ctx = await territorios();
  const ok = [];
  const falhas = [];

  for (const id of args.agravos) {
    try {
      await COLETORES[id](ctx);
      ok.push(id);
    } catch (err) {
      falhas.push(id);
      registrarFalha(id, err);
    }
  }

  gerarSeed();
  log(`Concluído em ${Math.round((Date.now() - t0) / 1000)}s — ok: ${ok.join(", ") || "nenhum"}${falhas.length ? ` · falhas: ${falhas.join(", ")}` : ""}`);
  return { ok, falhas };
}

// Executa só quando chamado direto (permite importar as funções em testes).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    ({ falhas }) => process.exit(falhas.length ? 2 : 0),
    (err) => {
      console.error("FALHA", err);
      process.exit(1);
    },
  );
}
