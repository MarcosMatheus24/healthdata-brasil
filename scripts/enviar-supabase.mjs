#!/usr/bin/env node
/**
 * HealthData Brasil — envio dos dados coletados da API para o Supabase (PostgreSQL)
 * ---------------------------------------------------------------------------
 * Lê os snapshots gerados pelo ETL (data/snapshot/**) e grava no banco criado por
 * db/schema.sql. Roda dentro de UMA transação: ou o banco recebe tudo, ou nada muda.
 *
 * Uso:
 *   npm run supabase                      # envia todas as doenças com coleta
 *   npm run supabase -- --agravos=zika    # só algumas
 *   npm run supabase -- --dry-run         # mostra o que seria gravado, sem conectar
 *   npm run etl -- --enviar               # coleta na API e já envia (ver scripts/etl.mjs)
 *
 * Variável de ambiente (arquivo .env.local ou terminal):
 *   DATABASE_URL = Supabase → Project Settings → Database → Connection string → URI
 *
 * Regras:
 *  - Só envia doença com estado "coletado" e UFs preenchidas: falha/pendente NUNCA apaga dado bom.
 *  - Reenviar a mesma doença substitui os indicadores/perfis dela; as linhas de `coleta`
 *    antigas ficam como histórico (a mais recente vale para o app).
 *  - UFs, municípios e população (IBGE) são atualizados com upsert.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SNAP_DIR = process.env.ETL_OUT ? path.resolve(process.env.ETL_OUT) : path.join(ROOT, "data", "snapshot");
const AGR_DIR = path.join(SNAP_DIR, "agravos");
const LOTE = 2000;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Lê .env.local / .env sem depender de pacote (não sobrescreve variáveis já definidas). */
function carregarEnv() {
  for (const nome of [".env.local", ".env"]) {
    const arq = path.join(ROOT, nome);
    if (!fs.existsSync(arq)) continue;
    for (const linha of fs.readFileSync(arq, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m || m[1] in process.env) continue;
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

const ler = (arq) => JSON.parse(fs.readFileSync(path.join(SNAP_DIR, arq), "utf8"));
const lerAgravo = (id) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(AGR_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
};

/* ----------------------------------------------------------------- montagem das linhas */

/** Conjuntos de dados prontos para enviar: um por doença com coleta válida. */
export function conjuntosDoSnapshot(filtro = null) {
  const meta = ler("meta.json");
  const srag = ler("srag.json");
  const todos = [
    {
      agravo: "SRAG",
      coleta: { ...(meta.coletas?.[0] ?? {}), agravo: "srag", origemColeta: "etl" },
      metodologia: meta.metodologia ?? null,
      qualidade: meta.qualidade ?? null,
      camposFonte: meta.camposFonte ?? null,
      registrosLidos: meta.metodologia?.registrosColetados ?? null,
      ufs: srag,
    },
    ...["dengue", "zika", "febreamarela"]
      .map((id) => ({ id, d: lerAgravo(id) }))
      .filter(({ d }) => d?.estado === "coletado" && d.ufs?.length)
      .map(({ d }) => ({
        agravo: d.agravo.toUpperCase(),
        coleta: d.coleta,
        metodologia: d.metodologia ?? null,
        qualidade: d.qualidade ?? null,
        camposFonte: d.camposFonte ?? null,
        registrosLidos: d.registrosLidos ?? null,
        ufs: d.ufs,
      })),
  ];
  return todos.filter((c) => c.ufs?.length && (!filtro || filtro.includes(c.agravo.toLowerCase())));
}

/** Transforma um conjunto nas linhas de indicador / perfil / municipio_amostra (sem repetição). */
export function linhasDoConjunto(conj) {
  const indicadores = new Map();
  const perfis = new Map();
  const municipios = new Map();

  const ind = (ufCodigo, ano, mes, metrica, amostra, estimado) => {
    const chave = `${ufCodigo}|${ano ?? 0}|${mes ?? 0}|${metrica}`;
    indicadores.set(chave, {
      uf: String(ufCodigo),
      ano: ano ?? null,
      mes: mes ?? null,
      metrica,
      amostra: Math.round(Number(amostra) || 0),
      estimado: Math.round(Number(estimado ?? amostra) || 0),
    });
  };

  for (const u of conj.ufs) {
    const uf = u.ufCodigo;
    if (!uf) continue; // UF sem código IBGE não entra (não há como ligar ao território)
    for (const [ano, v] of Object.entries(u.porAno ?? {})) ind(uf, Number(ano), null, "notificacoes", v, u.porAnoEstimado?.[ano]);
    for (const [mes, v] of Object.entries(u.porMes ?? {})) {
      const [ano, mm] = mes.split("-");
      ind(uf, Number(ano), Number(mm), "notificacoes", v, u.porMesEstimado?.[mes]);
    }
    ind(uf, null, null, "obitos", u.obitosAmostra ?? 0, u.obitosEstimado);
    for (const [ano, v] of Object.entries(u.obitosPorAno ?? {})) ind(uf, Number(ano), null, "obitos", v, u.obitosPorAnoEstimado?.[ano]);

    for (const [dim, obj] of Object.entries(u.perfil ?? {})) {
      for (const [cat, n] of Object.entries(obj ?? {})) {
        perfis.set(`${uf}|${dim}|${cat}`, {
          uf: String(uf),
          dimensao: dim,
          categoria: cat,
          contagem: Math.round(Number(n) || 0),
          proporcao: Number((Number(n) / Math.max(1, u.amostra)).toFixed(6)),
        });
      }
    }
    for (const mun of u.municipiosAmostra ?? []) {
      municipios.set(`${uf}|${mun.codigo}`, {
        uf: String(uf),
        codigo: String(mun.codigo),
        nome: mun.nome ?? null,
        amostra: Math.round(Number(mun.amostra) || 0),
        estimado: mun.estimado == null ? null : Math.round(Number(mun.estimado) || 0),
      });
    }
  }
  return { indicadores: [...indicadores.values()], perfis: [...perfis.values()], municipios: [...municipios.values()] };
}

/* ----------------------------------------------------------------- gravação */

const lotes = (lista, n = LOTE) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, (i + 1) * n));

function conexao() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Copie a connection string em Supabase → Project Settings → Database e coloque em .env.local (DATABASE_URL=postgresql://...).",
    );
  }
  return {
    connectionString: url,
    max: 1,
    ssl: process.env.PGSSL === "disable" || /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  };
}

export async function enviarParaBanco({ agravos = null, dryRun = false } = {}) {
  carregarEnv();
  const ufs = ler("ufs.json");
  const populacao = ler("populacao.json");
  let municipios = [];
  try {
    municipios = ler("municipios.json");
  } catch {
    log("municipios.json ausente — tabela municipio não será atualizada");
  }

  const conjuntos = conjuntosDoSnapshot(agravos);
  if (!conjuntos.length) throw new Error("Nenhuma doença com coleta válida nos snapshots — nada a enviar (rode `npm run etl` antes).");

  const pacotes = conjuntos.map((c) => ({ conj: c, linhas: linhasDoConjunto(c) }));

  log(`UFs ${ufs.length} · população ${populacao.length} · municípios ${municipios.length}`);
  for (const { conj, linhas } of pacotes) {
    log(`${conj.agravo}: ${linhas.indicadores.length} indicadores · ${linhas.perfis.length} perfis · ${linhas.municipios.length} municípios amostrados`);
  }
  if (dryRun) {
    log("dry-run: nada foi gravado.");
    return { dryRun: true, agravos: conjuntos.map((c) => c.agravo) };
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client(conexao());
  await client.connect();
  try {
    await client.query("BEGIN");

    // --- território e população (IBGE): upsert
    for (const l of lotes(ufs)) {
      await client.query(
        `INSERT INTO uf (codigo_ibge, sigla, nome, regiao)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) WHERE true
         ON CONFLICT (codigo_ibge) DO UPDATE SET sigla = EXCLUDED.sigla, nome = EXCLUDED.nome, regiao = EXCLUDED.regiao`,
        [l.map((u) => String(u.codigo)), l.map((u) => u.sigla), l.map((u) => u.nome), l.map((u) => u.regiao ?? null)],
      );
    }
    for (const l of lotes(populacao)) {
      await client.query(
        `INSERT INTO populacao (uf_codigo, ano, populacao, fonte)
         SELECT uf_codigo, ano, populacao, 'IBGE 6579/9324' FROM unnest($1::text[], $2::int[], $3::bigint[]) AS t(uf_codigo, ano, populacao) WHERE true
         ON CONFLICT (uf_codigo, ano) DO UPDATE SET populacao = EXCLUDED.populacao, fonte = EXCLUDED.fonte, atualizado_em = NOW()`,
        [l.map((p) => String(p.ufCodigo)), l.map((p) => Number(p.ano)), l.map((p) => Number(p.populacao))],
      );
    }
    for (const l of lotes(municipios)) {
      await client.query(
        `INSERT INTO municipio (codigo_ibge, nome, uf_codigo)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) WHERE true
         ON CONFLICT (codigo_ibge) DO UPDATE SET nome = EXCLUDED.nome, uf_codigo = EXCLUDED.uf_codigo`,
        [l.map((m) => String(m.codigo)), l.map((m) => m.nome), l.map((m) => String(m.ufCodigo))],
      );
    }

    // --- uma doença por vez: nova coleta + substituição dos agregados dela
    for (const { conj, linhas } of pacotes) {
      const c = conj.coleta ?? {};
      const { rows } = await client.query(
        `INSERT INTO coleta (agravo, fonte, recurso, parametros, http_status, iniciado_em, finalizado_em, registros, total_fonte,
                             fracao_amostral, status, paginas, origem_coleta, registros_lidos, metodologia, qualidade, campos_fonte)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb)
         RETURNING id`,
        [
          conj.agravo,
          c.fonte ?? "MS_DADOS_ABERTOS",
          c.recurso ?? "",
          JSON.stringify(c.parametros ?? {}),
          c.httpStatus ?? null,
          c.iniciadoEm ?? new Date().toISOString(),
          c.finalizadoEm ?? null,
          c.registros ?? 0,
          c.totalFonte ?? 0,
          c.fracaoAmostral ?? 0,
          c.status ?? "sucesso",
          JSON.stringify(c.paginas ?? []),
          c.origemColeta ?? "etl",
          conj.registrosLidos,
          JSON.stringify(conj.metodologia),
          JSON.stringify(conj.qualidade),
          JSON.stringify(conj.camposFonte),
        ],
      );
      const coletaId = rows[0].id;

      await client.query("DELETE FROM indicador WHERE agravo = $1", [conj.agravo]);
      await client.query("DELETE FROM perfil WHERE agravo = $1", [conj.agravo]);
      await client.query("DELETE FROM municipio_amostra WHERE agravo = $1", [conj.agravo]);

      for (const l of lotes(linhas.indicadores)) {
        await client.query(
          `INSERT INTO indicador (agravo, uf_codigo, ano, mes, metrica, valor_amostra, valor_estimado, unidade, coleta_id)
           SELECT $1::text, uf, ano, mes, metrica, amostra, estimado, 'registros', $2::int
           FROM unnest($3::text[], $4::int[], $5::int[], $6::text[], $7::int[], $8::int[]) AS t(uf, ano, mes, metrica, amostra, estimado)`,
          [conj.agravo, coletaId, l.map((x) => x.uf), l.map((x) => x.ano), l.map((x) => x.mes), l.map((x) => x.metrica), l.map((x) => x.amostra), l.map((x) => x.estimado)],
        );
      }
      for (const l of lotes(linhas.perfis)) {
        await client.query(
          `INSERT INTO perfil (agravo, uf_codigo, dimensao, categoria, contagem, proporcao, coleta_id)
           SELECT $1::text, uf, dimensao, categoria, contagem, proporcao, $2::int
           FROM unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::numeric[]) AS t(uf, dimensao, categoria, contagem, proporcao)`,
          [conj.agravo, coletaId, l.map((x) => x.uf), l.map((x) => x.dimensao), l.map((x) => x.categoria), l.map((x) => x.contagem), l.map((x) => x.proporcao)],
        );
      }
      for (const l of lotes(linhas.municipios)) {
        await client.query(
          `INSERT INTO municipio_amostra (agravo, uf_codigo, municipio_codigo, municipio_nome, amostra, estimado, coleta_id)
           SELECT $1::text, uf, codigo, nome, amostra, estimado, $2::int
           FROM unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::int[]) AS t(uf, codigo, nome, amostra, estimado)`,
          [conj.agravo, coletaId, l.map((x) => x.uf), l.map((x) => x.codigo), l.map((x) => x.nome), l.map((x) => x.amostra), l.map((x) => x.estimado)],
        );
      }

      await client.query("INSERT INTO auditoria (acao, recurso, status, detalhe) VALUES ($1, $2, $3, $4::jsonb)", [
        "envio_supabase",
        conj.agravo,
        "sucesso",
        JSON.stringify({ coletaId, indicadores: linhas.indicadores.length, perfis: linhas.perfis.length, municipios: linhas.municipios.length }),
      ]);
      log(`${conj.agravo}: gravado (coleta #${coletaId})`);
    }

    await client.query("COMMIT");
    log("Envio concluído.");
    return { dryRun: false, agravos: conjuntos.map((c) => c.agravo) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/* ----------------------------------------------------------------- CLI */

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const m = args.map((a) => a.match(/^--agravos=(.+)$/)).find(Boolean);
  const agravos = m ? m[1].split(",").map((s) => s.trim().toLowerCase().replace("febre-amarela", "febreamarela")) : null;
  enviarParaBanco({ agravos, dryRun: args.includes("--dry-run") }).then(
    () => process.exit(0),
    (err) => {
      console.error("FALHA no envio:", err.message ?? err);
      process.exit(1);
    },
  );
}
