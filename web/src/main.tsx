import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { PdvCartProvider } from "./lib/pdvCart";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <PdvCartProvider>
        <App />
      </PdvCartProvider>
    </AuthProvider>
  </React.StrictMode>
);
