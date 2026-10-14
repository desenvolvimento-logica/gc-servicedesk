import { describe, expect, it } from "vitest";

import { escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("quotes separators, quotes and line breaks", () => {
    expect(escapeCsvCell("Silva; Filhos")).toBe('"Silva; Filhos"');
    expect(escapeCsvCell('Empresa "A"')).toBe('"Empresa ""A"""');
    expect(escapeCsvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(escapeCsvCell("simples")).toBe("simples");
  });

  it("neutralizes spreadsheet formulas", () => {
    expect(escapeCsvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(escapeCsvCell("+55 11")).toBe("'+55 11");
    expect(escapeCsvCell("-1")).toBe("'-1");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });
});

describe("toCsv", () => {
  it("adds a BOM and uses ; and CRLF", () => {
    expect(toCsv([["a", "b"], ["1", "2"]])).toBe("﻿a;b\r\n1;2\r\n");
  });
});
