import {
  ClientSideTable as RtcClientSideTable,
  DataTable as RtcDataTable,
} from 'react-table-craft';

/** Maps salon PageKit props → react-table-craft API. */
function mapLoadingProps({ loading, isLoading, ...rest }) {
  return { ...rest, isLoading: isLoading ?? loading ?? false };
}

function defaultPageCount(data, pageSize) {
  const n = Array.isArray(data) ? data.length : 0;
  return Math.max(1, Math.ceil((n || 1) / pageSize));
}

export function ClientSideTable({
  loading,
  isLoading,
  pageCount,
  data = [],
  pageSize = 10,
  className = '',
  ...props
}) {
  const rootClass = ['tablecraft-root', className].filter(Boolean).join(' ');
  return (
    <div className={rootClass}>
      <RtcClientSideTable
        {...mapLoadingProps({ loading, isLoading, ...props })}
        data={data}
        pageSize={pageSize}
        pageCount={
          pageCount ??
          (props.isQueryPagination ? 1 : defaultPageCount(data, pageSize))
        }
      />
    </div>
  );
}

export function DataTable({
  loading,
  isLoading,
  pagination,
  data = [],
  ...props
}) {
  const pageSize = pagination?.pageSize ?? props.pageSize ?? 10;
  const page = pagination?.page ?? 1;
  return (
    <div className="tablecraft-root">
      <RtcDataTable
        {...mapLoadingProps({ loading, isLoading, ...props })}
        data={data}
        pagination={
          pagination ?? {
            page,
            pageSize,
            pageCount: defaultPageCount(data, pageSize),
          }
        }
      />
    </div>
  );
}
