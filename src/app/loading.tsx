import { Loader } from "@/components/ui/loader";

export default function RootLoading() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-stone-50 select-none">
      <Loader size="lg" />
      <p className="text-sm font-bold uppercase tracking-widest text-stone-600 animate-pulse">
        First Story Films
      </p>
    </div>
  );
}
