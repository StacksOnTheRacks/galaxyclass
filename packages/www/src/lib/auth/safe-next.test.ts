import { describe, expect, it } from "vitest";
import { isGamePath, readNextParam, safeNext, withNext } from "./safe-next";

describe("next across auth pages", () => {
  it("passes on only a safe next path that was actually given", () => {
    window.history.pushState({}, "", "/sign-up");
    expect(readNextParam()).toBeNull();
    window.history.pushState({}, "", "/sign-up?next=/scribble/abc");
    expect(readNextParam()).toBe("/scribble/abc");
    window.history.pushState({}, "", "/sign-up?next=//evil.example");
    expect(readNextParam()).toBeNull();
    window.history.pushState({}, "", "/");
  });

  it("appends next only when there is one", () => {
    expect(withNext("/confirm", null)).toBe("/confirm");
    expect(withNext("/confirm", "/riffle/t?x=1")).toBe("/confirm?next=%2Friffle%2Ft%3Fx%3D1");
  });

  it("recognizes the games, which load outside the Next app", () => {
    for (const path of ["/scribble", "/scribble/abc", "/riffle", "/riffle?x=1", "/riffle#t"]) {
      expect(isGamePath(path)).toBe(true);
    }
    for (const path of ["/account", "/scribbles", "/about", "/"]) {
      expect(isGamePath(path)).toBe(false);
    }
  });
});

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
