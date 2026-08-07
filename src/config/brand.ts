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
  /**
   * Dominio público del sitio (sin barra final).
   *
   * La producción canónica es Vercel, conectado al repositorio: cada push
   * a la rama de trabajo despliega solo. Existió además un sitio en
   * Netlify (erp-produccion.netlify.app) subido a mano en junio; quedó
   * meses desactualizado y esta referencia apuntándole hizo creer a una
   * auditoría que era LA producción. Si se contrata un dominio propio,
   * se cambia acá.
   */
  url: "https://erp-impcl.vercel.app",
  colors: {
    primary: "#1d4ed8",
    primaryForeground: "#ffffff",
  },
} as const;
