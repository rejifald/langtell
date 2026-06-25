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
