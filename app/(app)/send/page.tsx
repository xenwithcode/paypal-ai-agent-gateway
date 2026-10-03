// app/(app)/send/page.tsx
import { SendHorizonal } from "lucide-react";
import EmptyState from "../components/EmptyState";

/**
 * Sending to a person is the other half of what an agent-issued payment order
 * is for: an envelope that governs spending tells only half the story if the
 * agent cannot pay anyone with it.
 *
 * The rail itself is not connected yet — it needs PayPal credentials — so the
 * page says that plainly instead of showing a form that cannot send.
 */
export default function SendToPaypalPage() {
  return (
    <EmptyState
      icon={SendHorizonal}
      title="No recipients yet"
      description="Send to a PayPal account by email address. The recipient is written into the order as its payee, which is what stops an agent from paying an account you never chose."
      action={{ label: "Send PYUSD", disabled: true }}
      note="Not connected yet. This rail arrives with the PayPal sandbox credentials — until then there is nothing to send from."
    />
  );
}
