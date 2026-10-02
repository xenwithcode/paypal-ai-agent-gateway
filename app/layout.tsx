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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
