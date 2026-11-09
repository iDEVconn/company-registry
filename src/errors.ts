/**
 * Why a registry call failed. Stable strings for code to branch on; the `message` is for people.
 *
 * - `timeout`: the registry did not answer in time
 * - `unreachable`: the request never got an answer (network, DNS, TLS)
 * - `rate-limited`: HTTP 429
 * - `http-error`: any other non-OK HTTP status (see `status`)
 * - `bad-response`: an answer that is not what the registry promises, or rows that cannot be read
 * - `upstream-error`: the registry answered with an error message of its own (for example an invalid key)
 * - `invalid-request`: the query itself is unusable for this registry (for example too short)
 * - `misconfigured`: an adapter was created without the credentials it needs
 */
export type CompanyRegistryErrorCode =
  | "timeout"
  | "unreachable"
  | "rate-limited"
  | "http-error"
  | "bad-response"
  | "upstream-error"
  | "invalid-request"
  | "misconfigured";

export class CompanyRegistryError extends Error {
  override readonly name = "CompanyRegistryError";
  readonly code: CompanyRegistryErrorCode;
  /** Human-readable registry name, for example "Companies House (UK)". */
  readonly source: string;
  /** HTTP status when the registry answered with one. */
  readonly status?: number;

  constructor(
    code: CompanyRegistryErrorCode,
    source: string,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.source = source;
    if (options.status !== undefined) this.status = options.status;
  }
}

/**
 * True for a `CompanyRegistryError`, even one created by another copy of this package (CJS and ESM builds each
 * bundle their own class, so `instanceof` alone can miss it).
 */
export function isCompanyRegistryError(error: unknown): error is CompanyRegistryError {
  return (
    error instanceof CompanyRegistryError ||
    (error instanceof Error &&
      error.name === "CompanyRegistryError" &&
      typeof (error as { code?: unknown }).code === "string")
  );
}
