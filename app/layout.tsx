import "bootstrap/dist/css/bootstrap.min.css"
import "bootstrap-icons/font/bootstrap-icons.min.css"
import { Providers } from "./providers"
import { FinanzaNavbar } from "./components/FinanzaNavbar"
import { FinanzaFooter } from "./components/FinanzaFooter"
import { NewVersionBanner } from "./components/NewVersionBanner"

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
        </Providers>
      </body>
    </html>
  )
}