import { useEffect, useState } from "react";
import { askDb, onDbNotification } from "../shared/db";
import type { DbNotification, DbResponse } from "../shared/messages";

// 開発用。画面から service worker 経由で offscreen document の DB に Cypher を送り、結果をそのまま見る
export function DbConsole() {
  const [query, setQuery] = useState("MATCH (n) RETURN count(n) AS nodes");
  const [response, setResponse] = useState<DbResponse | null>(null);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);

  useEffect(() => onDbNotification((n) => setNotifications((previous) => [...previous, n])), []);

  return (
    <section>
      <h2>Relate</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setResponse(null);
          setResponse(await askDb({ kind: "executeScript", script: query }));
        }}
      >
        <textarea
          id="cypher"
          rows={4}
          cols={80}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div>
          <button id="run" type="submit">
            実行
          </button>{" "}
          <button
            id="status"
            type="button"
            onClick={async () => setResponse(await askDb({ kind: "status" }))}
          >
            保存先
          </button>
        </div>
      </form>
      <pre id="result">{response ? JSON.stringify(response, null, 2) : ""}</pre>
      <h3>通知</h3>
      <pre id="notifications">{notifications.map((n) => JSON.stringify(n)).join("\n")}</pre>
    </section>
  );
}
