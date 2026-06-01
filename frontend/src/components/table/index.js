/**
 * TableCraft entry point — import list tables from here, not PageKit directly.
 * @example
 * import { ClientSideTable, DataTableColumnHeader, CRAFT_TABLE_DEFAULTS } from '@/components/table';
 */
export {
  ClientSideTable,
  DataTable,
  DataTableColumnHeader,
  TableActionsRow,
  TableCraftStatusBadge,
  CRAFT_TABLE_DEFAULTS,
  CRAFT_TABLE_COMPACT,
  toColumnDefs,
  inferSearchableColumns,
} from '../ui/PageKit';

export { default as Table } from '../shared/Table';
export { ListTable } from './list-table';
export { default as TableDensityToggle } from '../ui/TableDensityToggle';
