import './i18n';
import './App.css';
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Machete Fatal Runtime Exception">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
