import { useEffect, useState } from "react";
import { askClip, onClipEvent } from "../shared/clip";
import type { ClipEvent } from "../shared/clip-status";
import {
  connectionsText,
  connectionText,
  countsText,
  failureText,
  stageText,
} from "../shared/clip-text";
import { LinkaMark } from "./LinkaMark";
import styles from "./SidePanel.module.css";

/** 最後に届いた記憶の通知。開いたときに進んでいる記憶があれば、その進み具合から始める */
export function useLatestClipEvent(): ClipEvent | null {
  const [event, setEvent] = useState<ClipEvent | null>(null);
  useEffect(() => {
    let received = false;
    const stop = onClipEvent((next) => {
      received = true;
      setEvent(next);
    });
    askClip({ kind: "current" }).then((response) => {
      if (!received && response.ok && response.value !== null) {
        setEvent({ kind: "progress", progress: response.value });
      }
    });
    return stop;
  }, []);
  return event;
}

function ClipStatus({ event }: { event: ClipEvent }) {
  if (event.kind === "progress") {
    return (
      <p className={styles.clipStatus} role="status">
        Clipping “{event.progress.target.title}”: {stageText(event.progress.stage)}
      </p>
    );
  }
  const { result, target } = event;
  if (!result.ok) {
    return (
      <p className={`${styles.clipStatus} ${styles.clipBad}`} role="status">
        Could not clip “{target.title}”: {failureText(result.error)}
      </p>
    );
  }
  const { summary } = result;
  const links = summary.connections.kind === "judged" ? summary.connections.links : [];
  return (
    <div role="status" className={styles.clipResult}>
      <p className={`${styles.clipStatus} ${styles.clipOk}`}>
        {summary.newPage ? "Clipped" : "Clipped again"} “{summary.title}”: {countsText(summary)}.
      </p>
      <p className={summary.connections.kind === "judged" ? styles.clipStatus : styles.clipNote}>
        {connectionsText(summary)}
      </p>
      {links.length > 0 && (
        <ul className={styles.clipConnections} aria-label="New connections">
          {links.map((link) => (
            <li key={`${link.solution.id}|${link.concern.id}`}>
              {connectionText(link, summary.url)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 記憶の進み具合と結果をサイドパネルにも出す場所（PRD UC1 の代替フロー）。
// 記憶ボタンは置かない。サイドパネルのボタンからでは activeTab が付かず、ページを読めないため。
// グラフ自体は graphChanged の通知で読み直されるので、ここでは扱わない。
// 通知はグラフでの強調にも使うので、受け取るのはサイドパネル（useLatestClipEvent）
export function ClipActivity({ event }: { event: ClipEvent | null }) {
  return (
    <section className={styles.clip} aria-label="Clip">
      <LinkaMark size={22} />
      <div className={styles.clipBody}>
        <p className={styles.clipGuide}>Click the Linka icon in the toolbar to clip this page</p>
        {event && <ClipStatus event={event} />}
      </div>
    </section>
  );
}
