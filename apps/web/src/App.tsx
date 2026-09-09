import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import BankPage from "./pages/bank/BankPage";
import { ProblemsPage } from "./pages/problems/ProblemsPage";
import LearnPage from "./pages/learn/LearnPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import SearchPage from "./pages/SearchPage";
import InterviewPage from "./pages/InterviewPage";
import JudgePage from "./pages/JudgePage";
import ReportPage from "./pages/ReportPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="learn" element={<LearnPage />} />
          <Route path="problems/gpu" element={<ProblemsPage partition="gpu" />} />
          <Route path="problems/algo" element={<ProblemsPage partition="algo" />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="bank" element={<BankPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="interview/:id" element={<InterviewPage />} />
          <Route path="judge/:id" element={<JudgePage />} />
          <Route path="report/:id" element={<ReportPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route
            path="*"
            element={<div className="py-20 text-center text-sm text-muted">页面不存在</div>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
