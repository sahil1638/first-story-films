"use client";

import { Button } from "./button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show page 1
      pages.push(1);

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 2) {
        end = 4;
      } else if (currentPage >= totalPages - 1) {
        start = totalPages - 3;
      }

      if (start > 2) {
        pages.push("ellipsis-start");
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push("ellipsis-end");
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-stone-50/50 border-t border-stone-200 select-none">
      <div className="text-xs sm:text-sm text-stone-500 font-medium">
        Showing <span className="text-stone-900 font-semibold">{startItem}</span> to{" "}
        <span className="text-stone-900 font-semibold">{endItem}</span> of{" "}
        <span className="text-stone-900 font-semibold">{totalItems}</span> entries
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          tooltip="First Page"
          className="h-8 w-8 p-0 flex items-center justify-center border-stone-200 hover:border-stone-300 active:scale-95 transition-transform"
        >
          <ChevronsLeft className="h-4 w-4 text-stone-500" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          tooltip="Previous Page"
          className="h-8 w-8 p-0 flex items-center justify-center border-stone-200 hover:border-stone-300 active:scale-95 transition-transform"
        >
          <ChevronLeft className="h-4 w-4 text-stone-500" />
        </Button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (typeof page === "string") {
              return (
                <span
                  key={`${page}-${idx}`}
                  className="w-8 text-center text-stone-400 font-medium"
                >
                  &middot;&middot;&middot;
                </span>
              );
            }

            const isActive = page === currentPage;
            return (
              <Button
                key={page}
                variant={isActive ? "primary" : "outline"}
                size="sm"
                onClick={() => onPageChange(page)}
                className={cn(
                  "h-8 w-8 p-0 font-semibold transition-all duration-200",
                  isActive
                    ? "bg-amber-600 border-amber-600 text-white shadow-sm shadow-amber-600/20"
                    : "border-stone-200 hover:border-stone-300 text-stone-700 hover:bg-stone-50 active:scale-95 transition-transform"
                )}
              >
                {page}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          tooltip="Next Page"
          className="h-8 w-8 p-0 flex items-center justify-center border-stone-200 hover:border-stone-300 active:scale-95 transition-transform"
        >
          <ChevronRight className="h-4 w-4 text-stone-500" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          tooltip="Last Page"
          className="h-8 w-8 p-0 flex items-center justify-center border-stone-200 hover:border-stone-300 active:scale-95 transition-transform"
        >
          <ChevronsRight className="h-4 w-4 text-stone-500" />
        </Button>
      </div>
    </div>
  );
}
