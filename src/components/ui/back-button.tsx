"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "./button";
import Link from "next/link";

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
}

export function BackButton({ href, label = "Back", className }: BackButtonProps) {
  const router = useRouter();

  const handleBack = (e: React.MouseEvent) => {
    if (!href) {
      e.preventDefault();
      router.back();
    }
  };

  const buttonContent = (
    <Button
      variant="outline"
      size="sm"
      className={`group flex items-center gap-2 border-stone-200 hover:border-stone-300 hover:bg-stone-50 text-stone-600 transition-all ${className}`}
      onClick={!href ? handleBack : undefined}
      tooltip="Back"
    >
      <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" />
      <span>{label}</span>
    </Button>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block no-underline">
        {buttonContent}
      </Link>
    );
  }

  return buttonContent;
}
