export function LinkaMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="6" cy="7" r="3" fill="var(--concern)" />
      <circle cx="18" cy="17" r="3" fill="var(--solution)" />
      <path d="M8.5 8.8 15.5 15.2" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
