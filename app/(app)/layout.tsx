// app/(app)/layout.tsx
// Shell for every product section: fixed sidebar on desktop, stacked strip on
// mobile. Lives in a route group so the root `/` redirect stays outside it and
// never flashes the sidebar.
import Sidebar from "./components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50/50">
      <Sidebar />
      {/* Content is offset only where the sidebar is fixed; on mobile the
          sidebar sits above the content instead. */}
      <div className="md:pl-64">{children}</div>
    </div>
  );
}
