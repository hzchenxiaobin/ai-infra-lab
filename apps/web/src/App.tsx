import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import BankPage from "./pages/bank/BankPage";
import { ProblemsPage } from "./pages/problems/ProblemsPage";
import ProblemListsPage from "./pages/problems/ProblemListsPage";
import ProblemListPage from "./pages/problems/ProblemListPage";
import ContestPage from "./pages/problems/ContestPage";
import ContestSessionPage from "./pages/problems/ContestSessionPage";
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
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<HomePage />} />
            <Route path="learn" element={<LearnPage />} />
            <Route path="learn/path" element={<LearnPage />} />
            <Route path="problems/gpu" element={<ProblemsPage partition="gpu" />} />
            <Route path="problems/algo" element={<ProblemsPage partition="algo" />} />
            <Route path="problems/lists" element={<ProblemListsPage />} />
            <Route path="problems/lists/:slug" element={<ProblemListPage />} />
            <Route path="problems/contest" element={<ContestPage />} />
            <Route path="problems/contest/:session" element={<ContestSessionPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="bank" element={<BankPage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="interview/:id" element={<InterviewPage />} />
            <Route path="judge/:id" element={<JudgePage />} />
            <Route path="report/:id" element={<ReportPage />} />
            <Route path="history" element={<HistoryPage />} />
          </Route>
          <Route
            path="*"
            element={<div className="py-20 text-center text-sm text-muted">页面不存在</div>}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
