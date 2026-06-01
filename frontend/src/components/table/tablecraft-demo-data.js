/** Shared sample rows for TableCraft demo / docs. */

export const DEMO_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', status: 'active' },
  { id: 2, name: 'Bob', email: 'bob@example.com', status: 'inactive' },
  { id: 3, name: 'Carol', email: 'carol@example.com', status: 'active' },
  { id: 4, name: 'Dan', email: 'dan@example.com', status: 'inactive' },
  { id: 5, name: 'Eve', email: 'eve@example.com', status: 'active' },
  { id: 6, name: 'Frank', email: 'frank@example.com', status: 'inactive' },
  { id: 7, name: 'Grace', email: 'grace@example.com', status: 'active' },
  { id: 8, name: 'Henry', email: 'henry@example.com', status: 'inactive' },
  { id: 9, name: 'Ivy', email: 'ivy@example.com', status: 'active' },
  { id: 10, name: 'Jake', email: 'jake@example.com', status: 'inactive' },
  { id: 11, name: 'Kate', email: 'kate@example.com', status: 'active' },
  { id: 12, name: 'Leo', email: 'leo@example.com', status: 'inactive' },
];

export const DEMO_PAGE_SIZE = 10;

export function demoPageCount(data = DEMO_USERS, pageSize = DEMO_PAGE_SIZE) {
  return Math.max(1, Math.ceil((data.length || 1) / pageSize));
}
