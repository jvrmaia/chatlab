import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import i18n from "./i18n/index.js";
import "./styles.css";

const root = document.getElementById("root");
if (root) {
  void (async (): Promise<void> => {
    if (!i18n.isInitialized) {
      await new Promise<void>((resolve) => {
        i18n.on("initialized", () => resolve());
      });
    }
    createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })();
}
