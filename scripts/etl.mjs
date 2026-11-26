#!/usr/bin/env node
/**
 * HealthData Brasil — ETL de dados oficiais
 * ---------------------------------------------------------------------------
 * Fontes oficiais:
 *  1. API de Dados Abertos do Ministério da Saúde (DEMAS/SVSA)
 *     GET /vigilancia-e-meio-ambiente/srag-2019-2026
 *  2. API de Localidades, Malhas e Agregados do IBGE
 *     GET /api/v1/localidades/estados
 *     GET /api/v3/agregados/6579/periodos/{ano}/variaveis/9324 (população residente estimada)
 *
 * Por que amostragem sistemática de páginas?
 *  - O conjunto SRAG tem ~4,4 milhões de registros e a API não aceita filtro por
 *    ano/competência (o parâmetro responde vazio); só aceita `sg_uf_not` e
 *    `co_mun_not`. O parâmetro `offset` é ÍNDICE DE PÁGINA, não de registro.
 *  - Uma coleta das primeiras páginas concentraria apenas 2018/2019 (os dados
 *    estão ordenados por data de notificação), criando viés grave.
 *  - Por isso selecionamos páginas distribuídas uniformemente ao longo de todo o
 *    universo (passo constante), o que produz uma amostra sistemática com
 *    inclusão conhecida (1 a cada k páginas) e cobertura de todos os anos.
 *  - A fração amostral (coletados / total_registros) é registrada em cada coleta
 *    e usada para estimar contagens: estimativa = observado / fração.
 *
 * Saídas:
 *  - data/snapshot/*.json  (camada de cache/serviço da aplicação)
 *  - db/seed.sql           (mesmos agregados como INSERTs para Postgres/Supabase)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAP_DIR = path.join(ROOT, "data", "snapshot");
const DB_DIR = path.join(ROOT, "db");

const MS_BASE = "https://apidadosabertos.saude.gov.br";
const IBGE_BASE = "https://servicodados.ibge.gov.br/api";
const SRAG_RESOURCE = "/vigilancia-e-meio-ambiente/srag-2019-2026";

const LIMIT = Number(process.env.SRAG_LIMIT || 1000);
const PAGES = Number(process.env.SRAG_PAGES || 80);
const CONCURRENCY = Number(process.env.ETL_CONCURRENCY || 4);
const ANOS_POPULACAO = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { tries = 3, timeoutMs = 120000 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { Accept: "application/json", "User-Agent": "HealthDataBrasil/1.0 (projeto academico)" },
      });
      const text = await res.text();
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { data: JSON.parse(text), status: res.status, ms: Date.now() - started };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const CLASSI_FIN = {
  1: "SRAG por Influenza",
  2: "SRAG por outro vírus respiratório",
  3: "SRAG por outro agente etiológico",
  4: "SRAG não especificado",
  5: "SRAG por COVID-19",
};
const EVOLUCAO = { 1: "Cura", 2: "Óbito por SRAG", 3: "Óbito por outras causas", 9: "Ignorado" };
const SIM_NAO = { 1: "Sim", 2: "Não", 9: "Ignorado" };

function faixaEtaria(idade, tipo) {
  let anos = num(idade);
  if (anos === null) return "Não informado";
  if (String(tipo) === "1") anos = anos / 365;
  else if (String(tipo) === "2") anos = anos / 12;
  if (anos < 1) return "< 1 ano";
  if (anos < 5) return "1-4 anos";
  if (anos < 12) return "5-11 anos";
  if (anos < 18) return "12-17 anos";
  if (anos < 30) return "18-29 anos";
  if (anos < 60) return "30-59 anos";
  return "60+ anos";
}

function systematicPages(totalPages, n) {
  const count = Math.min(n, totalPages);
  if (count === 1) return [0];
  const step = (totalPages - 1) / (count - 1);
  const set = new Set();
  for (let i = 0; i < count; i++) set.add(Math.round(i * step));
  return [...set].sort((a, b) => a - b);
}

const inc = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const toObj = (map, fn = (v) => v) =>
  Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([k, v]) => [k, fn(v)]));

async function main() {
  fs.mkdirSync(SNAP_DIR, { recursive: true });
  fs.mkdirSync(DB_DIR, { recursive: true });
  const t0 = Date.now();

  // ------------------------------------------------------------ territórios
  log("IBGE: unidades da federação");
  const { data: estados } = await getJson(`${IBGE_BASE}/v1/localidades/estados?orderBy=nome`);
  const ufs = estados.map((e) => ({
    codigo: String(e.id),
    sigla: e.sigla,
    nome: e.nome,
    regiao: e.regiao?.nome ?? null,
    regiaoSigla: e.regiao?.sigla ?? null,
  }));
  log(`  ${ufs.length} UFs`);

  // ------------------------------------------------------------ população
  log("IBGE: população residente estimada (agregado 6579, variável 9324)");
  const populacao = [];
  for (const ano of ANOS_POPULACAO) {
    try {
      const { data } = await getJson(
        `${IBGE_BASE}/v3/agregados/6579/periodos/${ano}/variaveis/9324?localidades=N3[all]`,
      );
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

  // ------------------------------------------------------------ municípios
  log("IBGE: índice de municípios (validação de código IBGE)");
  let municipios = [];
  try {
    const { data } = await getJson(`${IBGE_BASE}/v1/localidades/municipios?view=nivelado`, { timeoutMs: 180000 });
    municipios = data.map((m) => ({
      codigo: String(m["municipio-id"]),
      nome: m["municipio-nome"],
      ufCodigo: String(m["UF-id"]),
      ufSigla: m["UF-sigla"],
    }));
    log(`  ${municipios.length} municípios`);
  } catch (err) {
    log(`  indisponível: ${err.message}`);
  }

  // ------------------------------------------------------------ SRAG
  log(`SRAG: sonda de universo (limit=1)`);
  const probe = await getJson(`${MS_BASE}${SRAG_RESOURCE}?limit=1`);
  const total = Number(probe.data.total_registros ?? 0);
  const totalPages = Math.ceil(total / LIMIT);
  const pages = systematicPages(totalPages, PAGES);
  log(`  universo=${total.toLocaleString("pt-BR")} registros / ${totalPages.toLocaleString("pt-BR")} páginas`);
  log(`  amostra: ${pages.length} páginas (passo ≈ ${Math.round(totalPages / Math.max(1, pages.length))})`);

  const pageResults = await pool(pages, CONCURRENCY, async (page) => {
    const url = `${MS_BASE}${SRAG_RESOURCE}?limit=${LIMIT}&offset=${page}`;
    try {
      const { data, status, ms } = await getJson(url);
      const chave = Object.keys(data).find((k) => Array.isArray(data[k]));
      const rows = data[chave] ?? [];
      return { page, httpStatus: status, ms, rows, erro: null };
    } catch (err) {
      log(`  página ${page}: erro ${err.message}`);
      return { page, httpStatus: null, ms: null, rows: [], erro: String(err.message).slice(0, 200) };
    }
  });

  const registros = pageResults.flatMap((p) => p.rows);
  const coletados = registros.length;
  const fracao = coletados / total;
  log(`  coletados ${coletados.toLocaleString("pt-BR")} registros (${(fracao * 100).toFixed(2)}%)`);

  const estimar = (n) => Math.round(n / (fracao || 1));

  // agregações
  const porUf = new Map();
  const perfilGlobal = {
    classificacao: new Map(),
    evolucao: new Map(),
    uti: new Map(),
    hospitalizacao: new Map(),
    vacinaGripe: new Map(),
    sexo: new Map(),
    faixaEtaria: new Map(),
  };
  const porUfDetalhe = new Map();
  let minData = null;
  let maxData = null;
  // Histograma da divergência entre data de primeiros sintomas e data de notificação
  // (em dias). Serve para documentar a qualidade do arquivo de origem.
  const divergencia = { normal: 0, ate7: 0, ate30: 0, ate180: 0, ate400: 0, acima400: 0 };

  const ufBucket = (sigla) => {
    if (!porUfDetalhe.has(sigla)) {
      porUfDetalhe.set(sigla, {
        porAno: new Map(),
        porMes: new Map(),
        porAnoNotificacao: new Map(),
        classificacao: new Map(),
        evolucao: new Map(),
        uti: new Map(),
        hospitalizacao: new Map(),
        vacinaGripe: new Map(),
        sexo: new Map(),
        faixaEtaria: new Map(),
        municipios: new Map(),
        obitos: 0,
        utiSim: 0,
        internados: 0,
        total: 0,
        inconsistenciasData: 0,
      });
    }
    return porUfDetalhe.get(sigla);
  };

  for (const r of registros) {
    const sigla = String(r.sg_uf_not ?? r.sg_uf ?? "??").trim().toUpperCase();
    // Parte do conjunto traz dt_notific ANTERIOR a dt_sin_pri (inconsistência do
    // próprio arquivo). A referência epidemiológica adotada é a data de primeiros
    // sintomas; o ano de notificação é mantido apenas para medir a divergência.
    const anoSin = r.dt_sin_pri?.slice(0, 4) ?? null;
    const anoNot = r.dt_notific?.slice(0, 4) ?? null;
    const ano = String(anoSin ?? anoNot ?? "?");
    const mes = r.dt_sin_pri?.slice(0, 7) ?? r.dt_notific?.slice(0, 7) ?? null;
    inc(porUf, sigla);
    const b = ufBucket(sigla);
    b.total++;
    inc(b.porAno, ano);
    if (anoNot) inc(b.porAnoNotificacao, anoNot);
    if (anoSin && anoNot && anoNot < anoSin) b.inconsistenciasData++;
    if (r.dt_sin_pri && r.dt_notific) {
      const dias = Math.round(
        (Date.parse(`${r.dt_sin_pri.slice(0, 10)}T00:00:00Z`) -
          Date.parse(`${r.dt_notific.slice(0, 10)}T00:00:00Z`)) /
          86400000,
      );
      if (Number.isFinite(dias)) {
        if (dias < 0) divergencia.normal++;
        else if (dias <= 7) divergencia.ate7++;
        else if (dias <= 30) divergencia.ate30++;
        else if (dias <= 180) divergencia.ate180++;
        else if (dias <= 400) divergencia.ate400++;
        else divergencia.acima400++;
      }
    }
    if (mes) inc(b.porMes, mes);
    inc(b.classificacao, CLASSI_FIN[String(r.classi_fin)] ?? "Não informado");
    inc(b.evolucao, EVOLUCAO[String(r.evolucao)] ?? "Ignorado");
    inc(b.uti, SIM_NAO[String(r.uti)] ?? "Ignorado");
    inc(b.hospitalizacao, SIM_NAO[String(r.hospital)] ?? "Ignorado");
    inc(b.vacinaGripe, SIM_NAO[String(r.vacina)] ?? "Ignorado");
    inc(b.sexo, r.cs_sexo === "M" ? "Masculino" : r.cs_sexo === "F" ? "Feminino" : "Ignorado");
    inc(b.faixaEtaria, faixaEtaria(r.nu_idade_n, r.tp_idade));
    if (String(r.evolucao) === "2") b.obitos++;
    if (String(r.uti) === "1") b.utiSim++;
    if (String(r.hospital) === "1") b.internados++;
    const mun = r.co_mun_res ?? r.co_mun_not;
    if (mun) inc(b.municipios, String(mun));

    inc(perfilGlobal.classificacao, CLASSI_FIN[String(r.classi_fin)] ?? "Não informado");
    inc(perfilGlobal.evolucao, EVOLUCAO[String(r.evolucao)] ?? "Ignorado");
    inc(perfilGlobal.uti, SIM_NAO[String(r.uti)] ?? "Ignorado");
    inc(perfilGlobal.hospitalizacao, SIM_NAO[String(r.hospital)] ?? "Ignorado");
    inc(perfilGlobal.vacinaGripe, SIM_NAO[String(r.vacina)] ?? "Ignorado");
    inc(perfilGlobal.sexo, r.cs_sexo === "M" ? "Masculino" : r.cs_sexo === "F" ? "Feminino" : "Ignorado");
    inc(perfilGlobal.faixaEtaria, faixaEtaria(r.nu_idade_n, r.tp_idade));

    const dataRef = r.dt_sin_pri ?? r.dt_notific;
    if (dataRef) {
      if (!minData || dataRef < minData) minData = dataRef;
      if (!maxData || dataRef > maxData) maxData = dataRef;
    }
  }

  const ufBySigla = new Map(ufs.map((u) => [u.sigla, u]));
  const srag = [...porUf.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sigla, n]) => {
      const u = ufBySigla.get(sigla);
      const b = porUfDetalhe.get(sigla);
      return {
        ufSigla: sigla,
        ufCodigo: u?.codigo ?? null,
        ufNome: u?.nome ?? sigla,
        regiao: u?.regiao ?? null,
        amostra: n,
        estimado: estimar(n),
        fracaoAmostral: Number(fracao.toFixed(6)),
        obitosAmostra: b.obitos,
        obitosEstimado: estimar(b.obitos),
        utiAmostra: b.utiSim,
        internadosAmostra: b.internados,
        porAno: toObj(b.porAno),
        porAnoEstimado: toObj(b.porAno, estimar),
        porAnoNotificacao: toObj(b.porAnoNotificacao),
        porMes: toObj(b.porMes),
        porMesEstimado: toObj(b.porMes, estimar),
        inconsistenciasData: b.inconsistenciasData,
        inconsistenciasDataPct: Number(((b.inconsistenciasData / Math.max(1, b.total)) * 100).toFixed(2)),
        perfil: {
          classificacao: toObj(b.classificacao),
          evolucao: toObj(b.evolucao),
          uti: toObj(b.uti),
          hospitalizacao: toObj(b.hospitalizacao),
          vacinaGripe: toObj(b.vacinaGripe),
          sexo: toObj(b.sexo),
          faixaEtaria: toObj(b.faixaEtaria),
        },
        municipiosAmostra: [...b.municipios.entries()]
          .sort((x, y) => y[1] - x[1])
          .slice(0, 10)
          .map(([codigo, qtd]) => ({
            codigo,
            nome: municipios.find((m) => m.codigo === codigo)?.nome ?? null,
            amostra: qtd,
            estimado: estimar(qtd),
          })),
      };
    });

  const meta = {
    geradoEm: new Date().toISOString(),
    duracaoSegundos: Math.round((Date.now() - t0) / 1000),
    versaoSchema: "1.0.0",
    agravo: "SRAG",
    metodologia: {
      tipo: "amostragem sistemática de páginas",
      limitePorPagina: LIMIT,
      paginasSolicitadas: pages.length,
      paginasTotais: totalPages,
      passo: Math.round(totalPages / Math.max(1, pages.length)),
      registrosColetados: coletados,
      universoFonte: total,
      fracaoAmostral: Number(fracao.toFixed(6)),
      periodoObservado: { min: minData, max: maxData },
      estimativa: "valor_estimado = valor_observado / fração amostral",
      referenciaTemporal: "dt_sin_pri (data de primeiros sintomas), com fallback para dt_notific",
    },
    qualidade: {
      inconsistenciasData: [...porUfDetalhe.values()].reduce((s, b) => s + b.inconsistenciasData, 0),
      inconsistenciasDataPct: Number(
        (
          ([...porUfDetalhe.values()].reduce((s, b) => s + b.inconsistenciasData, 0) /
            Math.max(1, coletados)) *
          100
        ).toFixed(2),
      ),
      descricao:
        "Registros em que a data de notificação é anterior à data de primeiros sintomas — inconsistência presente no arquivo de origem.",
      divergenciaDias: {
        ...divergencia,
        amostra: Object.values(divergencia).reduce((s, v) => s + v, 0),
      },
    },
    fontes: [
      {
        id: "MS_DADOS_ABERTOS",
        nome: "API de Dados Abertos do Ministério da Saúde (DEMAS/SVSA)",
        orgao: "Ministério da Saúde",
        urlBase: MS_BASE,
        recurso: SRAG_RESOURCE,
        documentacao: "https://apidadosabertos.saude.gov.br/v1/",
        licenca: "Dados abertos governamentais",
        requerAutenticacao: false,
        atualizacao: "conforme publicação do conjunto SRAG 2019-2026",
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
    ],
    coletas: [
      {
        fonte: "MS_DADOS_ABERTOS",
        recurso: SRAG_RESOURCE,
        parametros: { limit: LIMIT, paginas: pages },
        iniciadoEm: new Date(t0).toISOString(),
        finalizadoEm: new Date().toISOString(),
        httpStatus: pageResults.every((p) => p.httpStatus === 200) ? 200 : 207,
        paginas: pageResults.map((p) => ({ page: p.page, httpStatus: p.httpStatus, ms: p.ms, registros: p.rows.length, erro: p.erro })),
        registros: coletados,
        totalFonte: total,
        fracaoAmostral: Number(fracao.toFixed(6)),
        status: pageResults.some((p) => p.erro) ? "parcial" : "sucesso",
      },
    ],
    totais: {
      ufsComDados: srag.length,
      registrosAmostrados: coletados,
      universoFonte: total,
      fracaoAmostralGlobal: Number(fracao.toFixed(6)),
    },
    perfilGlobal: {
      classificacao: toObj(perfilGlobal.classificacao),
      evolucao: toObj(perfilGlobal.evolucao),
      uti: toObj(perfilGlobal.uti),
      hospitalizacao: toObj(perfilGlobal.hospitalizacao),
      vacinaGripe: toObj(perfilGlobal.vacinaGripe),
      sexo: toObj(perfilGlobal.sexo),
      faixaEtaria: toObj(perfilGlobal.faixaEtaria),
    },
  };

  fs.writeFileSync(path.join(SNAP_DIR, "meta.json"), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(SNAP_DIR, "ufs.json"), JSON.stringify(ufs, null, 2));
  fs.writeFileSync(path.join(SNAP_DIR, "populacao.json"), JSON.stringify(populacao, null, 2));
  fs.writeFileSync(path.join(SNAP_DIR, "municipios.json"), JSON.stringify(municipios));
  fs.writeFileSync(path.join(SNAP_DIR, "srag.json"), JSON.stringify(srag, null, 2));

  // ------------------------------------------------------------ seed SQL
  const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
  const L = [];
  L.push("-- HealthData Brasil — seed gerado por scripts/etl.mjs");
  L.push(`-- gerado em ${meta.geradoEm} | fonte: MS Dados Abertos (SRAG) + IBGE`);
  L.push("BEGIN;");
  L.push("TRUNCATE indicador, perfil, coleta, populacao, uf RESTART IDENTITY CASCADE;");
  for (const u of ufs) {
    L.push(
      `INSERT INTO uf (codigo_ibge, sigla, nome, regiao) VALUES (${q(u.codigo)}, ${q(u.sigla)}, ${q(u.nome)}, ${q(u.regiao)}) ON CONFLICT DO NOTHING;`,
    );
  }
  for (const p of populacao) {
    L.push(
      `INSERT INTO populacao (uf_codigo, ano, populacao, fonte) VALUES (${q(p.ufCodigo)}, ${p.ano}, ${p.populacao}, 'IBGE 6579/9324') ON CONFLICT DO NOTHING;`,
    );
  }
  const c = meta.coletas[0];
  L.push(
    `INSERT INTO coleta (id, fonte, recurso, parametros, http_status, iniciado_em, finalizado_em, registros, total_fonte, fracao_amostral, status, paginas) VALUES (1, ${q(c.fonte)}, ${q(c.recurso)}, ${q(JSON.stringify(c.parametros))}::jsonb, ${c.httpStatus}, ${q(c.iniciadoEm)}, ${q(c.finalizadoEm)}, ${c.registros}, ${c.totalFonte}, ${c.fracaoAmostral}, ${q(c.status)}, ${q(JSON.stringify(c.paginas))}::jsonb);`,
  );
  for (const u of srag) {
    for (const [ano, valor] of Object.entries(u.porAno)) {
      L.push(
        `INSERT INTO indicador (agravo, uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado, unidade, coleta_id) VALUES ('SRAG', ${q(u.ufCodigo)}, ${Number(ano)}, NULL, 'notificacoes', ${valor}, ${u.porAnoEstimado[ano]}, 'registros', 1);`,
      );
    }
    for (const [mes, valor] of Object.entries(u.porMes)) {
      const [ano, mm] = mes.split("-");
      L.push(
        `INSERT INTO indicador (agravo, uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado, unidade, coleta_id) VALUES ('SRAG', ${q(u.ufCodigo)}, ${Number(ano)}, ${Number(mm)}, 'notificacoes', ${valor}, ${u.porMesEstimado[mes]}, 'registros', 1);`,
      );
    }
    L.push(
      `INSERT INTO indicador (agravo, uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado, unidade, coleta_id) VALUES ('SRAG', ${q(u.ufCodigo)}, NULL, NULL, 'obitos', ${u.obitosAmostra}, ${u.obitosEstimado}, 'registros', 1);`,
    );
    for (const [dim, obj] of Object.entries(u.perfil)) {
      for (const [cat, n] of Object.entries(obj)) {
        L.push(
          `INSERT INTO perfil (agravo, uf_codigo, dimensao, categoria, contagem, proporcao, coleta_id) VALUES ('SRAG', ${q(u.ufCodigo)}, ${q(dim)}, ${q(cat)}, ${n}, ${(n / u.amostra).toFixed(6)}, 1);`,
        );
      }
    }
    for (const mun of u.municipiosAmostra ?? []) {
      L.push(
        `INSERT INTO municipio_amostra (uf_codigo, municipio_codigo, municipio_nome, amostra, estimado, coleta_id) VALUES (${q(u.ufCodigo)}, ${q(mun.codigo)}, ${q(mun.nome)}, ${mun.amostra}, ${mun.estimado}, 1) ON CONFLICT DO NOTHING;`,
      );
    }
  }
  L.push("COMMIT;");
  fs.writeFileSync(path.join(DB_DIR, "seed.sql"), L.join("\n") + "\n");

  log(`OK em ${meta.duracaoSegundos}s — ${srag.length} UFs, ${coletados} registros de ${total}`);
}

main().catch((err) => {
  console.error("FALHA", err);
  process.exit(1);
});
