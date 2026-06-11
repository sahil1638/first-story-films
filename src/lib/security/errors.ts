import { ZodError } from "zod";

export class SafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeError";
  }
}

export function isSafeError(error: unknown): error is SafeError {
  return error instanceof SafeError;
}

export async function withSafeError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    if (error instanceof ZodError) {
      const message = error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new Error(`Validation Error: ${message}`);
    }

    if (error instanceof SafeError) {
      throw error;
    }

    const msg = error?.message || String(error);

    // Allow intentional business logic and authorization errors to propagate
    if (
      msg.includes("Unauthorized") ||
      msg.includes("access required") ||
      msg.includes("Forbidden") ||
      msg.includes("Only pending") ||
      msg.includes("Select a valid") ||
      msg.includes("Opening balance") ||
      msg.includes("Amount must be") ||
      msg.includes("not found") ||
      msg.includes("Cannot delete") ||
      msg.includes("exceed remaining") ||
      msg.includes("cannot be less than") ||
      msg.includes("Too many inquiry") ||
      msg.includes("Too many login") ||
      msg.includes("You cannot delete your own") ||
      msg.includes("Enter a valid") ||
      msg.includes("Select agency") ||
      msg.includes("Select a payment") ||
      msg.includes("Enter a payment")
    ) {
      throw new Error(msg);
    }

    // Log the full internal exception on the server for diagnostics
    console.error("[INTERNAL EXCEPTION]:", error);

    // Return generic error message to client
    throw new Error("An unexpected error occurred. Please try again later.");
  }
}
