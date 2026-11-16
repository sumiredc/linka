/** ロゴ（assets/logo-small.svg）と同じ形。2 枚のページの課題と解決策を、ページをまたいでつなぐ */
export function LinkaMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <rect width="16" height="16" rx="3" fill="var(--ink)" />
      <rect x="1.5" y="1.5" width="8" height="9.5" rx="1.5" fill="var(--paper)" />
      <rect x="6" y="4.5" width="9" height="10.5" rx="1.5" fill="var(--ink)" />
      <rect x="6.5" y="5" width="8" height="9.5" rx="1.5" fill="var(--paper)" />
      <path d="M4.5 4.5 11.5 11.5" stroke="var(--act)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="4.5" cy="4.5" r="2.2" fill="var(--concern)" />
      <circle cx="11.5" cy="11.5" r="2.2" fill="var(--solution)" />
    </svg>
  );
}
