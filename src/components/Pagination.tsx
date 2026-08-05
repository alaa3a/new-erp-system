'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
}

export function Pagination({ page, pageSize, total }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`?${params.toString()}`);
  }

  if (totalPages <= 1 && total <= pageSize) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Rows per page:</span>
        <select
          value={pageSize}
          onChange={e => { setParam('pageSize', e.target.value); setParam('page', '1'); }}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="10">10</option>
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>

      <span className="text-sm text-gray-600">
        Page {page} of {totalPages} ({total} items)
      </span>

      <div className="flex gap-1">
        <button
          onClick={() => setParam('page', String(page - 1))}
          disabled={page <= 1}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <button
          onClick={() => setParam('page', String(page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
