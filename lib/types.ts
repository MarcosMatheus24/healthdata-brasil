export type UF = {
  codigo: string;
  sigla: string;
  nome: string;
  regiao: string | null;
  regiaoSigla: string | null;
};

export type PopulacaoUF = {
  ufCodigo: string;
  ano: number;
  populacao: number;
};

export type PerfilUF = {
  classificacao: Record<string, number>;
  evolucao: Record<string, number>;
  uti: Record<string, number>;
  hospitalizacao: Record<string, number>;
  vacinaGripe: Record<string, number>;
  sexo: Record<string, number>;
  faixaEtaria: Record<string, number>;
};

export type MunicipioAmostra = {
  codigo: string;
  nome: string | null;
  amostra: number;
  estimado: number;
};

export type SragUF = {
  ufSigla: string;
  ufCodigo: string | null;
  ufNome: string;
  regiao: string | null;
  amostra: number;
  estimado: number;
  fracaoAmostral: number;
  obitosAmostra: number;
  obitosEstimado: number;
  utiAmostra: number;
  internadosAmostra: number;
  porAno: Record<string, number>;
  porAnoEstimado: Record<string, number>;
  porMes: Record<string, number>;
  porMesEstimado: Record<string, number>;
  perfil: PerfilUF;
  municipiosAmostra: MunicipioAmostra[];
};

export type Coleta = {
  fonte: string;
  recurso: string;
  parametros: Record<string, unknown>;
  iniciadoEm: string;
  finalizadoEm: string;
  httpStatus: number | null;
  paginas: { page: number; httpStatus: number | null; ms: number | null; registros: number; erro?: string | null }[];
  registros: number;
  totalFonte: number;
  fracaoAmostral: number;
  status: string;
};

export type FonteInfo = {
  id: string;
  nome: string;
  orgao: string;
  urlBase: string;
  recurso?: string;
  documentacao: string;
  licenca: string;
  requerAutenticacao: boolean;
  atualizacao: string;
  granularidade?: string;
};

export type Meta = {
  geradoEm: string;
  duracaoSegundos: number;
  versaoSchema: string;
  agravo: string;
  metodologia: {
    tipo: string;
    limitePorPagina: number;
    paginasSolicitadas: number;
    paginasTotais: number;
    passo: number;
    registrosColetados: number;
    universoFonte: number;
    fracaoAmostral: number;
    periodoObservado: { min: string | null; max: string | null };
    estimativa: string;
    referenciaTemporal?: string;
  };
  qualidade: {
    inconsistenciasData: number;
    inconsistenciasDataPct: number;
    descricao: string;
    divergenciaDias?: {
      normal: number;
      ate7: number;
      ate30: number;
      ate180: number;
      ate400: number;
      acima400: number;
      amostra: number;
    };
  };
  fontes: FonteInfo[];
  coletas: Coleta[];
  totais: {
    ufsComDados: number;
    registrosAmostrados: number;
    universoFonte: number;
    fracaoAmostralGlobal: number;
  };
  perfilGlobal: PerfilUF;
};

export type Municipio = {
  codigo: string;
  nome: string;
  ufCodigo: string;
  ufSigla: string;
};

/** Linha pronta para a API própria /api/indicadores */
export type LinhaIndicador = {
  ufSigla: string;
  ufNome: string;
  ufCodigo: string | null;
  regiao: string | null;
  ano: number;
  populacao: number | null;
  populacaoAno: number | null;
  /** Célula suprimida pela regra de minimização (amostra < 5 registros). */
  suprimido: boolean;
  notificacoesAmostra: number;
  notificacoesEstimadas: number;
  obitosAmostra: number;
  obitosEstimados: number;
  utiAmostra: number;
  taxaPor100Mil: number | null;
  taxaObitosPor100Mil: number | null;
  letalidadePct: number | null;
  coberturaPct: number;
};

export type StatusFonte = {
  id: string;
  nome: string;
  orgao: string;
  urlBase: string;
  estado: "conectado" | "nao_configurada" | "requer_autorizacao" | "erro";
  requerAutenticacao: boolean;
  ultimaColeta: string | null;
  httpStatus: number | null;
  registros: number | null;
  totalFonte: number | null;
  observacao: string;
};
