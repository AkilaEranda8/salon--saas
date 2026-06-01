/**
 * TableCraft entry — npm package + salon helpers.
 * @example
 * import { ClientSideTable, DataTableColumnHeader } from '@/components/table';
 */
export { ClientSideTable, DataTable } from './client-side-table';
export { DataTableColumnHeader } from './data-table-column-header';
export { TableActionsRow } from './table-actions-row';
export {
  TableProvider,
  createTableConfig,
} from 'react-table-craft';

export { ListTable } from './list-table';
export { default as Table } from '../shared/Table';
export { default as TableDensityToggle } from '../ui/TableDensityToggle';

/** Built-in PageKit helpers (list pages still import DataTable from PageKit). */
export {
  CRAFT_TABLE_DEFAULTS,
  CRAFT_TABLE_COMPACT,
  toColumnDefs,
  inferSearchableColumns,
  TableCraftStatusBadge,
} from '../ui/PageKit';
