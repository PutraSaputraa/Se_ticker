const paths = {
  search: 'M15.5 15.5 21 21M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  watch: 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6ZM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  scan: 'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M7 12h10m-5-5v10',
  test: 'M4 4v16h16M8 15l3-4 4 2 5-6',
  journal: 'M6 4h13v16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 0v16m3-11h5m-5 4h5',
  account: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 20a8 8 0 0 1 16 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
};

export default function WorkspaceIcon({ name, size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
