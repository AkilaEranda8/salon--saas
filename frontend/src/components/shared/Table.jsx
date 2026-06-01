import React, { useMemo } from 'react';
import { DataTable, toColumnDefs } from '../ui/PageKit';

/**
 * Legacy table API — forwards to TableCraft DataTable.
 * columns: [{ key, label, render?, width?, align?, sortable? }]
 */
export default function Table({
  columns,
  data = [],
  loading = false,
  emptyText = 'No data found.',
  emptySub = '',
  searchableColumns = null,
  filterableColumns = null,
  pageSize = 10,
  compact = false,
  showRowNumbers,
  pagination,
}) {
  const defs = useMemo(() => toColumnDefs(columns), [columns]);
  const searchCols = searchableColumns ?? (columns?.length
    ? [{ id: columns[0].key || columns[0].id, title: columns[0].label || 'Search' }]
    : null);

  return (
    <DataTable
      columns={defs}
      data={data}
      loading={loading}
      emptyMessage={emptyText}
      emptySub={emptySub || undefined}
      searchableColumns={searchCols}
      filterableColumns={filterableColumns}
      pageSize={pageSize}
      compact={compact}
      showRowNumbers={showRowNumbers}
      pagination={pagination}
    />
  );
}
