import { NextResponse } from "next/server";
import { ZodError } from "zod";

type ApiErrorOptions = {
  context: string;
};

type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal_error";

type ErrorLike = {
  name?: string;
  code?: string;
  message?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly safeMessage: string;

  constructor(status: number, code: ApiErrorCode, safeMessage: string, internalMessage = safeMessage) {
    super(internalMessage);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, "unauthorized", "Authentication required.", message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends ApiError {
  constructor(message = "Forbidden") {
    super(403, "forbidden", "You do not have permission to perform this action.", message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundApiError extends ApiError {
  constructor(message = "Not found") {
    super(404, "not_found", "Requested resource was not found.", message);
    this.name = "NotFoundApiError";
  }
}

export class ConflictApiError extends ApiError {
  constructor(message = "Conflict") {
    super(409, "conflict", "The request conflicts with existing records.", message);
    this.name = "ConflictApiError";
  }
}

function getErrorLike(error: unknown): ErrorLike {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: string };
    return { name: error.name, code: withCode.code, message: error.message };
  }
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    return {
      name: typeof obj.name === "string" ? obj.name : undefined,
      code: typeof obj.code === "string" ? obj.code : undefined,
      message: typeof obj.message === "string" ? obj.message : undefined,
    };
  }
  return { message: String(error) };
}

function classifyError(error: unknown) {
  if (error instanceof ApiError) {
    return { status: error.status, message: error.safeMessage, code: error.code };
  }

  if (error instanceof ZodError) {
    return { status: 400, message: "Invalid request payload.", code: "bad_request" };
  }

  const details = getErrorLike(error);
  const message = details.message ?? "";
  const lower = message.toLowerCase();
  const code = details.code ?? "";

  if (lower.includes("unauthorized") || lower.includes("not authenticated")) {
    return { status: 401, message: "Authentication required.", code: "unauthorized" };
  }
  if (lower.includes("forbidden") || lower.includes("access required")) {
    return { status: 403, message: "You do not have permission to perform this action.", code: "forbidden" };
  }
  if (lower.includes("not found")) {
    return { status: 404, message: "Requested resource was not found.", code: "not_found" };
  }
  if (
    code === "23505" ||
    code === "23503" ||
    lower.includes("duplicate key") ||
    lower.includes("violates foreign key constraint") ||
    lower.includes("violates unique constraint") ||
    lower.includes("constraint") ||
    lower.includes("cannot delete")
  ) {
    return { status: 409, message: "The request conflicts with existing records.", code: "conflict" };
  }
  if (lower.includes("invalid")) {
    return { status: 400, message: "Invalid request.", code: "bad_request" };
  }

  return { status: 500, message: "An unexpected error occurred. Please try again later.", code: "internal_error" };
}

export function handleApiError(error: unknown, options: ApiErrorOptions) {
  const safe = classifyError(error);
  const details = getErrorLike(error);

  console.error("API request failed", {
    context: options.context,
    errorName: details.name,
    errorCode: details.code,
    safeMessage: safe.message,
    internalMessage: details.message,
  });

  return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status });
}
