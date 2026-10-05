// app/(app)/send/layout.tsx
// Shared shell for both payment rails: one section heading, one tab strip, and
// a fixed content height so switching tabs never shifts the page underneath.
import SendTabs from "./SendTabs";

export const metadata = { title: "Send money · PayPal AI Agent Gateway" };

export default function SendLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Send money</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Dollars first, because that is what PayPal settles in. Name the recipient and set an
          amount; the recipient goes into the order <em>before</em> anything is authorized, so the
          money can only land on the account you named.
        </p>
      </header>

      <div className="px-6 md:px-8">
        <SendTabs />
        {/* Fixed minimum height so the tab strip arriving after mount cannot
            push the content below it. */}
        <div className="min-h-[300px]">{children}</div>
      </div>
    </>
  );
}
