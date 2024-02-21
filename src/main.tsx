import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.scss";
import { ContentProvider } from "./contexts/contentContext.tsx";
import Layout from "./components/Layout/Layout.tsx";
import { HashRouter } from "react-router-dom";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <ContentProvider>
        <Layout />
      </ContentProvider>
    </HashRouter>
  </React.StrictMode>
);
