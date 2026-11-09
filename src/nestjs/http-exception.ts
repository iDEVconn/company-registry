import { HttpException } from "@nestjs/common";
import { isCompanyRegistryError, type CompanyRegistryErrorCode } from "../errors";

const STATUS: Record<CompanyRegistryErrorCode, number> = {
  "invalid-request": 400,
  "rate-limited": 429,
  misconfigured: 503,
  timeout: 504,
  unreachable: 502,
  "bad-response": 502,
  "http-error": 502,
  "upstream-error": 502,
};

/**
 * Turns a lookup failure into an `HttpException` with `{ statusCode, code, message }`. The message is safe to show:
 * a missing credential is reported without the name of the variable, and anything that is not a
 * `CompanyRegistryError` becomes a generic 500 so internals never leak.
 */
export function toHttpException(error: unknown): HttpException {
  if (isCompanyRegistryError(error)) {
    const statusCode = STATUS[error.code];
    const message = error.code === "misconfigured" ? `${error.source} is not configured.` : error.message;
    return new HttpException({ statusCode, code: error.code, message }, statusCode);
  }
  return new HttpException({ statusCode: 500, code: "internal-error", message: "Company lookup failed." }, 500);
}
