import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DbConsole } from "./DbConsole";

// 本番の UI からはリンクしない。chrome-extension://<id>/dev.html を直接開いて、Nano と Relate を手で確かめる
const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Linka dev</h1>
      <DbConsole />
    </main>
  </StrictMode>,
);
