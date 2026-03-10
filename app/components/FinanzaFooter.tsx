"use client";

export function FinanzaFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-dark text-white py-4 mt-auto">
      <div className="container">
        <div className="row align-items-center">
          <div className="col-md-6 text-center text-md-start">
            <span className="fw-semibold">Finanza</span>
            <span className="text-white-50 ms-2">— Broker Dashboard</span>
          </div>
          <div className="col-md-6 text-center text-md-end mt-2 mt-md-0 text-white-50 small">
            © {year} Todos os direitos reservados.
          </div>
        </div>
      </div>
    </footer>
  );
}
