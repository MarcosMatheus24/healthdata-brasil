const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nfDec1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfDec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const int = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : nfInt.format(n);

export const dec1 = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : nfDec1.format(n);

export const dec2 = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : nfDec2.format(n);

export const pct = (n: number | null | undefined, casas = 1) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : `${casas === 2 ? nfDec2.format(n) : nfDec1.format(n)}%`;

export const compacto = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1_000_000) return `${nfDec1.format(n / 1_000_000)} mi`;
  if (Math.abs(n) >= 1_000) return `${nfDec1.format(n / 1_000)} mil`;
  return nfInt.format(n);
};

export const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
};

export const dataHora = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(d);
};

export const mesLabel = (ym: string) => {
  const [ano, mes] = ym.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const i = Number(mes) - 1;
  if (!nomes[i]) return ym;
  return `${nomes[i]}/${ano.slice(2)}`;
};

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * Taxa por 100 mil hab. com casas decimais proporcionais à magnitude:
 * 136 → "136", 12,4 → "12,4", 0,08 → "0,08". Evita que doenças raras
 * (Zika, Febre amarela) apareçam como "0" por arredondamento.
 */
export const taxa = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a < 10) return nfDec2.format(n);
  if (a < 100) return nfDec1.format(n);
  return nfInt.format(n);
};
