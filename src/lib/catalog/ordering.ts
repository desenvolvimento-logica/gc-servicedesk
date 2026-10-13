/** Key of the common free-text field every service ends with. */
export const OBSERVATIONS_FIELD_KEY = "observacoes";

const STEP = 10;

type Ordered = { id: string; sortOrder: number };

export type SortOrderChange = { id: string; sortOrder: number };

/**
 * Moves one item up or down and renumbers the list in steps of 10.
 * Returns only the items whose sort order actually changes.
 */
export function moveItem(items: readonly Ordered[], id: string, direction: "up" | "down"): SortOrderChange[] {
  const ids = items.map((item) => item.id);
  const from = ids.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  const neighbour = ids[to];
  if (from === -1 || neighbour === undefined) return [];

  ids[to] = id;
  ids[from] = neighbour;

  const current = new Map(items.map((item) => [item.id, item.sortOrder]));
  return ids
    .map((itemId, index) => ({ id: itemId, sortOrder: (index + 1) * STEP }))
    .filter((change) => current.get(change.id) !== change.sortOrder);
}

/**
 * Sort order for a new field: appended at the end, but kept before
 * "Observações" when that is currently the last field (which then moves down).
 */
export function placeNewField(fields: readonly (Ordered & { fieldKey: string })[]): {
  sortOrder: number;
  shift: SortOrderChange | null;
} {
  const last = fields.at(-1);
  if (!last) return { sortOrder: STEP, shift: null };
  if (last.fieldKey !== OBSERVATIONS_FIELD_KEY) return { sortOrder: last.sortOrder + STEP, shift: null };

  const previous = fields.at(-2);
  const sortOrder = previous ? previous.sortOrder + STEP : last.sortOrder;
  return {
    sortOrder,
    shift: last.sortOrder > sortOrder ? null : { id: last.id, sortOrder: sortOrder + STEP },
  };
}
