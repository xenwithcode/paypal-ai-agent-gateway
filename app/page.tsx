// app/page.tsx
import { redirect } from "next/navigation";

// The root path redirects to the control center: the dashboard is the only
// view of the product.
export default function HomePage() {
  redirect("/agent-dashboard");
}
