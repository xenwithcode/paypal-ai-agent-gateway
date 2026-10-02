// app/page.tsx
import { redirect } from "next/navigation";

// The root path drops the visitor straight into the dashboard. It sits outside
// the (app) route group so no sidebar is rendered for the redirect itself.
export default function HomePage() {
  redirect("/overview");
}
