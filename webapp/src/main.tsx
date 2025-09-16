import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./main.css";

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
