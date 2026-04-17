import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppProvider } from "./context/AppContext";
import "./App.css";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import AIAssistant from "./components/AIAssistant";
import HomePage from "./pages/HomePage";
import DoctorsPage from "./pages/DoctorsPage";
import DoctorDetailPage from "./pages/DoctorDetailPage";
import AuthPage from "./pages/AuthPage";
import ContactPage from "./pages/ContactPage";
import PortalPage from "./pages/PortalPage";
import AdminControlsPage from "./pages/AdminControlsPage";
import NotFoundPage from "./pages/NotFoundPage";

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  return null;
}

function ViewportReveal() {
  const location = useLocation();

  useEffect(() => {
    const revealVariants = ["reveal-rise", "reveal-glide", "reveal-sway", "reveal-pop"];
    const elements = Array.from(
      document.querySelectorAll(
        ".hero-section, .section, .section-heading, .hero-copy, .hero-visual, .filter-bar, .portal-toolbar, .panel, .metric-card, .timeline-item",
      ),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.08 },
    );

    elements.forEach((element, index) => {
      element.classList.add("scroll-reveal");
      revealVariants.forEach((variant) => element.classList.remove(variant));
      element.classList.add(revealVariants[index % revealVariants.length]);
      element.style.setProperty("--reveal-delay", `${(index % 4) * 36}ms`);
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      elements.forEach((element) => {
        element.classList.remove("scroll-reveal", "is-visible");
        revealVariants.forEach((variant) => element.classList.remove(variant));
      });
    };
  }, [location.pathname]);

  return null;
}

function AppShell() {
  const location = useLocation();

  return (
    <div className="site-shell">
      <ScrollToTop />
      <ViewportReveal />
      <AIAssistant />
      <SiteHeader />
      <main className="site-main">
        <div className="route-shell" key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/doctors" element={<DoctorsPage />} />
            <Route path="/doctors/:doctorId" element={<DoctorDetailPage />} />
            <Route path="/signin" element={<AuthPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/portal/admin-controls" element={<AdminControlsPage />} />
            <Route path="/workspace/:role" element={<Navigate replace to="/portal" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AppProvider>
  );
}
