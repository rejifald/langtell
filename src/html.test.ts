import { describe, expect, it } from "vitest";
import { evidenceFromHtml } from "./html.js";

describe("evidenceFromHtml", () => {
  it("reads <html lang> and normalizes the tag", () => {
    const ev = evidenceFromHtml('<!doctype html><html lang="uk-UA"><body>…</body></html>');
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it("reads meta http-equiv=content-language (either attribute order)", () => {
    const a = evidenceFromHtml('<meta http-equiv="content-language" content="ru">');
    const b = evidenceFromHtml('<meta content="ru" http-equiv="content-language">');
    expect(a[0]).toMatchObject({ kind: "meta-content-language", language: "ru" });
    expect(b[0]).toMatchObject({ kind: "meta-content-language", language: "ru" });
  });

  it("reads meta property=og:locale and normalizes en_US → en", () => {
    const ev = evidenceFromHtml('<meta property="og:locale" content="en_US">');
    expect(ev[0]).toMatchObject({ kind: "meta-og-locale", language: "en" });
  });

  it("emits one item per declaration when several are present", () => {
    const html =
      '<html lang="uk"><head>' +
      '<meta http-equiv="content-language" content="uk">' +
      '<meta property="og:locale" content="uk_UA"></head></html>';
    const kinds = evidenceFromHtml(html).map((e) => e.kind);
    expect(kinds).toEqual(["html-lang", "meta-content-language", "meta-og-locale"]);
  });

  it("returns [] for empty / tag-less input", () => {
    expect(evidenceFromHtml(undefined)).toEqual([]);
    expect(evidenceFromHtml("")).toEqual([]);
    expect(evidenceFromHtml("<p>no language metadata here</p>")).toEqual([]);
  });
});

describe("evidenceFromHtml — <html lang> attribute boundary and first-match (issue #26)", () => {
  it("does not let a trailing data-lang steal the match from the real lang", () => {
    const ev = evidenceFromHtml('<html lang="uk" data-lang="ru">');
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it("does not let a trailing xml:lang steal the match from the real lang", () => {
    const ev = evidenceFromHtml('<html lang="uk" xml:lang="ru">');
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it("reads lang when xml:lang precedes it in the tag", () => {
    const ev = evidenceFromHtml('<html xml:lang="ru" lang="uk">');
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it('reads a plain <html lang="uk">', () => {
    const ev = evidenceFromHtml('<html lang="uk">');
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it("reads an unquoted lang value", () => {
    const ev = evidenceFromHtml("<html lang=uk>");
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it("reads lang with extra whitespace around the tag and the =", () => {
    const ev = evidenceFromHtml('<html  lang = "uk">');
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
  });

  it("never reads data-lang as the html lang when no real lang attribute exists", () => {
    expect(evidenceFromHtml('<html data-lang="ru">')).toEqual([]);
  });

  it("emits no evidence for a bare <html> tag", () => {
    expect(evidenceFromHtml("<html>")).toEqual([]);
  });
});

describe("evidenceFromHtml — og:locale vs og:locale:alternate (issue #25)", () => {
  it("does not read og:locale:alternate as og:locale", () => {
    const ev = evidenceFromHtml(
      '<html lang="uk"><meta property="og:locale:alternate" content="ru_RU"></html>',
    );
    expect(ev).toContainEqual(expect.objectContaining({ kind: "html-lang", language: "uk" }));
    expect(ev.find((e) => e.kind === "meta-og-locale")).toBeUndefined();
  });

  it("reads the real og:locale tag rather than a neighboring og:locale:alternate", () => {
    const ev = evidenceFromHtml(
      '<meta property="og:locale:alternate" content="ru_RU">' +
        '<meta property="og:locale" content="uk_UA">',
    );
    expect(ev).toContainEqual(expect.objectContaining({ kind: "meta-og-locale", language: "uk" }));
    expect(ev.find((e) => e.language === "ru")).toBeUndefined();
  });

  it("does not read og:locale:alternate via the reversed-attribute-order fallback", () => {
    expect(evidenceFromHtml('<meta content="ru_RU" property="og:locale:alternate">')).toEqual([]);
  });

  it("still reads og:locale correctly when og:locale:alternate sits beside it", () => {
    const ev = evidenceFromHtml(
      '<meta property="og:locale" content="uk_UA">' +
        '<meta property="og:locale:alternate" content="ru_RU">',
    );
    expect(ev).toContainEqual(expect.objectContaining({ kind: "meta-og-locale", language: "uk" }));
    expect(ev.find((e) => e.language === "ru")).toBeUndefined();
  });
});
