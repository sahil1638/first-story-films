import { Loader } from "@/components/ui/loader";

export default function DashboardLoading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 animate-fade-in select-none bg-stone-50/50 backdrop-blur-xs z-50">
      <Loader size="md" />
      <p className="text-xs font-bold uppercase tracking-widest text-stone-600 animate-pulse z-10">
        Loading details...
      </p>
    </div>
  );
}
