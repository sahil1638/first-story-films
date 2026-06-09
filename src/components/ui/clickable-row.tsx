"use client";

import { useRouter } from "next/navigation";
import { ReactNode, MouseEvent } from "react";

interface ClickableRowProps {
  href: string;
  children: ReactNode;
  className?: string;
}

export function ClickableRow({ href, children, className = "" }: ClickableRowProps) {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLTableRowElement>) => {
    // If the user clicked an interactive element (link, button, input, or dropdown trigger)
    // inside the row, do not trigger the row redirect.
    const target = e.target as HTMLElement;
    if (
      target.tagName === "A" ||
      target.tagName === "BUTTON" ||
      target.tagName === "INPUT" ||
      target.closest("a") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest('[role="button"]') ||
      target.closest('[role="menu"]')
    ) {
      return;
    }

    // Handle cmd/ctrl click to open in a new tab
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank");
    } else {
      router.push(href);
    }
  };

  return (
    <tr
      onClick={handleClick}
      className={`cursor-pointer transition-colors duration-150 ${className}`}
    >
      {children}
    </tr>
  );
}
