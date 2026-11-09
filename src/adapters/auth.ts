import { CompanyRegistryError } from "../errors";

/** Returns the trimmed credential, or throws `misconfigured` so a missing key fails at start-up, not on a user's search. */
export function requireCredential(source: string, name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new CompanyRegistryError("misconfigured", source, `${source}: ${name} is required.`);
  }
  return trimmed;
}

/** `Authorization` header value for HTTP Basic. */
export function basicAuth(user: string, password = ""): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

/** Strips trailing slashes so `base + "/path"` never doubles them. */
export function joinBase(base: string): string {
  return base.replace(/\/+$/, "");
}
