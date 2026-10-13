import { describe, expect, it } from "vitest";

import { moveItem, placeNewField } from "./ordering";

const items = [
  { id: "a", sortOrder: 10 },
  { id: "b", sortOrder: 20 },
  { id: "c", sortOrder: 30 },
];

describe("moveItem", () => {
  it("swaps with the neighbour and returns only changed rows", () => {
    expect(moveItem(items, "b", "up")).toEqual([
      { id: "b", sortOrder: 10 },
      { id: "a", sortOrder: 20 },
    ]);
    expect(moveItem(items, "b", "down")).toEqual([
      { id: "c", sortOrder: 20 },
      { id: "b", sortOrder: 30 },
    ]);
  });

  it("ignores moves past the edges or unknown ids", () => {
    expect(moveItem(items, "a", "up")).toEqual([]);
    expect(moveItem(items, "c", "down")).toEqual([]);
    expect(moveItem(items, "x", "up")).toEqual([]);
  });

  it("renumbers irregular orders", () => {
    const irregular = [
      { id: "a", sortOrder: 5 },
      { id: "b", sortOrder: 5 },
      { id: "c", sortOrder: 90 },
    ];
    expect(moveItem(irregular, "c", "up")).toEqual([
      { id: "a", sortOrder: 10 },
      { id: "c", sortOrder: 20 },
      { id: "b", sortOrder: 30 },
    ]);
  });
});

describe("placeNewField", () => {
  it("starts at 10 on an empty service", () => {
    expect(placeNewField([])).toEqual({ sortOrder: 10, shift: null });
  });

  it("appends after the last field", () => {
    expect(placeNewField([{ id: "a", sortOrder: 10, fieldKey: "nome_empresa" }])).toEqual({ sortOrder: 20, shift: null });
  });

  it("keeps Observações last", () => {
    expect(
      placeNewField([
        { id: "a", sortOrder: 10, fieldKey: "nome_empresa" },
        { id: "o", sortOrder: 20, fieldKey: "observacoes" },
      ]),
    ).toEqual({ sortOrder: 20, shift: { id: "o", sortOrder: 30 } });

    expect(
      placeNewField([
        { id: "a", sortOrder: 10, fieldKey: "nome_empresa" },
        { id: "o", sortOrder: 90, fieldKey: "observacoes" },
      ]),
    ).toEqual({ sortOrder: 20, shift: null });

    expect(placeNewField([{ id: "o", sortOrder: 10, fieldKey: "observacoes" }])).toEqual({
      sortOrder: 10,
      shift: { id: "o", sortOrder: 20 },
    });
  });
});
