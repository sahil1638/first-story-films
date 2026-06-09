import { Suspense } from "react";

function LoginFallback() {
  return (
    <p className="flex min-h-screen items-center justify-center text-stone-500">
      Loading…
    </p>
  );
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoginFallback />}>{children}</Suspense>;
}
