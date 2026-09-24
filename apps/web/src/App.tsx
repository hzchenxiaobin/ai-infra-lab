import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import LandingPage from "./pages/LandingPage";
import { LandingShell } from "./components/LandingShell";
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
import NotesPage from "./pages/NotesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 首页落地页 + 刷题/面试板块：独立壳（自带导航/页脚，GitHub 暗色 + 蓝强调，版式对齐 ai-infra-notes），沿用原首页的登录守卫 */}
        <Route element={<RequireAuth />}>
          <Route index element={<LandingPage />} />
          {/* 刷题/面试板块：与首页同款落地壳，导航高亮当前分区 */}
          <Route element={<LandingShell />}>
            <Route path="problems/gpu" element={<ProblemsPage partition="gpu" />} />
            <Route path="problems/algo" element={<ProblemsPage partition="algo" />} />
            <Route path="problems/lists" element={<ProblemListsPage />} />
            <Route path="problems/lists/:slug" element={<ProblemListPage />} />
            <Route path="problems/contest" element={<ContestPage />} />
            <Route path="problems/contest/:session" element={<ContestSessionPage />} />
            {/* 面试板块：组卷 / 题库 / 历史 / 复盘笔记 / 面试间 / 报告 / 评测 */}
            <Route path="start" element={<HomePage />} />
            <Route path="bank" element={<BankPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="notes" element={<NotesPage />} />
            <Route path="interview/:id" element={<InterviewPage />} />
            <Route path="report/:id" element={<ReportPage />} />
            <Route path="judge/:id" element={<JudgePage />} />
          </Route>
        </Route>
        <Route element={<Layout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route element={<RequireAuth />}>
            <Route path="learn" element={<LearnPage />} />
            <Route path="learn/path" element={<LearnPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="search" element={<SearchPage />} />
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
