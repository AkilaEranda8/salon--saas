# TableCraft in Hexa Salon (salon_v1)

This app uses a **built-in TableCraft-compatible layer** (Vite + React, no Tailwind, no `react-table-craft` npm package). It matches the same API as production Next.js + `react-table-craft` dashboards.

## Import from one place

```jsx
import {
  ClientSideTable,
  DataTable,
  DataTableColumnHeader,
  TableActionsRow,
  ListTable,
  CRAFT_TABLE_DEFAULTS,
  toColumnDefs,
} from '@/components/table';
```

Legacy imports from `../components/ui/PageKit` still work.

## List page pattern

```jsx
const columns = useMemo(() => [
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => row.original.name,
  },
  {
    id: 'actions',
    header: '',
    enableSorting: false,
    cell: ({ row }) => (
      <TableActionsRow
        editAction={{ action: () => openEdit(row.original) }}
        deleteAction={{ action: () => handleDelete(row.original.id) }}
      />
    ),
  },
], []);

<ClientSideTable
  columns={columns}
  data={rows}
  loading={loading}
  searchableColumns={[
    { id: 'name', title: 'Name' },
    { id: 'email', title: 'Email' },
  ]}
  filterableColumns={[{
    id: 'status',
    title: 'Status',
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
    ],
  }]}
/>
```

- **Dark toolbar** (filters, Columns) when `searchableColumns` / `filterableColumns` are set.
- **Table body** follows **Theme → Table Style** (default = light rows).
- **Row density**: Theme → Table row density (comfortable / compact).

## Rules

| Do | Don't |
|----|--------|
| `ClientSideTable` / `DataTable` client-side | Server-side table mode unless requested |
| Page-level modals for edit/delete | Modals inside the table package |
| `searchableColumns[].id` = real field or column `id` | Mismatched filter column ids |
| `TableActionsRow` or `ActionBtn` | — |

## Optional helpers

- `ListTable` — spreads `CRAFT_TABLE_DEFAULTS` + your props.
- `toColumnDefs([{ key, label, render }])` — legacy column shape → TanStack.
- `shared/Table.jsx` — oldest `{ key, label }` API.

## AI prompt for new pages

See `docs/tablecraft-integration-prompt.md` → **Section B**.
