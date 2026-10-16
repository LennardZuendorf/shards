import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { isTauri } from "@tauri-apps/api/core";
import "./index.css";
import App from "./App.tsx";

// Window chrome (traffic-light inset, drag regions) only applies inside the desktop app.
if (isTauri()) document.documentElement.dataset.runtime = "tauri";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
