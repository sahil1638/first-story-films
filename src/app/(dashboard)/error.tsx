"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard route failed", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl text-center">
      <h2 className="text-lg font-semibold text-stone-900">Unable to load this page</h2>
      <p className="mt-2 text-sm text-stone-600">
        Something went wrong while loading this dashboard area.
      </p>
      <Button type="button" onClick={() => unstable_retry()} className="mt-4">
        Try again
      </Button>
    </Card>
  );
}
