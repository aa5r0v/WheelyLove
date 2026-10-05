"use client";

import { useEffect } from "react";

// Scrolls the session card into view when the page is opened via ?session=<id>
// (e.g. back from sign-in), so the chosen hour is not lost in a long list.
export default function FocusSession({ sessionId }: { sessionId: number }) {
  useEffect(() => {
    document
      .getElementById(`session-${sessionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [sessionId]);
  return null;
}
