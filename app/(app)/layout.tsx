// app/(app)/layout.tsx
// Shell for every product section: fixed sidebar on desktop, stacked strip on
// mobile. Lives in a route group so the root `/` redirect stays outside it and
// never flashes the sidebar.
import Sidebar from "./components/Sidebar";
import DemoKiosk from "./components/DemoKiosk";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Print overrides mirror the screen ones: no sidebar, no offset, no page
    // tint. The document a browser saves is a report, not a screenshot of the
    // app around it.
    <div className="min-h-screen bg-slate-50/50 print:bg-white">
      <Sidebar />
      {/* The ▶ Demo player lives in the shell, not in any page: it has to
          survive the navigations it performs itself (Overview → crowdfunding),
          and it renders nothing unless a demo is running. */}
      <DemoKiosk />
      {/* Content is offset only where the sidebar is fixed; on mobile the
          sidebar sits above the content instead. */}
      <div className="md:pl-64 print:pl-0">{children}</div>
    </div>
  );
}
