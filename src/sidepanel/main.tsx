import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./base.css";
import { SidePanel } from "./SidePanel";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
