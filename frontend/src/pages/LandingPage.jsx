import { Link } from "react-router-dom";
import { Truck, Shield, Headphones, Package } from "lucide-react";
import { LogoShield } from "../components/LogoShield";
import { BuyOnUnalButton } from "../components/BuyOnUnalButton";

const products = [
  {
    name: "Huevos",
    unit: "docena",
    price: 12000,
    image:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&h=300&fit=crop",
    category: "Avícola",
  },
  {
    name: "Gallinas Ponedoras",
    unit: "unidad",
    price: 85000,
    image:
      "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400&h=300&fit=crop",
    category: "Avícola",
  },
  {
    name: "Peces",
    unit: "kilogramo",
    price: 25000,
    image: "/peces-cachama.jpg",
    category: "Piscícola",
  },
  {
    name: "Miel",
    unit: "litro",
    price: 45000,
    image:
      "https://images.unsplash.com/photo-1587049352851-8d4e89133924?w=400&h=300&fit=crop",
    category: "Apícola",
  },
  {
    name: "Porcinos",
    unit: "unidad",
    price: 350000,
    image: "https://upload.wikimedia.org/wikipedia/commons/1/1e/JEFO-Pigs.jpg",
    category: "Porcinocultura",
  },
];

const steps = [
  {
    number: "01",
    title: "Compra en la UNAL",
    description:
      "Realiza tu compra en la página de pago virtual de la Universidad Nacional, con tarjeta o en caja.",
  },
  {
    number: "02",
    title: "Guarda tu comprobante",
    description:
      "Recibirás un PDF con los datos de tu compra. Consérvalo, es tu prueba de pago.",
  },
  {
    number: "03",
    title: "Regístrala en SIVEP",
    description:
      "Sube el PDF en el formulario. Si pagaste en efectivo, agrega el código que te dieron en caja.",
  },
  {
    number: "04",
    title: "Recibe tu pedido",
    description:
      "Te entregamos un código de reclamo para coordinar la entrega o el retiro en la granja.",
  },
];

const benefits = [
  {
    icon: Truck,
    title: "Productos Frescos",
    description: "Directamente de nuestra granja a tu mesa",
  },
  {
    icon: Shield,
    title: "Respaldo UNAL",
    description:
      "Producidos en la Granja El Cairo de la Universidad Nacional de Colombia Sede Orinoquía",
  },
  {
    icon: Headphones,
    title: "Atención Personalizada",
    description: "Te asesoramos en tu compra y respondemos dudas",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-unal-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200">
        <nav
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
          aria-label="Navegación principal"
        >
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <LogoShield className="w-10 h-10" />
              <span className="font-bold text-unal-primary text-xl">SIVEP</span>
            </div>
            <div className="hidden md:flex items-center gap-4 text-sm xl:text-base">
              <a
                href="#productos"
                className="text-unal-secondary hover:text-unal-primary font-medium transition-colors"
              >
                Productos
              </a>
              <a
                href="#como-comprar"
                className="text-unal-secondary hover:text-unal-primary font-medium transition-colors"
              >
                Cómo comprar
              </a>
              <a
                href="#beneficios"
                className="text-unal-secondary hover:text-unal-primary font-medium transition-colors"
              >
                Beneficios
              </a>
              <Link
                to="/planes"
                className="text-unal-secondary hover:text-unal-primary font-medium transition-colors"
              >
                Planes
              </Link>
              <Link
                to="/formulario-compra"
                className="text-unal-secondary hover:text-unal-primary font-medium transition-colors"
              >
                Registrar mi compra
              </Link>
              <BuyOnUnalButton className="btn-primary">Comprar</BuyOnUnalButton>
            </div>
            <div className="flex items-center gap-2 md:hidden">
              <Link
                to="/formulario-compra"
                className="btn-outline text-sm px-3 py-2"
              >
                Registrar
              </Link>
              <BuyOnUnalButton className="btn-primary text-sm px-3 py-2">
                Comprar
              </BuyOnUnalButton>
            </div>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              src="https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=1920&q=80"
              alt="Granja El Cairo"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-unal-primary/90 via-unal-primary/70 to-unal-secondary/80" />
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="max-w-3xl">
              <span className="inline-block px-4 py-1.5 bg-white/20 text-white text-sm font-medium rounded-full mb-6 backdrop-blur-sm">
                Universidad Nacional de Colombia - Sede Orinoquía
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                LA GRANJA EL CAIRO
              </h1>
              <p className="text-lg sm:text-xl text-white/90 mb-8 max-w-2xl">
                Productos frescos y de calidad directamente de nuestra granja
                universitaria. Huevos, gallinas, peces, miel y marranos
                producidos en nuestra granja universitaria.
              </p>
              <div className="flex flex-wrap gap-4">
                <BuyOnUnalButton className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3 text-lg font-medium text-unal-primary transition-colors hover:bg-unal-primary-light hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2">
                  Comprar ahora
                </BuyOnUnalButton>
                <a
                  href="#productos"
                  className="btn-outline text-lg px-8 py-3 border-white text-white hover:bg-white hover:text-unal-primary dark:hover:bg-unal-primary dark:hover:text-white dark:hover:border-unal-primary"
                >
                  Ver productos
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="productos" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-unal-secondary mb-4">
                Nuestros Productos
              </h2>
              <p className="text-unal-secondary-light max-w-2xl mx-auto">
                Productos frescos, producidos en la Granja El Cairo de la
                Universidad Nacional de Colombia Sede Orinoquía.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {products.map((product) => (
                <article
                  key={product.name}
                  className="card group overflow-hidden"
                >
                  <div className="relative h-48 overflow-hidden bg-unal-primary/5">
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      aria-hidden="true"
                    >
                      <Package className="w-12 h-12 text-unal-primary/30" />
                    </div>
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="relative w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <span className="absolute top-3 right-3 px-2 py-1 bg-white/90 backdrop-blur-sm text-xs font-medium text-unal-secondary rounded-full">
                      {product.category}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-unal-secondary mb-1">
                      {product.name}
                    </h3>
                    <p className="text-sm text-unal-secondary-light mb-3">
                      Precio por {product.unit}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-bold text-unal-primary">
                        ${product.price.toLocaleString("es-CO")}
                      </span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-comprar" className="py-20 bg-unal-background">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-unal-secondary mb-4">
                Cómo comprar
              </h2>
              <p className="text-unal-secondary-light max-w-2xl mx-auto">
                Proceso sencillo en 4 pasos para recibir tus productos frescos
                en casa.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((step) => (
                <div
                  key={step.number}
                  className="card p-6 text-center relative"
                >
                  <div className="w-14 h-14 mx-auto mb-4 bg-unal-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-2xl font-bold text-unal-primary">
                      {step.number}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-unal-secondary mb-2">
                    {step.title}
                  </h3>
                  <p className="text-unal-secondary-light">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="beneficios" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-unal-secondary mb-4">
                ¿Por qué elegirnos?
              </h2>
              <p className="text-unal-secondary-light max-w-2xl mx-auto">
                Compromiso con la calidad, la sostenibilidad y el desarrollo
                académico.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="card p-6 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 bg-unal-accent/10 rounded-full flex items-center justify-center">
                    <benefit.icon
                      className="w-7 h-7 text-unal-accent"
                      strokeWidth={2}
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-unal-secondary mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-unal-secondary-light">
                    {benefit.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-unal-primary">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              ¿Listo para hacer tu pedido?
            </h2>
            <p className="text-white/80 mb-8 max-w-2xl mx-auto">
              Compra en la página de la Universidad Nacional y luego sube tu
              comprobante en PDF para recibir tu código de reclamo.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <BuyOnUnalButton className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3 text-lg font-medium text-unal-primary transition-colors hover:bg-unal-primary-light hover:text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2">
                Comprar en la UNAL
              </BuyOnUnalButton>
              <Link
                to="/formulario-compra"
                className="btn-outline text-lg px-8 py-3 border-white text-white hover:bg-white hover:text-unal-primary dark:hover:bg-unal-primary dark:hover:text-white dark:hover:border-unal-primary"
              >
                Ya compré, registrar mi compra
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-unal-secondary text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <LogoShield className="w-10 h-10" />
                <span className="font-bold text-xl">SIVEP</span>
              </div>
              <p className="text-white/70 text-sm">
                Sistema de Inventario, Ventas y Producción - Granja El Cairo
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Enlaces rápidos</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>
                  <a
                    href="#productos"
                    className="hover:text-white transition-colors"
                  >
                    Productos
                  </a>
                </li>
                <li>
                  <Link
                    to="/formulario-compra"
                    className="hover:text-white transition-colors"
                  >
                    Registrar compra
                  </Link>
                </li>
                <li>
                  <Link
                    to="/login"
                    className="hover:text-white transition-colors"
                  >
                    Acceso administrativo
                  </Link>
                </li>
                <li>
                  <Link
                    to="/planes"
                    className="hover:text-white transition-colors"
                  >
                    Planes y precios
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">
                Contacto y datos del negocio
              </h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>
                  Responsable: Universidad Nacional de Colombia – Sede Orinoquía
                </li>
                <li>Granja El Cairo · Arauca, Colombia</li>
                <li>Email: granjaelcairo@unal.edu.co</li>
                <li>
                  Dirección y teléfono: por confirmar con la administración de
                  la granja
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-white/70">
                <li>
                  <Link
                    to="/privacidad"
                    className="hover:text-white transition-colors"
                  >
                    Política de privacidad
                  </Link>
                </li>
                <li>
                  <Link
                    to="/terminos"
                    className="hover:text-white transition-colors"
                  >
                    Términos y condiciones
                  </Link>
                </li>
                <li>
                  <Link
                    to="/reembolsos"
                    className="hover:text-white transition-colors"
                  >
                    Política de reembolsos
                  </Link>
                </li>
                <li>
                  <Link
                    to="/cookies"
                    className="hover:text-white transition-colors"
                  >
                    Política de cookies
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/20 pt-8 text-center text-sm text-white/70">
            <p>
              &copy; 2026 Universidad Nacional de Colombia - Sede Orinoquía.
              Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
