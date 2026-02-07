import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
} else {
  console.error("Root element not found");
}