const paths = {
  dashboard: 'M4 4h7v7H4zM14 4h6v7h-6zM4 14h7v6H4zM14 14h6v6h-6z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  edit: 'm15 4 5 5M4 20l4-1 12-12a2 2 0 0 0-4-4L4 15l-1 6 5-2',
  search: 'M15.5 15.5 21 21M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  watch: 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6ZM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  scan: 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M7 12h10m-5-5v10',
  journal: 'M6 4h13v16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 0v16m3-11h5m-5 4h5',
  account: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 20a8 8 0 0 1 16 0',
  coffee: 'M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Zm12 1h1a2.5 2.5 0 0 1 0 5h-1M3 21h17M8 3v3m5-3v3',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  chevron: 'm6 9 6 6 6-6',
  history: 'M3 12a9 9 0 1 1 2.4 6.1M3 7v5h5m4-5v5l3 2',
  check: 'm5 12 4 4L19 6',
};

export default function WorkspaceIcon({ name, size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
