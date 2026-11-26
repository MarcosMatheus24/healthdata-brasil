import type { Metadata, Viewport } from "next";
// Fontes auto-hospedadas (servidas pelo próprio deploy): nenhuma requisição ao
// Google Fonts, coerente com a política de "sem terceiros" do projeto.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ScrollReveal } from "@/components/scroll-reveal";

export const metadata: Metadata = {
  title: {
    default: "HealthData Brasil — Vigilância em saúde com proveniência",
    template: "%s · HealthData Brasil",
  },
  description:
    "Portal educacional que integra a API de Dados Abertos do Ministério da Saúde e as APIs do IBGE para transformar notificações de SRAG em indicadores com fonte, período, cobertura e limitações declaradas.",
  keywords: [
    "SRAG",
    "vigilância em saúde",
    "dados abertos",
    "DATASUS",
    "Ministério da Saúde",
    "IBGE",
    "proveniência de dados",
  ],
  authors: [
    { name: "Marcos Matheus Ribeiro Muniz" },
    { name: "Yuri Chaves Cabral" },
    { name: "Luis Gustavo Dantas Estrela" },
    { name: "Gabriel Matos Azevedo" },
  ],
};

export const viewport: Viewport = {
  themeColor: "#060d1c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Marca o documento como "com JS" antes da primeira pintura: só assim os
            blocos com data-reveal começam ocultos. Sem JS, tudo aparece normalmente. */}
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
      </head>
      <body className="antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
        >
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <main id="conteudo">{children}</main>
        <SiteFooter />
        <ScrollReveal />
      </body>
    </html>
  );
}
