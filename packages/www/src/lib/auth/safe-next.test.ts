import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps a single-slash relative path", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/riffle")).toBe("/riffle");
  });

  it("falls back when the value is missing, protocol-relative, or a scheme", () => {
    expect(safeNext(null)).toBe("/account");
    expect(safeNext("")).toBe("/account");
    expect(safeNext("//evil.example")).toBe("/account");
    expect(safeNext("https://evil.example")).toBe("/account");
    expect(safeNext("/\\evil.example")).toBe("/account");
    expect(safeNext("javascript:alert(1)")).toBe("/account");
  });
});
