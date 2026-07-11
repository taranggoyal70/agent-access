import Link from "next/link";

export type ConsoleColumn = { key: string; label: string };

export function ConsoleTable({ columns, rows, empty, linkKey, linkPrefix }: { columns: ConsoleColumn[]; rows: Record<string, string>[]; empty: string; linkKey?: string; linkPrefix?: string }) {
  if (!rows.length) return <div className="table-empty">{empty}</div>;
  return <div className="console-table-wrap"><table className="console-table"><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map((column) => <td key={column.key}>{linkKey === column.key && linkPrefix ? <Link href={`${linkPrefix}${row.id}`}>{row[column.key]}</Link> : row[column.key]}</td>)}</tr>)}</tbody></table></div>;
}
