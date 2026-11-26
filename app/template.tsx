/**
 * O template é remontado a cada navegação (diferente do layout), então a
 * animação de entrada roda em toda troca de página.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
