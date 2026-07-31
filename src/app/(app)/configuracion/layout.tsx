import { ConfigNav } from "./config-nav";

export default function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-52">
        <h1 className="mb-3 text-lg font-semibold">Configuración</h1>
        <ConfigNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
