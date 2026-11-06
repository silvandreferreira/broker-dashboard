import type { Metadata, Viewport } from "next"
import "bootstrap/dist/css/bootstrap.min.css"
import "bootstrap-icons/font/bootstrap-icons.min.css"
import { Providers } from "./providers"
import { FinanzaNavbar } from "./components/FinanzaNavbar"
import { FinanzaFooter } from "./components/FinanzaFooter"
import { NewVersionBanner } from "./components/NewVersionBanner"
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister"

export const metadata: Metadata = {
  title: "Finanza – Broker Dashboard",
  description: "Evolução mensal e anual dos teus ETFs na XTB.",
  applicationName: "Finanza",
  appleWebApp: { capable: true, title: "Finanza", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: "#0d6efd",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body className="d-flex flex-column min-vh-100">
        <Providers>
          <FinanzaNavbar />
          <main className="flex-grow-1 py-4">{children}</main>
          <FinanzaFooter />
          <NewVersionBanner />
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  )
}