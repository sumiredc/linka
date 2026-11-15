import styles from "./SidePanel.module.css";

// 記憶の進み具合と結果をサイドパネルにも出す場所（PRD UC1 の代替フロー）。
// 記憶ボタンは置かない。サイドパネルのボタンからでは activeTab が付かず、ページを読めないため
//
// TODO(#14): 記憶の進み具合と完了の通知（{ target: "ui" }）が messages.ts に入ったら、
// ここで受け取って案内の下に表示する。グラフ自体は graphChanged の通知で読み直されるので、ここでは扱わない
export function ClipActivity() {
  return (
    <section className={styles.clip} aria-label="Clip">
      <LinkaMark size={22} />
      <p className={styles.clipGuide}>Click the Linka icon in the toolbar to clip this page</p>
    </section>
  );
}

export function LinkaMark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="6" cy="7" r="3" fill="var(--concern)" />
      <circle cx="18" cy="17" r="3" fill="var(--solution)" />
      <path d="M8.5 8.8 15.5 15.2" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
