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
  cheques_no_uq: "A cheque with this number from this bank is already on the register for this person. If that one was cancelled, it can be entered again.",
  bank_statements_content_uq: "This statement has already been imported for this bank account.",
};

/** Plain sentences for the check rules people actually run into (the rest get "That value is not allowed."). */
const CHECK_MESSAGES: Record<string, string> = {
  bank_statement_lines_check: "Each statement line needs a deposit or a withdrawal amount, not both and not neither.",
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
  // Fastify's own refusals (a body that is too big, JSON that cannot be read, a content type we do not take) are the
  // sender's mistake: a clear 4xx, never "something went wrong on our side".
  const fe = err as { statusCode?: number; code?: string };
  if (typeof fe.code === "string" && fe.code.startsWith("FST_") && typeof fe.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    if (fe.statusCode === 413) return { status: 413, code: "payload_too_large", message: "That is more information than can be sent at once. Send less, or a smaller file." };
    if (fe.statusCode === 415) return { status: 415, code: "unsupported_type", message: "That kind of content is not accepted." };
    return { status: fe.statusCode, code: "invalid_request", message: "The request could not be read. Check what was sent and try again." };
  }
  const e = err as PgError;
  // Table, column and constraint names are internal: they are never sent to the client (they stay in the server log).
  switch (e.code) {
    case "23514": // a business rule (our RAISE) or a check constraint
      return e.constraint
        ? { status: 422, code: "not_allowed", message: (CHECK_MESSAGES[e.constraint]) ?? "That value is not allowed." }
        : { status: 422, code: "rule_violation", message: e.message };
    case "23505":
      return {
        status: 409,
        code: "already_exists",
        message: (e.constraint && FRIENDLY_CONFLICTS[e.constraint]) || "A record with these details already exists.",
      };
    case "23503":
      return { status: 422, code: "unknown_reference", message: "This refers to a record that does not exist in this company." };
    case "23P01": // overlap: our own RAISE says what overlaps; a bare exclusion constraint gets a generic sentence
      return { status: 409, code: "overlap", message: e.constraint ? "This overlaps with something that is already recorded." : e.message };
    case "22003":
      return { status: 400, code: "number_too_large", message: "That number is too large." };
    case "22001":
      return { status: 400, code: "too_long", message: "Some of the text is too long." };
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
