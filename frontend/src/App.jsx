import MobileTabBar from './components/MobileTabBar';
import InstallPrompt from './components/InstallPrompt';
import React, { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import DashboardShell from './components/DashboardShell';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import BackgroundWallpaper from './components/BackgroundWallpaper';
import SplashScreen from './components/SplashScreen';
import HelplineWidget from './components/HelplineWidget';
import AiAssistantWidget from './components/AiAssistantWidget';

const Home = lazy(() => import('./pages/Home'));
const StudentHome = lazy(() => import('./pages/StudentHome'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SitePage = lazy(() => import('./pages/SitePage'));
const RoleGuide = lazy(() => import('./pages/RoleGuide'));

const StudentAuth = lazy(() => import('./pages/student/StudentAuthPage'));

const TeacherLogin = lazy(() => import('./pages/teacher/TeacherLogin'));
const TeacherPasswordReset = lazy(() => import('./pages/teacher/TeacherPasswordReset'));
const TeacherRegister = lazy(() => import('./pages/teacher/TeacherRegister'));
const TeacherDashboard = lazy(() => import('./pages/teacher/TeacherDashboard'));
const UploadExam = lazy(() => import('./pages/teacher/UploadExam'));
const CreateMcqExam = lazy(() => import('./pages/teacher/CreateMcqExam'));
const ExamEditor = lazy(() => import('./pages/teacher/ExamEditor'));
const ResultDashboard = lazy(() => import('./pages/teacher/ResultDashboard'));

const StudentJoin = lazy(() => import('./pages/student/StudentJoin'));
const StudentExam = lazy(() => import('./pages/student/StudentExam'));
const StudentResult = lazy(() => import('./pages/student/StudentResult'));
const PastExams = lazy(() => import('./pages/student/PastExams'));
const Leaderboard = lazy(() => import('./pages/student/Leaderboard'));
const Notifications = lazy(() => import('./pages/student/Notifications'));
const TeacherNotifications = lazy(() => import('./pages/teacher/TeacherNotifications'));
const Subscribe = lazy(() => import('./pages/teacher/Subscribe'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));

// কোন পেজে সাইডবার-ড্যাশবোর্ড ফ্রেম দেখাবে (লগইন করা role অনুযায়ী)
function shellRoleFor(user, pathname) {
  if (!user) return null;
  if (user.role === 'admin' && /^\/admin\/(dashboard|guide)/.test(pathname)) return 'admin';
  if (user.role === 'teacher' && /^\/teacher\/(dashboard|upload|create|exam|subscribe|notifications|guide)/.test(pathname)) return 'teacher';
  if (user.role === 'student' && /^\/(exams(\/|$)|notifications|student\/guide$)/.test(pathname)) return 'student';
  return null;
}

export default function App() {
  const { user } = useSelector((s) => s.auth);
  const { pathname } = useLocation();
  const shellRole = shellRoleFor(user, pathname);

  const routes = (
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center">Loading…</div>}>
      <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/page/:slug" element={<SitePage />} />

          {/* ---------- Student পোর্টাল ও অথেন্টিকেশন ---------- */}
          <Route path="/exams" element={<StudentHome />} />
          <Route path="/exams/past" element={<PastExams />} />
          <Route path="/exams/:examId/leaderboard" element={<Leaderboard />} />
          <Route path="/student/auth" element={<StudentAuth />} />
          <Route
            path="/notifications"
            element={<PrivateRoute role="student"><Notifications /></PrivateRoute>}
          />
          <Route path="/student/guide" element={<PrivateRoute role="student"><RoleGuide role="student" /></PrivateRoute>} />

          {/* ---------- Teacher রুট ---------- */}
          <Route path="/teacher/login" element={<TeacherLogin />} />
          <Route path="/teacher/reset-password" element={<TeacherPasswordReset />} />
          <Route path="/teacher/register" element={<TeacherRegister />} />
          <Route
            path="/teacher/dashboard"
            element={<PrivateRoute role="teacher"><TeacherDashboard /></PrivateRoute>}
          />
          <Route path="/teacher/guide" element={<PrivateRoute role="teacher"><RoleGuide role="teacher" /></PrivateRoute>} />
          <Route
            path="/teacher/upload"
            element={<PrivateRoute role="teacher"><UploadExam /></PrivateRoute>}
          />
          <Route
            path="/teacher/create"
            element={<PrivateRoute role="teacher"><CreateMcqExam /></PrivateRoute>}
          />
          <Route
            path="/teacher/exam/:id"
            element={<PrivateRoute role="teacher"><ExamEditor /></PrivateRoute>}
          />
          <Route
            path="/teacher/exam/:id/results"
            element={<PrivateRoute role="teacher"><ResultDashboard /></PrivateRoute>}
          />

          <Route
            path="/teacher/notifications"
            element={<PrivateRoute role="teacher"><TeacherNotifications /></PrivateRoute>}
          />

          <Route
            path="/teacher/subscribe"
            element={<PrivateRoute role="teacher"><Subscribe /></PrivateRoute>}
          />

          {/* ---------- Admin রুট ---------- */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin/dashboard"
            element={<PrivateRoute role="admin"><AdminDashboard /></PrivateRoute>}
          />
          <Route path="/admin/guide" element={<PrivateRoute role="admin"><RoleGuide role="admin" /></PrivateRoute>} />

          {/* ---------- Student রুট (পাবলিক লিংক দিয়ে জয়েন) ---------- */}
          <Route path="/join/:code" element={<StudentJoin />} />
          <Route path="/exam/live" element={<StudentExam />} />
          <Route path="/exam/result" element={<StudentResult />} />

          {/* ---------- 404 ---------- */}
          <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );

  if (shellRole) {
    return (
      <>
        <SplashScreen />
        <DashboardShell role={shellRole}>{routes}</DashboardShell>
        <InstallPrompt />
        <HelplineWidget />
        <AiAssistantWidget />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SplashScreen />
      <BackgroundWallpaper />
      <Navbar />
      <main className="flex-1">
        {routes}
      </main>
      <Footer />
      <MobileTabBar />
      <InstallPrompt />
      <HelplineWidget />
        <AiAssistantWidget />
    </div>
  );
}
