import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";
import { App } from "./App";
import { syncAuthCookie } from "./auth-cookie.js";
import { applyDesktopBootstrapFromHash } from "./desktop-bootstrap.js";
import { getStorageItem } from "./storage.js";
import { ShellProviders } from "./providers/ShellProviders.js";

applyDesktopBootstrapFromHash();
syncAuthCookie(getStorageItem("murrmure_token"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ShellProviders>
        <App />
      </ShellProviders>
    </BrowserRouter>
  </StrictMode>,
);
