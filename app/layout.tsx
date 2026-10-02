// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayPal AI Agent Gateway 🛡️",
  description:
    "Spend policies an AI agent cannot break. Delegate purchases to an agent in PYUSD, with human approval on every rule and an FX shield for hyperinflationary currencies.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (translators, shortcut managers, password managers)
    // inject attributes straight into <html> and <body> after React has
    // rendered them, which React cannot reconcile and reports as a hydration
    // mismatch. This flag is React's documented answer for exactly that case.
    //
    // Scope is deliberately narrow: it silences attribute mismatches on these
    // two elements only. Anything wrong inside <body> — a real server/client
    // divergence in a child component — is still reported normally.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
