import { CompanyRegistryError, isCompanyRegistryError } from "../errors";

describe("isCompanyRegistryError", () => {
  it("recognises the class", () => {
    expect(isCompanyRegistryError(new CompanyRegistryError("timeout", "R", "m"))).toBe(true);
  });

  it("recognises an error from another copy of the package (CJS and ESM builds each bundle their own class)", () => {
    class Lookalike extends Error {
      override readonly name = "CompanyRegistryError";
      readonly code = "timeout";
    }

    expect(isCompanyRegistryError(new Lookalike("m"))).toBe(true);
  });

  it.each([
    ["a plain Error", new Error("m")],
    ["an Error that only has the name", Object.assign(new Error("m"), { name: "CompanyRegistryError" })],
    ["a string", "CompanyRegistryError"],
    ["null", null],
  ])("rejects %s", (_label, value) => {
    expect(isCompanyRegistryError(value)).toBe(false);
  });
});
