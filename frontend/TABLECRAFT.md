# TableCraft in Hexa Salon (salon_v1)

**`react-table-craft`** is installed. Tailwind utilities: `src/styles/tablecraft.css`.  
**Live demo:** `/tablecraft-demo` (admin / superadmin).

**List pages** still use built-in `DataTable` in `PageKit.jsx`. **New pages** use npm via `@/components/table`.

## Minimal table (Vite — no `"use client"`)

```jsx
import { useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { ClientSideTable } from '@/components/table/client-side-table';
import { DataTableColumnHeader } from '@/components/table/data-table-column-header';

const columns = useMemo(() => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
  },
], []);

<ClientSideTable
  data={rows}
  columns={columns}
  pageCount={Math.ceil(rows.length / 10)}
/>
```

**Free:** sortable headers, pagination + page size, row numbers, column visibility toggle, responsive toolbar.

## Search

```jsx
<ClientSideTable
  data={rows}
  columns={columns}
  pageCount={Math.ceil(rows.length / 10)}
  searchableColumns={[
    { id: 'name', title: 'Name' },
    { id: 'email', title: 'Email' },
  ]}
/>
```

## Filters

```jsx
filterableColumns={[
  {
    id: 'status',
    title: 'Status',
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
    ],
  },
]}
```

## Row actions

npm `TableActionsRow` uses `editAction` / `deleteAction`. Docs-style `actions` array is supported via our wrapper:

```jsx
import { TableActionsRow } from '@/components/table/table-actions-row';

{
  id: 'actions',
  enableSorting: false,
  cell: ({ row }) => (
    <TableActionsRow
      actions={[
        { label: 'Edit', onClick: () => openEdit(row.original) },
        { label: 'Delete', variant: 'destructive', onClick: () => handleDelete(row.original.id) },
      ]}
    />
  ),
}
```

Or npm-native:

```jsx
<TableActionsRow
  editAction={{ action: () => openEdit(row.original) }}
  deleteAction={{ action: () => handleDelete(row.original.id) }}
/>
```

## Imports

| Path | Use |
|------|-----|
| `@/components/table/client-side-table` | `ClientSideTable` (npm + adapter) |
| `@/components/table/data-table-column-header` | Sortable headers |
| `@/components/table/table-actions-row` | Row menu |
| `@/components/table` | Barrel + `CRAFT_TABLE_DEFAULTS` (PageKit helpers) |
| `../components/ui/PageKit` | Legacy built-in `DataTable` |

## Props mapping (adapter)

| PageKit / salon | npm `react-table-craft` |
|-----------------|-------------------------|
| `loading` | `isLoading` (adapter maps both) |
| (optional) | `pageCount` — defaults from `data.length` |

See `docs/tablecraft-integration-prompt.md` for full rollout prompts.
