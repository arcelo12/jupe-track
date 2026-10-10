export type SortColumn = "in" | "out" | "status";
export type SortDir = "asc" | "desc";
export type SortState = { column: SortColumn; dir: SortDir } | null;

type Unit = { bps_in: number; bps_out: number; oper_status: string };

/** Click cycle per column: none -> asc -> desc -> none. Switching column starts at asc. */
export function nextSortState(current: SortState, column: SortColumn): SortState {
  if (!current || current.column !== column) return { column, dir: "asc" };
  if (current.dir === "asc") return { column, dir: "desc" };
  return null;
}

/** Returns a new array. Null state keeps input order. Status: "up" first, then alphabetical. */
export function sortUnits<T extends Unit>(units: readonly T[], sort: SortState): T[] {
  const copy = [...units];
  if (!sort) return copy;
  const sign = sort.dir === "asc" ? 1 : -1;
  copy.sort((a, b) => {
    if (sort.column === "status") {
      const rank = (s?: string) => (s === "up" ? 0 : 1);
      return (rank(a.oper_status) - rank(b.oper_status) || (a.oper_status ?? "").localeCompare(b.oper_status ?? "")) * sign;
    }
    const pick = sort.column === "in" ? (u: Unit) => u.bps_in : (u: Unit) => u.bps_out;
    return (pick(a) - pick(b)) * sign;
  });
  return copy;
}
