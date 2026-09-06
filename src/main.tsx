import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { Provider } from "./components/ui/provider";
import { Toaster } from "./components/ui/toaster";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Provider>
      <App />
      <Toaster />
    </Provider>
  </StrictMode>,
);
