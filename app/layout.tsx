import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Providers } from "@/components/providers"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "https://example.com"
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "BuildAI — AI website & system builder",
    template: "%s — BuildAI",
  },
  description:
    "Generate production-grade web apps with AI. Plan → build → preview with QA gates. Publish to GitHub + Vercel with one click.",
  applicationName: "BuildAI",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "BuildAI",
    title: "BuildAI — AI website & system builder",
    description:
      "Generate production-grade web apps with AI. Plan → build → preview with QA gates. Publish to GitHub + Vercel with one click.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "BuildAI — AI website & system builder",
    description:
      "Generate production-grade web apps with AI. Plan → build → preview with QA gates. Publish to GitHub + Vercel with one click.",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const base = siteUrl()
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "BuildAI",
    url: base,
  }
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "BuildAI",
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: `${base}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  }

  return (
    <html lang="en" className="dark bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <Providers>
          {children}
          {process.env.NODE_ENV === "production" && <Analytics />}
        </Providers>
      </body>
    </html>
  )
}
