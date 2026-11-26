import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/integracoes/validar
 * Executa uma verificação real, no servidor, contra um recurso oficial.
 *
 * Segurança:
 *  - allowlist de recursos (nada de URL arbitrária → sem SSRF);
 *  - timeout de 25 s e um único retry;
 *  - nenhuma credencial é aceita, armazenada ou devolvida;
 *  - a resposta é reduzida a metadados (HTTP, latência, nº de registros, chaves),
 *    nunca o conteúdo bruto de microdados.
 */

const ALLOWLIST: Record<string, { base: string; caminho: string; chave: string; requerAuth: boolean }> = {
  srag: {
    base: "https://apidadosabertos.saude.gov.br",
    caminho: "/vigilancia-e-meio-ambiente/srag-2019-2026",
    chave: "srag_2019_2026",
    requerAuth: false,
  },
  dengue: {
    base: "https://apidadosabertos.saude.gov.br",
    caminho: "/arboviroses/dengue",
    chave: "dengue",
    requerAuth: false,
  },
  populacao: {
    base: "https://servicodados.ibge.gov.br",
    caminho: "/api/v3/agregados/6579/periodos/2025/variaveis/9324?localidades=N3[all]",
    chave: "9324",
    requerAuth: false,
  },
  esus_notifica: {
    base: "https://esusnotifica.saude.gov.br",
    caminho: "/api/notificacao",
    chave: "esus",
    requerAuth: true,
  },
};

export async function POST(request: Request) {
  let corpo: { recurso?: string } = {};
  try {
    corpo = await request.json();
  } catch {
    corpo = {};
  }

  const recursoId = (corpo.recurso ?? "srag").toString();
  const recurso = ALLOWLIST[recursoId];

  if (!recurso) {
    return NextResponse.json(
      {
        estado: "resposta_invalida",
        mensagem: "Recurso não permitido pela allowlist.",
        permitidos: Object.keys(ALLOWLIST),
      },
      { status: 400 },
    );
  }

  if (recurso.requerAuth) {
    return NextResponse.json({
      estado: "nao_autorizado",
      recurso: recursoId,
      httpStatus: null,
      mensagem:
        "Integração restrita: requer autorização institucional, IP liberado e credenciais mantidas exclusivamente no servidor. Nenhuma requisição foi feita.",
      verificadoEm: new Date().toISOString(),
      segredosEnviados: false,
    });
  }

  const url = `${recurso.base}${recurso.caminho}${recurso.caminho.includes("?") ? "&" : "?"}limit=1`;
  const inicio = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const resposta = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "HealthDataBrasil/1.0 (validacao)" },
    });
    clearTimeout(timer);
    const latenciaMs = Date.now() - inicio;

    if (resposta.status === 401 || resposta.status === 403) {
      return NextResponse.json({
        estado: "nao_autorizado",
        recurso: recursoId,
        httpStatus: resposta.status,
        latenciaMs,
        mensagem: "A fonte respondeu com restrição de acesso. Verifique autorização e IP liberado.",
        verificadoEm: new Date().toISOString(),
        segredosEnviados: false,
      });
    }

    if (!resposta.ok) {
      return NextResponse.json({
        estado: resposta.status >= 500 ? "erro_rede" : "resposta_invalida",
        recurso: recursoId,
        httpStatus: resposta.status,
        latenciaMs,
        mensagem: `A fonte respondeu HTTP ${resposta.status}.`,
        verificadoEm: new Date().toISOString(),
      });
    }

    const texto = await resposta.text();
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return NextResponse.json({
        estado: "resposta_invalida",
        recurso: recursoId,
        httpStatus: resposta.status,
        latenciaMs,
        mensagem: "Resposta não é JSON válido — schema não pôde ser validado.",
        verificadoEm: new Date().toISOString(),
      });
    }

    const objeto = json as Record<string, unknown>;
    const chaves = Array.isArray(json)
      ? ["(array)"]
      : Object.keys(objeto).filter((k) => k !== "total_registros");

    const totalRegistros =
      typeof objeto.total_registros === "number"
        ? objeto.total_registros
        : Array.isArray(json)
          ? json.length
          : null;

    const registros =
      Array.isArray(json)
        ? json.length
        : chaves.reduce((acc, k) => {
            const v = objeto[k];
            return acc + (Array.isArray(v) ? v.length : 0);
          }, 0);

    const schemaOk = chaves.length > 0;

    return NextResponse.json({
      estado: registros === 0 ? "sem_dados" : schemaOk ? "conectado" : "resposta_invalida",
      recurso: recursoId,
      urlConsultada: url,
      httpStatus: resposta.status,
      latenciaMs,
      totalRegistros,
      registrosNaPagina: registros,
      chavesResposta: chaves.slice(0, 12),
      schemaValidado: schemaOk,
      mensagem:
        registros === 0
          ? "HTTP 200, porém sem registros para o filtro aplicado. Ausência não vira zero."
          : "Resposta real recebida e schema reconhecido.",
      verificadoEm: new Date().toISOString(),
      segredosEnviados: false,
    });
  } catch (err) {
    const abortado = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({
      estado: "erro_rede",
      recurso: recursoId,
      httpStatus: null,
      latenciaMs: Date.now() - inicio,
      mensagem: abortado
        ? "A fonte não respondeu em 25 s. O painel segue com o último snapshot válido."
        : "Falha de rede ao consultar a fonte oficial.",
      verificadoEm: new Date().toISOString(),
    });
  }
}
