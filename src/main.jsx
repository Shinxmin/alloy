import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import GridPortfolioView from "./GridPortfolioView.jsx";

const isGridView = new URLSearchParams(window.location.search).get("view") === "grid";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isGridView ? <GridPortfolioView /> : <App />}
  </React.StrictMode>
);
