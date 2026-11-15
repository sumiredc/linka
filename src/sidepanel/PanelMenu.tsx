import { useEffect, useRef, useState } from "react";
import styles from "./SidePanel.module.css";

/** 見出しの「…」メニュー。グラフが空なら Export は押せない（PRD UC4） */
export function PanelMenu({
  canExport,
  onExport,
  onGuide,
  onReset,
}: {
  canExport: boolean;
  onExport(): void;
  onGuide(): void;
  onReset(): void;
}) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className={styles.menu} ref={menu}>
      <button
        type="button"
        className={styles.iconButton}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="More"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className={styles.menuList}>
          <button
            type="button"
            disabled={!canExport}
            title={canExport ? undefined : "The graph is empty"}
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          >
            Export
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onGuide();
            }}
          >
            Use with your agent
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
          >
            Reset to demo data
          </button>
        </div>
      )}
    </div>
  );
}

/** Reset to demo data の確認（PRD UC5 の代替フロー） */
export function ResetDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose(): void;
  onConfirm(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="reset-title" onClose={onClose}>
      <h2 id="reset-title">Reset to demo data?</h2>
      <p>The pages you clipped are deleted, and the graph goes back to the bundled demo data.</p>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.buttonQuiet} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.buttonDanger} onClick={onConfirm}>
          Reset to demo data
        </button>
      </div>
    </dialog>
  );
}
