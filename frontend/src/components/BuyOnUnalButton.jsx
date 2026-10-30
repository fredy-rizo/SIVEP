import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  CreditCard,
  LayoutGrid,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
} from "lucide-react";
import { Modal } from "./Modal";
import { LiveStockBadge } from "./LiveStockBadge";
import api from "../utils/api";
import { formatCOP } from "../utils/formatters";
import { mergeStockUpdate } from "../utils/stockEvents";
import { useStockUpdates } from "../hooks/useStockUpdates";
import { ECOLLECT_PURCHASE_URL } from "../config/ecollect";

const steps = [
  {
    icon: LayoutGrid,
    title: "Ver catálogos de servicios",
    description:
      "Ingresa a la página de pago virtual y selecciona la Sede Orinoquía.",
  },
  {
    icon: Briefcase,
    title: "Ver portafolios de servicios",
    description: "Consulta los servicios y productos disponibles.",
  },
  {
    icon: ShoppingCart,
    title: "Venta de bienes",
    description: "Elige la opción de venta de bienes.",
  },
  {
    icon: CreditCard,
    title: "Realizar proceso de compra",
    description: "Completa tus datos y realiza el pago.",
  },
];

// Botón de compra que primero explica el proceso y solo después lleva a la
// página de pago virtual de la UNAL. Así el cliente no olvida que debe volver
// a SIVEP con el comprobante en PDF.
export function BuyOnUnalButton({
  className = "btn-primary",
  children = "Comprar",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  // Última versión del catálogo aplicada: evita que una respuesta HTTP vieja
  // pise un evento WebSocket más reciente.
  const stockVersionRef = useRef(-1);

  const close = () => setIsOpen(false);

  // El canal es compartido entre todos los botones "Comprar" de la página.
  // Cada evento reemplaza la lista (o aplica el cambio) sin recargar.
  const stockStatus = useStockUpdates((message) => {
    const incoming = Number(message?.catalogVersion ?? 0);
    if (incoming < stockVersionRef.current) return;
    stockVersionRef.current = incoming;

    setProducts((previous) => mergeStockUpdate(previous, message));
    setProductsError("");
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    let active = true;
    const requestVersion = stockVersionRef.current;
    setLoadingProducts(true);
    setProductsError("");

    api
      .get("/public/products")
      .then(({ data }) => {
        if (!active) return;
        const incoming = Number(data.catalogVersion ?? 0);
        if (incoming < stockVersionRef.current) return;
        stockVersionRef.current = incoming;
        setProducts(data.products || []);
      })
      .catch(() => {
        if (!active) return;
        // Si un evento ya actualizó la lista, un fallo HTTP no la borra.
        if (stockVersionRef.current !== requestVersion) return;
        setProducts([]);
        setProductsError(
          "No pudimos consultar la disponibilidad. Intenta de nuevo."
        );
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, reloadToken]);

  const canBuy =
    !loadingProducts && !productsError && products.length > 0;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setLoadingProducts(true);
          setIsOpen(true);
        }}
        aria-haspopup="dialog"
      >
        {children}
      </button>

      {createPortal(
        <Modal
          isOpen={isOpen}
          onClose={close}
          title="Compra en el pago virtual de la UNAL"
          size="md"
        >
          <div className="space-y-5">
            <div className="flex gap-3 rounded-lg border border-unal-primary/15 bg-unal-primary/5 p-4">
              <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-unal-primary" />
              <p className="text-sm text-unal-secondary">
                Vas a salir de SIVEP para pagar en la página de pago virtual de
                la Universidad Nacional. La compra se completa allá; después
                debes volver a SIVEP a registrar tu comprobante.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-unal-secondary">
                    Antes de comprar: disponibilidad en SIVEP
                  </p>
                  <p className="mt-1 text-xs text-unal-secondary-light">
                    Solo se muestran los productos con existencias. Revisa que
                    esté el producto que buscas antes de ir a pagar.
                  </p>
                </div>
                <LiveStockBadge status={stockStatus} />
              </div>

              {loadingProducts ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 text-sm text-unal-secondary-light">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-unal-primary border-t-transparent" />
                  Consultando disponibilidad…
                </div>
              ) : productsError ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <p>{productsError}</p>
                    <button
                      type="button"
                      onClick={() => setReloadToken((token) => token + 1)}
                      className="mt-2 inline-flex items-center gap-1 font-medium underline"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reintentar
                    </button>
                  </div>
                </div>
              ) : products.length === 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    No hay productos con stock disponible en este momento.
                    Vuelve a intentarlo más tarde.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                  {products.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-unal-secondary">
                          {product.name}
                        </p>
                        <p className="text-xs text-unal-secondary-light">
                          {formatCOP(product.current_price)} / {product.unit}
                        </p>
                      </div>
                      <span className="badge badge-success whitespace-nowrap">
                        {product.current_stock} disp.
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-unal-secondary">
                Ruta de compra en la UNAL
              </p>
              <p className="mt-1 text-xs text-unal-secondary-light">
                Si hay disponibilidad, sigue estos pasos en la página de pago
                virtual:
              </p>
            </div>

            <ol className="space-y-4">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-unal-primary/10 text-sm font-bold text-unal-primary">
                    {index + 1}
                  </div>
                  <div>
                    <p className="flex items-center gap-2 font-medium text-unal-secondary">
                      <step.icon className="h-4 w-4 text-unal-primary" />
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm text-unal-secondary-light">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <strong>Después de pagar:</strong> guarda el comprobante en PDF
              que recibirás en el correo que registres y súbelo en{" "}
              <strong>“Registrar mi compra”</strong>. Sin el PDF no podemos
              generar tu código de reclamo.
            </div>

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={close} className="btn-outline">
                Cancelar
              </button>
              <Link
                to="/formulario-compra"
                onClick={close}
                className="btn-secondary text-center"
              >
                Ya compré, registrar
              </Link>
              {canBuy ? (
                <a
                  href={ECOLLECT_PURCHASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                  className="btn-primary inline-flex items-center justify-center gap-2"
                >
                  Ir a pagar
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="btn-primary inline-flex cursor-not-allowed items-center justify-center gap-2 opacity-50"
                  title="Primero debe haber disponibilidad en SIVEP"
                >
                  Ir a pagar
                </button>
              )}
            </div>
          </div>
        </Modal>,
        document.body
      )}
    </>
  );
}
