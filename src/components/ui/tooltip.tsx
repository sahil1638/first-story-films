"use client";

import React, { useId, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const offset = 8;

export function Tooltip({
  content,
  children,
  position = "top",
  className,
}: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
      let top = triggerRect.top - tooltipRect.height - offset;

      if (position === "bottom") {
        top = triggerRect.bottom + offset;
      } else if (position === "left") {
        left = triggerRect.left - tooltipRect.width - offset;
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      } else if (position === "right") {
        left = triggerRect.right + offset;
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
      }

      setCoords({
        left: Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - tooltipRect.height - 8)),
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [position, visible]);

  return (
    <span
      ref={triggerRef}
      className={cn("inline-flex", className)}
      aria-describedby={visible ? id : undefined}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {mounted && visible && createPortal(
        <span
          ref={tooltipRef}
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-[9999] rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-md whitespace-nowrap"
          style={{ left: coords.left, top: coords.top }}
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}
