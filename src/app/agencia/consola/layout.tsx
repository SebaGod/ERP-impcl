import { ConsoleNav } from "./console-nav";

export default function ConsolaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-6">
      <ConsoleNav />
      {children}
    </div>
  );
}
