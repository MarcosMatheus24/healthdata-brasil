/**
 * HealthData Brasil — núcleo de coleta (sem dependências de Node).
 * ---------------------------------------------------------------------------
 * Este arquivo roda em dois lugares, com o MESMO código:
 *   1. no ETL (scripts/etl.mjs), via `node`;
 *   2. colado num navegador aberto em apidadosabertos.saude.gov.br, quando a
 *      máquina que roda o ETL não alcança a API (rede corporativa, sandbox).
 *      Veja scripts/coleta-navegador.md.
 *
 * Por isso: nada de `fs`, `path` ou `process` aqui. Só `fetch` e JavaScript puro.
 *
 * Desenho amostral
 *  - A API pagina por ÍNDICE DE PÁGINA (`offset` = número da página).
 *  - Nem toda rota informa `total_registros` (Dengue e Zika não informam).
 *    Nesses casos o universo é medido por busca binária com `limit=1`: com uma
 *    página de 1 registro, `offset` vira o índice do registro, e o primeiro
 *    índice vazio é o total. São ~25 requisições leves.
 *  - Cada ESTRATO (um ano, ou um intervalo de registros) é coletado inteiro
 *    (censo) quando cabe em `censoAte` páginas; senão, por amostragem
 *    sistemática de páginas. Peso do registro = universo do estrato ÷ coletados.
 *  - Evite `campos=`: em várias rotas ele faz o servidor estourar o tempo (502).
 */

/* =============================================================== utilidades */

/** A API usa "nan" (texto) para vazio em várias rotas do SINAN. */
export const vazio = (v) =>
  v === null || v === undefined || (typeof v === "string" && ["", "nan", "NaN", "null", "None"].includes(v.trim()));

export const num = (v) => {
  if (vazio(v)) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function minusculas(r) {
  const o = {};
  for (const [k, v] of Object.entries(r ?? {})) o[k.toLowerCase()] = v;
  return o;
}

/** Primeiro campo preenchido entre os nomes candidatos. */
export function pick(r, nomes) {
  for (const n of nomes) {
    const v = r[n.toLowerCase()];
    if (!vazio(v)) return v;
  }
  return null;
}

/** Aceita AAAA-MM-DD(...), DD/MM/AAAA e AAAAMMDD. Devolve AAAA-MM-DD ou null. */
export function parseData(v) {
  if (vazio(v)) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export function faixa(anos) {
  if (anos === null || !Number.isFinite(anos) || anos < 0 || anos > 130) return "Não informado";
  if (anos < 1) return "< 1 ano";
  if (anos < 5) return "1-4 anos";
  if (anos < 12) return "5-11 anos";
  if (anos < 18) return "12-17 anos";
  if (anos < 30) return "18-29 anos";
  if (anos < 60) return "30-59 anos";
  return "60+ anos";
}

/** SIVEP-Gripe: nu_idade_n + tp_idade (1 dias, 2 meses, 3 anos). */
export function faixaSivep(idade, tipo) {
  let anos = num(idade);
  if (anos === null) return "Não informado";
  if (String(tipo) === "1") anos = anos / 365;
  else if (String(tipo) === "2") anos = anos / 12;
  return faixa(anos);
}

/** SINAN: NU_IDADE_N codificado (1xxx horas, 2xxx dias, 3xxx meses, 4xxx anos). */
export function faixaSinan(idade) {
  const n = num(idade);
  if (n === null) return "Não informado";
  if (n >= 4000) return faixa(n - 4000);
  if (n >= 3000) return faixa((n - 3000) / 12);
  if (n >= 2000) return faixa((n - 2000) / 365);
  if (n >= 1000) return faixa(0);
  return faixa(n);
}

export function sexo(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "M" || s === "1" || s.startsWith("MASC")) return "Masculino";
  if (s === "F" || s === "2" || s.startsWith("FEM")) return "Feminino";
  return "Ignorado";
}

export const UF_CODIGO = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
  31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS",
  50: "MS", 51: "MT", 52: "GO", 53: "DF",
};
const SIGLAS = new Set(Object.values(UF_CODIGO));

/** Sigla ("BA"), código IBGE da UF ("29") ou de município ("292740"/"2927408") → sigla. Nunca por nome. */
export function resolverUf(v) {
  if (vazio(v)) return null;
  const s = String(v).trim().toUpperCase();
  if (SIGLAS.has(s)) return s;
  const d = s.replace(/\D/g, "");
  return d.length >= 2 ? UF_CODIGO[Number(d.slice(0, 2))] ?? null : null;
}

export function rotulo(dic, v, rotuloVazio) {
  if (vazio(v)) return rotuloVazio;
  const s = String(v).trim();
  const n = String(Number(s));
  if (dic[s]) return dic[s];
  if (dic[n]) return dic[n];
  if (/^\d+$/.test(s)) return `Código ${s}`;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* =============================================================== dicionários */

const SIM_NAO = { 1: "Sim", 2: "Não", 9: "Ignorado" };

const SRAG_CLASSI = {
  1: "SRAG por Influenza",
  2: "SRAG por outro vírus respiratório",
  3: "SRAG por outro agente etiológico",
  4: "SRAG não especificado",
  5: "SRAG por COVID-19",
};
const SRAG_EVOLUCAO = { 1: "Cura", 2: "Óbito por SRAG", 3: "Óbito por outras causas", 9: "Ignorado" };

const DENGUE_CLASSI = {
  5: "Descartado",
  8: "Inconclusivo",
  10: "Dengue",
  11: "Dengue com sinais de alarme",
  12: "Dengue grave",
  13: "Chikungunya",
};
const ZIKA_CLASSI = { 0: "Sem classificação final", 1: "Confirmado", 2: "Descartado", 8: "Inconclusivo" };
const SINAN_EVOLUCAO = {
  0: "Ignorado",
  1: "Cura",
  2: "Óbito pelo agravo",
  3: "Óbito por outras causas",
  4: "Óbito em investigação",
  9: "Ignorado",
};

/* =============================================================== normalizadores
 * Cada um devolve { uf, data, conta, obito, uti, internado, municipio, perfil }.
 * `conta` aplica a definição de caso do agravo (lib/agravos.ts).
 */

export function normalizarSrag(bruto) {
  const r = minusculas(bruto);
  const classi = String(pick(r, ["classi_fin"]) ?? "");
  const evol = String(pick(r, ["evolucao"]) ?? "");
  return {
    uf: resolverUf(pick(r, ["sg_uf_not", "sg_uf", "co_mun_not"])),
    data: parseData(pick(r, ["dt_sin_pri"])) ?? parseData(pick(r, ["dt_notific"])),
    dataNot: parseData(pick(r, ["dt_notific"])),
    dataSin: parseData(pick(r, ["dt_sin_pri"])),
    conta: true,
    obito: evol === "2",
    uti: String(pick(r, ["uti"])) === "1",
    internado: String(pick(r, ["hospital"])) === "1",
    municipio: pick(r, ["co_mun_res", "co_mun_not"]),
    perfil: {
      classificacao: SRAG_CLASSI[classi] ?? "Não informado",
      evolucao: SRAG_EVOLUCAO[evol] ?? "Ignorado",
      uti: SIM_NAO[String(pick(r, ["uti"]))] ?? "Ignorado",
      hospitalizacao: SIM_NAO[String(pick(r, ["hospital"]))] ?? "Ignorado",
      vacinaGripe: SIM_NAO[String(pick(r, ["vacina"]))] ?? "Ignorado",
      sexo: sexo(pick(r, ["cs_sexo"])),
      faixaEtaria: faixaSivep(pick(r, ["nu_idade_n"]), pick(r, ["tp_idade"])),
    },
  };
}

/** SINAN (Dengue e Zika têm a mesma ficha-base). */
function normalizarSinan(bruto, { descartado, classi: dicClassi }) {
  const r = minusculas(bruto);
  const classi = pick(r, ["classi_fin"]);
  const evol = pick(r, ["evolucao"]);
  const hosp = pick(r, ["hospitaliz"]);
  return {
    uf: resolverUf(pick(r, ["sg_uf", "id_mn_resi", "sg_uf_not", "id_municip"])),
    data: parseData(pick(r, ["dt_sin_pri"])) ?? parseData(pick(r, ["dt_notific"])),
    conta: String(num(classi)) !== String(descartado),
    obito: String(num(evol)) === "2",
    uti: false,
    internado: String(num(hosp)) === "1",
    municipio: pick(r, ["id_mn_resi", "id_municip"]),
    perfil: {
      classificacao: rotulo(dicClassi, classi, "Em investigação"),
      evolucao: rotulo(SINAN_EVOLUCAO, evol, "Ignorado"),
      uti: null,
      hospitalizacao: vazio(hosp) ? null : SIM_NAO[String(num(hosp))] ?? "Ignorado",
      vacinaGripe: null,
      sexo: sexo(pick(r, ["cs_sexo"])),
      faixaEtaria: faixaSinan(pick(r, ["nu_idade_n"])),
    },
  };
}

/** Dengue: caso provável = toda notificação exceto descartada (classi_fin 5). */
export const normalizarDengue = (r) => normalizarSinan(r, { descartado: 5, classi: DENGUE_CLASSI });

/** Zika: caso provável = toda notificação exceto descartada (classi_fin 2). */
export const normalizarZika = (r) => normalizarSinan(r, { descartado: 2, classi: ZIKA_CLASSI });

/**
 * Febre amarela em humanos: o conjunto traz casos confirmados.
 * Território = local provável de infecção (uf_lpi / cod_mun_lpi).
 */
export function normalizarFebreAmarela(bruto) {
  const r = minusculas(bruto);
  const obitoTxt = String(pick(r, ["obito"]) ?? "").trim().toUpperCase();
  const ano = num(pick(r, ["ano_is"]));
  const mes = num(pick(r, ["mes_is"]));
  const dataIs =
    parseData(pick(r, ["dt_is"])) ??
    (ano && mes ? `${ano}-${String(mes).padStart(2, "0")}-01` : ano ? `${ano}-01-01` : null);
  const obito = obitoTxt === "SIM" || obitoTxt === "1" || obitoTxt === "S";
  return {
    uf: resolverUf(pick(r, ["uf_lpi", "cod_uf_lpi", "cod_mun_lpi"])),
    data: dataIs,
    conta: true,
    obito,
    uti: false,
    internado: false,
    municipio: pick(r, ["cod_mun_lpi"]),
    perfil: {
      classificacao: "Caso confirmado",
      evolucao: obito ? "Óbito" : vazio(obitoTxt) ? "Ignorado" : "Não óbito",
      uti: null,
      hospitalizacao: null,
      vacinaGripe: null,
      sexo: sexo(pick(r, ["sexo"])),
      faixaEtaria: faixa(num(pick(r, ["idade"]))),
    },
  };
}

export const NORMALIZADORES = {
  srag: normalizarSrag,
  dengue: normalizarDengue,
  zika: normalizarZika,
  febreamarela: normalizarFebreAmarela,
};

/* =============================================================== contagem compacta
 * Guarda só contagens (por UF × ano × mês, óbitos por ano, perfis e municípios).
 * O formato compacto é pequeno o bastante para sair do navegador e é expandido
 * no formato do snapshot por `expandir()`.
 */

const DIMENSOES = ["classificacao", "evolucao", "uti", "hospitalizacao", "vacinaGripe", "sexo", "faixaEtaria"];

export class Contagem {
  constructor({ anoMinimo = 2019 } = {}) {
    this.anoMinimo = anoMinimo;
    this.ufs = {};
    this.q = { lidos: 0, contados: 0, semUf: 0, semData: 0, foraDoPeriodo: 0, min: null, max: null };
  }

  uf(sigla) {
    return (this.ufs[sigla] ??= { m: {}, me: {}, o: {}, oe: {}, p: {}, mun: {}, uti: 0, int: 0 });
  }

  /** @param n registro normalizado  @param peso universo do estrato ÷ coletados */
  add(n, peso = 1) {
    this.q.lidos++;
    if (!n.uf) {
      this.q.semUf++;
      return;
    }
    const u = this.uf(n.uf);
    if (n.perfil.classificacao) (u.p.classificacao ??= {})[n.perfil.classificacao] = (u.p.classificacao[n.perfil.classificacao] ?? 0) + 1;
    if (!n.conta) return;
    if (!n.data) {
      this.q.semData++;
      return;
    }
    const ano = Number(n.data.slice(0, 4));
    if (ano < this.anoMinimo) {
      this.q.foraDoPeriodo++;
      return;
    }
    const mes = Number(n.data.slice(5, 7)) - 1;
    this.q.contados++;
    (u.m[ano] ??= Array(12).fill(0))[mes]++;
    (u.me[ano] ??= Array(12).fill(0))[mes] += peso;
    if (n.obito) {
      u.o[ano] = (u.o[ano] ?? 0) + 1;
      u.oe[ano] = (u.oe[ano] ?? 0) + peso;
    }
    if (n.uti) u.uti++;
    if (n.internado) u.int++;
    for (const d of DIMENSOES) {
      if (d === "classificacao") continue;
      const c = n.perfil[d];
      if (c) (u.p[d] ??= {})[c] = (u.p[d][c] ?? 0) + 1;
    }
    if (!vazio(n.municipio)) {
      const cod = String(n.municipio).replace(/\D/g, "").slice(0, 6);
      if (cod.length === 6) u.mun[cod] = (u.mun[cod] ?? 0) + 1;
    }
    if (!this.q.min || n.data < this.q.min) this.q.min = n.data;
    if (!this.q.max || n.data > this.q.max) this.q.max = n.data;
  }

  /**
   * Formato compacto: estimativas arredondadas e só os 10 municípios principais por UF.
   * Com `pesoUnico` (todos os registros com o mesmo peso), as estimativas não são
   * enviadas: `expandir()` recalcula como contagem × peso.
   */
  compactar({ pesoUnico = null } = {}) {
    const ufs = {};
    for (const [sigla, u] of Object.entries(this.ufs)) {
      const arred = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => Math.round(x)) : Math.round(v)]));
      const igual = pesoUnico !== null || (JSON.stringify(arred(u.me)) === JSON.stringify(u.m) && JSON.stringify(arred(u.oe)) === JSON.stringify(u.o));
      ufs[sigla] = {
        m: u.m,
        ...(igual ? {} : { me: arred(u.me), oe: arred(u.oe) }),
        o: u.o,
        p: u.p,
        mun: Object.entries(u.mun).sort((a, b) => b[1] - a[1]).slice(0, 10),
        uti: u.uti,
        int: u.int,
      };
    }
    return { q: { ...this.q, ...(pesoUnico !== null ? { pesoUnico } : {}) }, ufs };
  }
}

/** Soma de verificação: o mesmo número calculado no navegador e depois da transferência. */
export function somaVerificacao(compacto) {
  let s = 0;
  let i = 1;
  const visitar = (v) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") for (const k of Object.keys(v).sort()) { visitar(k); visitar(v[k]); }
    else if (typeof v === "number") s = (s + v * (i++ % 97)) % 1000000007;
    else if (typeof v === "string") for (const c of v) s = (s + c.charCodeAt(0) * (i++ % 89)) % 1000000007;
  };
  visitar(compacto.ufs);
  return s;
}

/**
 * Compacto → AgravoUF[] (formato de data/snapshot). `ufsInfo` vem de ufs.json e
 * `municipios` de municipios.json (para trocar código de 6 dígitos pelo de 7 e pôr o nome).
 */
export function expandir(compacto, { ufsInfo, municipios = [], fracao }) {
  const porSigla = new Map(ufsInfo.map((u) => [u.sigla, u]));
  const mun6 = new Map(municipios.map((m) => [String(m.codigo).slice(0, 6), m]));
  const soma = (o) => Object.values(o).reduce((s, v) => s + (Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : v), 0);

  const w = compacto.q?.pesoUnico ?? null;
  const vezes = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => Math.round(x * w)) : Math.round(v * w)]));

  return Object.entries(compacto.ufs)
    .map(([sigla, u]) => {
      const info = porSigla.get(sigla);
      const me = u.me ?? (w !== null ? vezes(u.m) : u.m);
      const oe = u.oe ?? (w !== null ? vezes(u.o) : u.o);
      const porAno = {};
      const porAnoEstimado = {};
      const porMes = {};
      const porMesEstimado = {};
      for (const ano of Object.keys(u.m).sort()) {
        porAno[ano] = u.m[ano].reduce((a, b) => a + b, 0);
        porAnoEstimado[ano] = me[ano].reduce((a, b) => a + b, 0);
        u.m[ano].forEach((v, i) => {
          if (!v) return;
          const k = `${ano}-${String(i + 1).padStart(2, "0")}`;
          porMes[k] = v;
          porMesEstimado[k] = me[ano][i];
        });
      }
      const amostra = soma(u.m);
      const estimado = soma(me);
      const perfil = Object.fromEntries(DIMENSOES.map((d) => [d, u.p[d] ?? {}]));
      return {
        ufSigla: sigla,
        ufCodigo: info?.codigo ?? null,
        ufNome: info?.nome ?? sigla,
        regiao: info?.regiao ?? null,
        amostra,
        estimado,
        fracaoAmostral: Number((fracao ?? (estimado > 0 ? amostra / estimado : 1)).toFixed(6)),
        obitosAmostra: soma(u.o),
        obitosEstimado: soma(oe),
        utiAmostra: u.uti ?? 0,
        internadosAmostra: u.int ?? 0,
        porAno,
        porAnoEstimado,
        porMes,
        porMesEstimado,
        obitosPorAno: u.o,
        obitosPorAnoEstimado: oe,
        perfil,
        municipiosAmostra: (u.mun ?? []).map(([cod6, qtd]) => {
          const m = mun6.get(cod6);
          const peso = amostra > 0 ? estimado / amostra : 1;
          return { codigo: m?.codigo ?? cod6, nome: m?.nome ?? null, amostra: qtd, estimado: Math.round(qtd * peso) };
        }),
      };
    })
    .filter((u) => u.amostra > 0)
    .sort((a, b) => b.amostra - a.amostra);
}

/** Perfil nacional somando as UFs (formato meta.perfilGlobal). */
export function perfilGlobal(ufs) {
  const g = Object.fromEntries(DIMENSOES.map((d) => [d, {}]));
  for (const u of ufs) for (const d of DIMENSOES) for (const [c, n] of Object.entries(u.perfil[d] ?? {})) g[d][c] = (g[d][c] ?? 0) + n;
  return g;
}

/* =============================================================== coleta */

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function obterJson(url, { tentativas = 3, timeoutMs = 120000 } = {}) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      clearTimeout(t);
      return j;
    } catch (e) {
      clearTimeout(t);
      ultimo = e;
      if (i < tentativas - 1) await espera(1500 * (i + 1));
    }
  }
  throw ultimo;
}

export const registrosDe = (j) => (Array.isArray(j) ? j : Object.values(j ?? {}).find(Array.isArray) ?? []);

export function paginasSistematicas(primeira, ultima, n) {
  const total = ultima - primeira + 1;
  const k = Math.min(n, total);
  if (k <= 0) return [];
  if (k === total) return Array.from({ length: total }, (_, i) => primeira + i);
  const passo = (total - 1) / Math.max(1, k - 1);
  return [...new Set(Array.from({ length: k }, (_, i) => primeira + Math.round(i * passo)))];
}

/**
 * O significado de `offset` MUDOU na API do MS: a documentação diz "número da
 * página" (e era assim quando o SRAG deste projeto foi coletado), mas hoje a
 * rota trata `offset` como índice do REGISTRO inicial — `offset=1` repete 999 de
 * 1000 registros de `offset=0`. Usar o modo errado gera páginas sobrepostas e
 * contagens duplicadas. Por isso o modo é detectado a cada coleta:
 * se o 1º registro de `offset=1` (limit=2) é o 2º de `offset=0`, o modo é "registro".
 */
export async function detectarModoOffset(base, rota, qs = "") {
  const a = registrosDe(await obterJson(url(base, rota, qs, "limit=2&offset=0")));
  const b = registrosDe(await obterJson(url(base, rota, qs, "limit=2&offset=1")));
  if (a.length < 2 || !b.length) return "registro";
  return JSON.stringify(b[0]) === JSON.stringify(a[1]) ? "registro" : "pagina";
}

/** Monta a URL com filtros do estrato. */
const url = (base, rota, qs, extra) => `${base}${rota}?${[qs, extra].filter(Boolean).join("&")}`;

/**
 * Universo do estrato: usa `total_registros` quando a rota informa; senão,
 * busca binária com `limit=1` (com 1 registro por página, offset = índice do
 * registro nos dois modos).
 */
export async function medirUniverso(base, rota, qs = "") {
  const sonda = await obterJson(url(base, rota, qs, "limit=1"));
  const declarado = Number(sonda?.total_registros ?? NaN);
  if (Number.isFinite(declarado) && declarado >= 0) return { total: declarado, metodo: "total_registros" };
  const existe = async (i) => registrosDe(await obterJson(url(base, rota, qs, `limit=1&offset=${i}`))).length > 0;
  if (!registrosDe(sonda).length) return { total: 0, metodo: "busca binária" };
  let lo = 0;
  let hi = 1;
  while (await existe(hi)) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const meio = Math.floor((lo + hi) / 2);
    if (await existe(meio)) lo = meio;
    else hi = meio;
  }
  return { total: hi, metodo: "busca binária" };
}

/** Primeiro índice cujo registro tem ano ≥ `ano` (rota ordenada por nu_ano). */
export async function inicioDoAno(base, rota, total, ano, campoAno = "nu_ano") {
  const anoEm = async (i) => num(registrosDe(await obterJson(url(base, rota, "", `limit=1&offset=${i}&campos=${campoAno}`)))[0]?.[campoAno]);
  let lo = 0;
  let hi = total - 1;
  if ((await anoEm(hi)) < ano) return total;
  while (lo < hi) {
    const meio = Math.floor((lo + hi) / 2);
    if ((await anoEm(meio)) >= ano) hi = meio;
    else lo = meio + 1;
  }
  return lo;
}

/**
 * Coleta um estrato. `inicio`/`fim` (índices de registro) restringem a um
 * intervalo; sem eles, o estrato é a rota inteira com o filtro `qs`.
 * Devolve os registros já normalizados e o peso de cada um.
 */
export async function coletarEstrato({
  base,
  rota,
  qs = "",
  campos = null,
  limit = 1000,
  amostraPaginas = 80,
  censoAte = 60,
  inicio = null,
  fim = null,
  total = null,
  modoOffset = null,
  normalizar,
  concorrencia = 4,
  log = () => {},
}) {
  const universo = total ?? (await medirUniverso(base, rota, qs)).total;
  const modo = modoOffset ?? (await detectarModoOffset(base, rota, qs));
  const ini = inicio ?? 0;
  const fimReg = fim ?? universo;
  const tamanho = Math.max(0, fimReg - ini);
  if (!tamanho) return { universo: 0, coletados: 0, paginas: [], erros: 0, registros: [], peso: 1, censo: true };

  const primeira = Math.floor(ini / limit);
  const ultima = Math.ceil(fimReg / limit) - 1;
  const totalPaginas = ultima - primeira + 1;
  const censo = totalPaginas <= censoAte;
  const paginas = censo ? paginasSistematicas(primeira, ultima, totalPaginas) : paginasSistematicas(primeira, ultima, amostraPaginas);
  log(`  ${qs || `[${ini}, ${fimReg})`}: universo ${tamanho} · ${censo ? "censo" : "amostra"} de ${paginas.length}/${totalPaginas} páginas · offset por ${modo}`);

  const normalizados = [];
  let coletados = 0;
  let erros = 0;
  let idx = 0;
  const extra = `limit=${limit}${campos ? `&campos=${campos}` : ""}`;
  await Promise.all(
    Array.from({ length: Math.min(concorrencia, paginas.length) }, async () => {
      while (idx < paginas.length) {
        const p = paginas[idx++];
        try {
          const offset = modo === "registro" ? p * limit : p;
          const linhas = registrosDe(await obterJson(url(base, rota, qs, `${extra}&offset=${offset}`)));
          // páginas de borda do intervalo: descarta o que está fora de [ini, fim)
          linhas.forEach((linha, k) => {
            const i = p * limit + k;
            if (i < ini || i >= fimReg) return;
            coletados++;
            normalizados.push(normalizar(linha));
          });
        } catch {
          erros++;
        }
      }
    }),
  );
  const peso = coletados > 0 ? tamanho / coletados : 1;
  return { universo: tamanho, coletados, paginas, totalPaginas, erros, registros: normalizados, peso, censo, modoOffset: modo };
}
