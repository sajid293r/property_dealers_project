import { ZodError } from "zod";

/** An error with an HTTP status and a message that is safe and sensible to show a person. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Plain-language sentences for the unique rules people actually run into. Anything else gets a generic message. */
const FRIENDLY_CONFLICTS: Record<string, string> = {
  bookings_one_live_per_property: "This property already has a live booking.",
  property_one_active_hold: "This property is already on hold.",
  parties_cnic_uq: "A customer with this CNIC already exists.",
  journal_entries_one_per_source: "This document has already been posted to the books.",
  bookings_idempotency_uq: "This request was already processed.",
};

export interface Problem {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

interface PgError extends Error {
  code?: string;
  constraint?: string;
  table?: string;
}

/**
 * Turns whatever went wrong into an HTTP answer.
 *
 * The database rules raise plain-language messages on purpose ("The installment schedule (X) does not add up to the
 * booking price (Y)"), so those are passed through. A raw constraint violation has a technical message and a
 * `constraint` name: it gets a generic sentence instead, and the name goes in `details` for developers.
 */
export function toProblem(err: unknown): Problem {
  if (err instanceof AppError) return { status: err.status, code: err.code, message: err.message, details: err.details };
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "invalid_request",
      message: "Some of the information sent is missing or not valid.",
      details: err.issues.map((i) => ({ field: i.path.join("."), problem: i.message })),
    };
  }
  const e = err as PgError;
  switch (e.code) {
    case "23514": // a business rule (our RAISE) or a check constraint
      return e.constraint
        ? { status: 422, code: "not_allowed", message: "That value is not allowed.", details: { constraint: e.constraint } }
        : { status: 422, code: "rule_violation", message: e.message };
    case "23505":
      return {
        status: 409,
        code: "already_exists",
        message: (e.constraint && FRIENDLY_CONFLICTS[e.constraint]) || "A record with these details already exists.",
        details: { constraint: e.constraint },
      };
    case "23503":
      return { status: 422, code: "unknown_reference", message: "This refers to a record that does not exist in this company.", details: { constraint: e.constraint } };
    case "23502":
      return { status: 422, code: "missing_value", message: "A required value is missing." };
    case "55000":
      return { status: 409, code: "wrong_state", message: e.message };
    case "42501":
      return { status: 403, code: "not_permitted", message: e.message };
    case "P0002":
      return { status: 404, code: "not_found", message: e.message };
    case "22P02":
    case "22007":
    case "22008":
      return { status: 400, code: "invalid_request", message: "A value is in the wrong format." };
    case "40001":
    case "40P01":
      return { status: 503, code: "try_again", message: "The system was busy; please try again." };
    default:
      return { status: 500, code: "internal_error", message: "Something went wrong on our side." };
  }
}
