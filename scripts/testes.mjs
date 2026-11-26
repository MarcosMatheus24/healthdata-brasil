#!/usr/bin/env node
/**
 * Testes de fumaça da API própria.
 *
 * Uso:
 *   node scripts/testes.mjs                        # testa http://localhost:3000
 *   BASE=https://healthdata-brasil.vercel.app node scripts/testes.mjs
 *
 * Verifica contrato, estados de erro e proveniência — sem alterar dados.
 */

const BASE = process.env.BASE ?? "http://localhost:3000";
let passou = 0;
let falhou = 0;

function ok(nome, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ok   ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

async function json(caminho, init) {
  const r = await fetch(`${BASE}${caminho}`, init);
  let corpo = null;
  try {
    corpo = await r.json();
  } catch {
    corpo = null;
  }
  return { status: r.status, corpo };
}

console.log(`\nHealthData Brasil — testes de fumaça em ${BASE}\n`);

// 1. saúde
{
  const { status, corpo } = await json("/api/saude");
  ok("GET /api/saude responde 200", status === 200, `status ${status}`);
  ok("saúde informa a origem dos dados", ["snapshot", "postgres"].includes(corpo?.origemDados), String(corpo?.origemDados));
  ok("saúde informa 27 UFs", corpo?.ufs === 27, String(corpo?.ufs));
}

// 2. status das fontes
{
  const { status, corpo } = await json("/api/fontes/status");
  ok("GET /api/fontes/status responde 200", status === 200, `status ${status}`);
  ok("lista três fontes", Array.isArray(corpo?.fontes) && corpo.fontes.length === 3, String(corpo?.fontes?.length));
  const eSUS = corpo?.fontes?.find((f) => f.id === "ESUS_NOTIFICA");
  ok("e-SUS aparece como restrito", eSUS?.estado === "requer_autorizacao", eSUS?.estado);
  ok("nenhuma credencial é exposta", !JSON.stringify(corpo).match(/token|secret|password/i));
}

// 3. indicadores
{
  const { status, corpo } = await json("/api/indicadores?ano=2025");
  ok("GET /api/indicadores responde 200", status === 200, `status ${status}`);
  ok("traz linhas por UF", Array.isArray(corpo?.linhas) && corpo.linhas.length > 0, String(corpo?.linhas?.length));
  ok("declara proveniência", Boolean(corpo?.proveniencia?.fonte), JSON.stringify(corpo?.proveniencia ?? {}).slice(0, 60));
  const linha = corpo?.linhas?.[0];
  ok("linha tem taxa ou supressão", linha && ("taxaPor100Mil" in linha), "campo ausente");
  ok("fração amostral declarada", typeof corpo?.proveniencia?.fracaoAmostral === "number", String(corpo?.proveniencia?.fracaoAmostral));
}

// 4. territórios
{
  const { status, corpo } = await json("/api/territorios?uf=SP");
  ok("GET /api/territorios responde 200", status === 200, `status ${status}`);
  const sp = corpo?.ufs?.[0];
  ok("valida código IBGE de SP", sp?.codigo === "35", String(sp?.codigo));
  const invalido = await json("/api/territorios?uf=ZZ");
  ok("UF inexistente retorna 404 com erro tratado", invalido.status === 404 && Boolean(invalido.corpo?.erro), `status ${invalido.status}`);
}

// 5. validação de integração (allowlist)
{
  const valido = await json("/api/integracoes/validar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recurso: "esus_notifica" }),
  });
  ok("e-SUS não é consultado sem autorização", valido.corpo?.estado === "nao_autorizado", valido.corpo?.estado);
  ok("nenhum segredo é enviado", valido.corpo?.segredosEnviados === false, String(valido.corpo?.segredosEnviados));

  const bloqueado = await json("/api/integracoes/validar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recurso: "http://169.254.169.254/latest/meta-data" }),
  });
  ok("URL fora da allowlist é recusada", bloqueado.status === 400, `status ${bloqueado.status}`);
}

// 6. exportação CSV
{
  const r = await fetch(`${BASE}/api/export?ano=2025&uf=BR`);
  const texto = await r.text();
  ok("GET /api/export responde 200", r.status === 200, `status ${r.status}`);
  ok("CSV declara a fonte no cabeçalho", texto.includes("Fonte:") && texto.includes("IBGE"));
  ok("CSV informa a fração amostral", texto.includes("Fracao amostral"));
  ok("CSV tem linhas de UF", texto.trim().split("\n").length >= 28, String(texto.trim().split("\n").length));
}

console.log(`\n${passou} verificações ok, ${falhou} falha(s)\n`);
process.exit(falhou === 0 ? 0 : 1);
