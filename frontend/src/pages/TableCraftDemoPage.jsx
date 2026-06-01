import React, { useMemo } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import { ClientSideTable } from '@/components/table/client-side-table';
import { DataTableColumnHeader } from '@/components/table/data-table-column-header';
import { TableActionsRow } from '@/components/table/table-actions-row';
import {
  DEMO_USERS,
  DEMO_PAGE_SIZE,
  demoPageCount,
} from '@/components/table/tablecraft-demo-data';
import toast from 'react-hot-toast';

function DemoSection({ title, subtitle, children }) {
  return (
    <section
      style={{
        marginBottom: 28,
        padding: 20,
        borderRadius: 14,
        border: '1px solid var(--app-border)',
        background: 'var(--app-panel)',
        boxShadow: 'var(--app-shadow)',
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--app-title)', marginBottom: 4 }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'var(--app-text-muted)', marginBottom: 16 }}>{subtitle}</p>
      )}
      {children}
    </section>
  );
}

function useUserColumns({ withActions = false } = {}) {
  return useMemo(() => {
    const base = [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      },
      {
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <span style={{ textTransform: 'capitalize' }}>{row.original.status}</span>
        ),
      },
    ];

    if (!withActions) return base;

    return [
      ...base,
      {
        id: 'actions',
        enableSorting: false,
        cell: ({ row }) => (
          <TableActionsRow
            actions={[
              {
                label: 'Edit',
                onClick: () => toast.success(`Edit user #${row.original.id}`),
              },
              {
                label: 'Delete',
                variant: 'destructive',
                onClick: () => toast.error(`Delete user #${row.original.id}`),
              },
            ]}
          />
        ),
      },
    ];
  }, [withActions]);
}

export default function TableCraftDemoPage() {
  const minimalColumns = useUserColumns();
  const fullColumns = useUserColumns({ withActions: true });
  const pageCount = demoPageCount();

  return (
    <PageWrapper
      title="TableCraft demo"
      subtitle="react-table-craft via @/components/table — minimal, search, filters, row actions"
    >
      <DemoSection
        title="1. Minimal table"
        subtitle="Sortable headers, pagination, row numbers, column visibility — no extra props."
      >
        <ClientSideTable
          data={DEMO_USERS}
          columns={minimalColumns}
          pageCount={pageCount}
          pageSize={DEMO_PAGE_SIZE}
        />
      </DemoSection>

      <DemoSection
        title="2. Search"
        subtitle="searchableColumns enables the toolbar search input (client-side filter)."
      >
        <ClientSideTable
          data={DEMO_USERS}
          columns={minimalColumns}
          pageCount={pageCount}
          pageSize={DEMO_PAGE_SIZE}
          searchableColumns={[
            { id: 'name', title: 'Name' },
            { id: 'email', title: 'Email' },
          ]}
        />
      </DemoSection>

      <DemoSection
        title="3. Filters"
        subtitle="filterableColumns adds faceted dropdowns; combine with search as needed."
      >
        <ClientSideTable
          data={DEMO_USERS}
          columns={minimalColumns}
          pageCount={pageCount}
          pageSize={DEMO_PAGE_SIZE}
          searchableColumns={[
            { id: 'name', title: 'Name' },
            { id: 'email', title: 'Email' },
          ]}
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
        />
      </DemoSection>

      <DemoSection
        title="4. Row actions"
        subtitle='Column id "actions" + TableActionsRow (docs-style actions array).'
      >
        <ClientSideTable
          data={DEMO_USERS}
          columns={fullColumns}
          pageCount={pageCount}
          pageSize={DEMO_PAGE_SIZE}
          searchableColumns={[{ id: 'name', title: 'Name' }]}
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
        />
      </DemoSection>
    </PageWrapper>
  );
}
