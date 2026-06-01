# TableCraft integration prompts

Copy one of the sections below into Cursor (or another AI) when adding tables to a **different** project.

Replace placeholders:

| Placeholder | Example |
|-------------|---------|
| `[PAGE_NAME]` | Customers |
| `[PAGE_PATH]` | `src/app/(dashboard)/customers/page.tsx` |
| `[fields]` | `name`, `email` |
| `[status field]` | `status` |

---

## A. Next.js + `react-table-craft` (npm)

Use this for a **new Next.js + Tailwind** app that installs the package.

```
Integrate react-table-craft (TableCraft) into this project the same way as a production Next.js dashboard app. Follow this architecture exactly.

## Package
- Install: `react-table-craft` and peer deps `react`, `react-dom`
- Pages import `ColumnDef` from `@tanstack/react-table` (provided via the package)

## Tailwind (required)
Add to `tailwind.config` content paths:
  './node_modules/react-table-craft/dist/**/*.{js,mjs}'

## Thin re-export wrappers (do not import from 'react-table-craft' directly in pages)
Create:

1. `src/components/table/client-side-table.tsx`
   export { ClientSideTable } from 'react-table-craft'

2. `src/components/table/data-table-column-header.tsx`
   export { DataTableColumnHeader } from 'react-table-craft'

3. `src/components/table/table-actions-row.tsx`
   export { TableActionsRow } from 'react-table-craft'

Pages import only from `@/components/table/...`.

## Optional: row density
- `src/components/ui/TableDensityToggle.tsx` — 'comfortable' | 'compact'
- Global CSS:
  .table-compact .table-cell { padding: 0.4rem 0.75rem !important; font-size: 0.75rem !important; }
  .table-compact .table-header { padding: 0.35rem 0.75rem !important; }
  .table-comfortable .table-cell { padding: 0.875rem 1rem !important; }
  .table-comfortable .table-header { padding: 0.75rem 1rem !important; }
- Wrap: <div className={`table-${density}`}><ClientSideTable ... /></div>

## Standard list page pattern
Target page: [PAGE_PATH] (entity: [PAGE_NAME])

1. Keep existing API/hooks → data, isLoading in React state.
2. Optional: pre-filter before table (tabs/segments). Business rules stay outside the table.
3. Columns with useMemo:

import { type ColumnDef } from '@tanstack/react-table'
import { ClientSideTable } from '@/components/table/client-side-table'
import { DataTableColumnHeader } from '@/components/table/data-table-column-header'
import { TableActionsRow } from '@/components/table/table-actions-row'

const columns = useMemo<ColumnDef<MyType>[]>(() => [
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => <span>{row.original.name}</span>,
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <TableActionsRow
        showAction={{ action: () => openDetail(row.original.id) }}
        editAction={{ action: () => openEdit(row.original) }}
        deleteAction={{ action: () => handleDelete(row.original.id) }}
      />
    ),
  },
], [deps])

<ClientSideTable
  data={filteredRows}
  columns={columns}
  isLoading={loading}
  pageCount={Math.ceil((filteredRows.length || 1) / 20)}
  searchableColumns={[
    { id: '[field1]', title: '[Label1]' },
    { id: '[field2]', title: '[Label2]' },
  ]}
  filterableColumns={[
    {
      id: '[status field]',
      title: 'Status',
      options: [
        { label: 'Active', value: 'ACTIVE' },
        { label: 'Inactive', value: 'INACTIVE' },
      ],
    },
  ]}
/>

## Rules
- ClientSideTable only — no server DataTable unless I ask.
- No TableProvider, URL-synced router, card view, bulk row selection unless I ask.
- Modals live on the page; TableActionsRow only triggers callbacks.
- accessorKey / searchableColumns[].id must match real row fields (or column id from accessorFn).
- pageCount = ceil(data.length / 20) unless I specify page size.
- Match existing app UI; minimal diff — only [PAGE_PATH] unless I say all list pages.

## Deliverables
1. Install + tailwind content path
2. Three wrapper files under src/components/table/
3. Refactor [PAGE_PATH] with real columns/types from the API
4. Short PR summary: props used (searchableColumns, filterableColumns, pageCount)

Start by scanning [PAGE_PATH] for data fetch and types, then implement.
```

### Short (one page)

```
Add react-table-craft to this Next.js app:

npm i react-table-craft
tailwind content: './node_modules/react-table-craft/dist/**/*.{js,mjs}'

Re-export from src/components/table/: ClientSideTable, DataTableColumnHeader, TableActionsRow

Refactor [PAGE_PATH]:
- ColumnDef + ClientSideTable
- search: [fields]
- filter: [status field]
- TableActionsRow → existing modals
- Client-side only; pageCount = ceil(length/20)

Do not import from 'react-table-craft' in pages — only via wrappers.
```

---

## B. This repo (Hexalyte / salon_v1) — TableCraft built-in ✅

**Already integrated.** Do **not** install `react-table-craft` npm. Use `@/components/table` (see `frontend/TABLECRAFT.md`).

Tables are implemented in `frontend/src/components/ui/PageKit.jsx` with re-exports in `frontend/src/components/table/`.

Reference pages: `AppointmentsPage.jsx`, `PackagesPage.jsx`.

```
Add a list table to [PAGE_PATH] using the same TableCraft pattern as this Vite + React app.

## Do not install react-table-craft
Use existing components only:
- import { DataTable, FilterBar, ... } from '../components/ui/PageKit'
  OR import { DataTable, ClientSideTable } from '../components/table/client-side-table'

## Wrappers (already exist)
- frontend/src/components/table/client-side-table.jsx → PageKit ClientSideTable / DataTable
- frontend/src/components/table/data-table-column-header.jsx
- frontend/src/components/table/table-actions-row.jsx

## List page pattern
1. Fetch with existing API hooks → state (data, loading).
2. Pre-filter for tabs/segments outside the table if needed.
3. Define columns array (id, label, render) — match other pages in src/pages/.
4. Render:

<DataTable
  columns={columns}
  data={rows}
  loading={loading}
  searchableColumns={[
    { id: 'name', title: 'Filter Name' },
  ]}
  filterableColumns={[
    {
      id: 'status',
      title: 'Status',
      options: [{ label: 'Active', value: 'active' }],
    },
  ]}
  pagination={true}
/>

5. Row actions: ActionBtn / page modals — not inside the table package.
6. Toolbar is dark TableCraft-style; table body uses theme tableStyle (default = light rows).
7. Only change [PAGE_PATH] unless I ask for all list pages.

Start by reading [PAGE_PATH] and AppointmentsPage.jsx, then implement with minimal diff.
```

### Short (this repo, one page)

```
Refactor [PAGE_PATH] to use DataTable from PageKit (see AppointmentsPage / PackagesPage).
searchableColumns on [fields], filterableColumns on [status field].
No npm react-table-craft. Import via components/ui/PageKit or components/table/.
Keep existing modals and API hooks.
```

---

## Quick pick

| Project | Section |
|---------|---------|
| New Next.js + Tailwind | **A** |
| salon_v1 / Hexalyte (this repo) | **B** |
