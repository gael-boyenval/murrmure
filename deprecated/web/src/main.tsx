import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SessionList } from "./routes/SessionList";
import { SessionView } from "./routes/SessionView";
import "./styles.css";

const router = createBrowserRouter([
  { path: "/", element: <SessionList /> },
  { path: "/sessions/:key", element: <SessionView /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
