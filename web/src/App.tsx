import { Route, Routes } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Docs from "./pages/Docs";
import Home from "./pages/Home";
import { Privacy, Security, Terms } from "./pages/Legal";
import Setup from "./pages/Setup";
import { Page } from "./components/ui";

function NotFound() {
  return <Page title="Page not found" lead="That page does not exist. Use the menu to find your way." children={null} />;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/security" element={<Security />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
