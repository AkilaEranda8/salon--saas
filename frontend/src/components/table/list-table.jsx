import { DataTable, CRAFT_TABLE_DEFAULTS } from '../ui/PageKit';

/**
 * Standard list-page table — TableCraft toolbar + client-side pagination.
 * Pass `searchableColumns` / `filterableColumns` to enable the dark filter bar.
 */
export function ListTable({
  columns,
  data,
  loading,
  searchableColumns,
  filterableColumns,
  emptyMessage,
  emptySub,
  pageSize = CRAFT_TABLE_DEFAULTS.pageSize,
  ...rest
}) {
  return (
    <DataTable
      columns={columns}
      data={data}
      loading={loading}
      searchableColumns={searchableColumns}
      filterableColumns={filterableColumns}
      emptyMessage={emptyMessage}
      emptySub={emptySub}
      pageSize={pageSize}
      pagination={rest.pagination ?? CRAFT_TABLE_DEFAULTS.pagination}
      showRowNumbers={rest.showRowNumbers ?? CRAFT_TABLE_DEFAULTS.showRowNumbers}
      enableColumnVisibility={rest.enableColumnVisibility ?? CRAFT_TABLE_DEFAULTS.enableColumnVisibility}
      {...rest}
    />
  );
}
