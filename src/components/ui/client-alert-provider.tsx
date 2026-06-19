"use client";

import { useEffect, useState } from "react";
import { AlertModal } from "@/components/ui/alert-modal";

export function ClientAlertProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nativeAlert = window.alert.bind(window);

    window.alert = (value?: unknown) => {
      setMessage(String(value ?? "Something went wrong"));
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, []);

  return (
    <>
      {children}
      <AlertModal
        isOpen={message !== null}
        title="Notice"
        message={message ?? ""}
        onClose={() => setMessage(null)}
      />
    </>
  );
}
