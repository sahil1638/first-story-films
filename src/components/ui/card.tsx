import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-stone-200 bg-white p-3 md:p-4 text-stone-900 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  backHref,
  showBackButton,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  backHref?: string;
  showBackButton?: boolean;
}) {
  return (
    <div className="mb-3 md:mb-4 space-y-2">
      {(backHref || showBackButton) && (
        <div className="no-print">
          <BackButton href={backHref} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-stone-500">{description}</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}

