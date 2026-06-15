/**
 * Branding del producto. El nombre definitivo está pendiente:
 * cambiar aquí (y los colores en globals.css) rebrandea toda la app.
 */
export const brand = {
  /** Nombre comercial provisorio */
  name: "ERP Producción",
  slug: "erp-produccion",
  tagline: "Tu producción, tus números y tus clientes en un solo lugar",
  /** Ruta del logo dentro de /public (reemplazable) */
  logo: "/logo.svg",
  /** Correo de contacto para temas legales / privacidad / soporte */
  contactEmail: "seba@heat.cl",
  /** Dominio público del sitio (sin barra final) */
  url: "https://erp-produccion.netlify.app",
  colors: {
    primary: "#1d4ed8",
    primaryForeground: "#ffffff",
  },
} as const;
