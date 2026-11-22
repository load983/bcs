// ================== pages/teacher/TeacherDashboard.jsx ==================
import { Avatar, Icon, Badge } from '../admin/adminUi';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useSearchParams } from 'react-router-dom';
import QuickStart from '../../components/QuickStart';
import { useShellBadges } from '../../components/DashboardShell';
import { fetchMyExams, deleteExam } from '../../features/exam/examSlice';
import axiosClient from '../../api/axiosClient';
import { useLanguage } from '../../context/LanguageContext';
import SubscriptionBanner from '../../components/SubscriptionBanner';
import useTeacherFeatures from '../../hooks/useTeacherFeatures';
import { downloadBlob, fetchFileBlob, downloadFile } from '../../utils/download';
import PdfPreviewModal from '../../components/PdfPreviewModal';
import MessagesTab from './MessagesTab';
import MyDataExportButton from '../../components/MyDataExportButton';
import TeacherBackupPanel from '../../components/TeacherBackupPanel';
import UploadProgress from '../../components/UploadProgress';

const statusColor = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
  published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  closed: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

// অ্যাডমিন প্যানেলের মতো স্ট্যাট কার্ড
function Stat({ label, value, onClick }) {
  const body = (
    <>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-primary-700 dark:text-primary-300">{value}</div>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:ring-2 focus-visible:ring-primary-500">{body}</button>
    : <div className="card p-4">{body}</div>;
}

const TABS = ['overview', 'exams', 'pending', 'classes', 'students', 'messages'];

export default function TeacherDashboard() {
  const { t, locale } = useLanguage();
  const dispatch = useDispatch();
  const { exams: examList, loading, error } = useSelector((s) => s.exam);
  const { user } = useSelector((s) => s.auth);
  const { status: subStatus, has, warnLocked, lockedMessage } = useTeacherFeatures();

  // Tab state: 'exams' অথবা 'students'
  // সক্রিয় ট্যাব URL-এ থাকে (?tab=...) — সাইডবারের লিংক এটাই বদলায়
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'overview';
  const setActiveTab = (k) => setSearchParams(k === 'overview' ? {} : { tab: k });
  const [searchTerm, setSearchTerm] = useState('');
  const [pdfPreview, setPdfPreview] = useState(null);

  // Student state
  const [students, setStudents] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [rollEdit, setRollEdit] = useState(null);
  const [rollEditError, setRollEditError] = useState('');
  const [rollSaving, setRollSaving] = useState(false);
  // 🎓 শ্রেণী ও প্রতি শ্রেণীর এক্সেস কোড
  const [classes, setClasses] = useState([]);
  const [presets, setPresets] = useState([]);
  const [classFilter, setClassFilter] = useState('all');
  const [newClassName, setNewClassName] = useState('');
  const [classMsg, setClassMsg] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [studentClassFilter, setStudentClassFilter] = useState('all');
  const [studentForm, setStudentForm] = useState({ name: '', phone: '', roll: '', password: '', classId: '' });
  const [createdCredential, setCreatedCredential] = useState(null);
  const [studentImportProgress, setStudentImportProgress] = useState(null);
  const [showStudentGrid, setShowStudentGrid] = useState(false);
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 5 }, () => ({ name: '', phone: '', roll: '', password: '', classId: '' })));

  const allExams = Array.isArray(examList) ? examList : [];
  const exams = allExams.filter((e) => !e.pending); // চূড়ান্ত পরীক্ষা
  const pendingExams = allExams.filter((e) => e.pending); // ⏳ অসম্পূর্ণ (পেন্ডিং) পরীক্ষা

  const loadClasses = useCallback(() => {
    axiosClient
      .get('/classes')
      .then(({ data }) => {
        setClasses(data.classes || []);
        setPresets(data.presets || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handleCreateClass = async (name) => {
    const finalName = String(name ?? newClassName).trim();
    if (!finalName) return;
    if (!has('classes')) return warnLocked('classes');
    setClassMsg('');
    try {
      await axiosClient.post('/classes', { name: finalName });
      setNewClassName('');
      loadClasses();
    } catch (err) {
      setClassMsg(err.response?.data?.message || t('classes.createFailed'));
    }
  };

  const handleDeleteClass = async (cls) => {
    if (!window.confirm(t('classes.confirmDelete', { name: cls.name }))) return;
    try {
      await axiosClient.delete(`/classes/${cls._id}`);
      if (classFilter === cls._id) setClassFilter('all');
      loadClasses();
    } catch (err) {
      alert(err.response?.data?.message || t('classes.deleteFailed'));
    }
  };

  const handleCopyCode = (cls) => {
    navigator.clipboard
      ?.writeText(cls.accessCode)
      .then(() => {
        setCopiedId(cls._id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(() => {});
  };

  const remainingPresets = presets.filter((p) => !classes.some((c) => c.name === p));

  // স্ট্যাটাস (draft/published/closed) এর অনুবাদ; অচেনা স্ট্যাটাস হলে যেমন আছে তেমনই দেখাবে
  const statusLabel = (status) => {
    const key = `status.${status}`;
    const label = t(key);
    return label === key ? status : label;
  };

  // 🔍 সার্চ টার্ম অনুযায়ী পরীক্ষা ফিল্টার করা
  const filteredExams = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const examClassIds = (exam) => {
      const ids = (exam.classRefs || []).map((c) => c._id || c);
      return ids.length ? ids : ['none'];
    };
    return exams.filter((exam) => {
      if (classFilter !== 'all' && !examClassIds(exam).includes(classFilter)) return false;
      if (!term) return true;
      return (
        exam.title?.toLowerCase().includes(term) ||
        exam.status?.toLowerCase().includes(term) ||
        exam.examCode?.toLowerCase().includes(term)
      );
    });
  }, [exams, searchTerm, classFilter]);

  // ⏳ পেন্ডিং পরীক্ষা (নাম দিয়ে সার্চ)
  const filteredPending = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return pendingExams.filter((e) => !term || e.title?.toLowerCase().includes(term));
  }, [pendingExams, searchTerm]);

  const fmtTime = (d) => {
    try {
      return new Date(d).toLocaleString(locale || undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return '';
    }
  };

  // 🔍 সার্চ টার্ম অনুযায়ী শিক্ষার্থী ফিল্টার করা
  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return students.filter((s) => {
      if (studentClassFilter !== 'all' && !(s.classes || []).some((c) => c._id === studentClassFilter)) return false;
      if (!term) return true;
      return (
        s.name?.toLowerCase().includes(term) ||
        s.roll?.toLowerCase().includes(term) ||
        s.phone?.toLowerCase().includes(term)
      );
    });
  }, [students, searchTerm, studentClassFilter]);

  useEffect(() => {
    if (subStatus && has('manageExams')) dispatch(fetchMyExams());
  }, [dispatch, subStatus]);

  // শিক্ষার্থী ডাটা ফেচ করা
  useEffect(() => {
    if (activeTab === 'students') {
      setStudentLoading(true);
      setStudentError('');
      axiosClient
        .get('/auth/students')
        .then((res) => {
          setStudents(res.data);
          setStudentLoading(false);
        })
        .catch((err) => {
          setStudentError(err.response?.data?.message || t('dash.studentsLoadError'));
          setStudentLoading(false);
        });
    }
  }, [activeTab]);

  // 🗑️ পরীক্ষা ডিলিট হ্যান্ডলার
  const handleDelete = async (exam) => {
    const confirmed = window.confirm(
      t('dash.confirmDelete', { title: exam.title })
    );

    if (confirmed) {
      try {
        await dispatch(deleteExam(exam._id)).unwrap();
        dispatch(fetchMyExams());
      } catch (err) {
        alert(typeof err === 'string' ? err : t('dash.deleteFailed'));
      }
    }
  };

  // 📥 এক্সেল ফাইল ডাউনলোড হ্যান্ডলার
  const handleExportStudents = async () => {
    try {
      const response = await axiosClient.get('/auth/students/export', {
        responseType: 'blob',
        params: studentClassFilter !== 'all' ? { classId: studentClassFilter } : {},
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'students_list.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(t('dash.excelFailed'));
    }
  };

  // 📄 পরীক্ষার PDF (প্রশ্নপত্র অথবা উত্তরসহ)
  const [pdfBusy, setPdfBusy] = useState('');
  const handleExamPdf = async (exam, withAnswers) => {
    if (!has('downloadExamPdf')) return warnLocked('downloadExamPdf');
    const key = `${exam._id}:${withAnswers ? 1 : 0}`;
    const filename = `${exam.title}-${withAnswers ? t('exam.pdfWithAnswers') : t('exam.pdfQuestions')}.pdf`;
    setPdfBusy(key);
    try {
      const blob = await fetchFileBlob(`/exams/${exam._id}/pdf`, { ...(withAnswers ? { answers: 1 } : {}), preview: 1 });
      if (pdfPreview?.url) window.URL.revokeObjectURL(pdfPreview.url);
      setPdfPreview({ blob, url: window.URL.createObjectURL(blob), filename });
    } catch (err) { alert(err.message); }
    finally { setPdfBusy(''); }
  };

  const closePdfPreview = () => {
    if (pdfPreview?.url) window.URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  };

  // 🚫 শিক্ষার্থীকে ব্যান / আনব্যান
  const handleToggleBan = async (student) => {
    const willBan = !student.banned;
    if (willBan && !window.confirm(t('dash.banConfirm', { name: student.name }))) return;
    try {
      await axiosClient.patch(`/auth/students/${student._id}/ban`, { banned: willBan });
      setStudents((list) => list.map((s) => (s._id === student._id ? { ...s, banned: willBan } : s)));
    } catch (err) {
      alert(err.response?.data?.message || t('dash.banFailed'));
    }
  };

  const saveStudentRoll = async () => {
    if (!rollEdit) return;
    setRollSaving(true);
    setRollEditError('');
    try {
      const { data } = await axiosClient.patch(`/auth/students/${rollEdit.id}/roll`, { roll: rollEdit.roll });
      setStudents((list) => list.map((student) => student._id === rollEdit.id ? { ...student, roll: data.roll } : student));
      setRollEdit(null);
    } catch (err) {
      setRollEditError(err.response?.data?.message || 'রোল নম্বর আপডেট করা যায়নি');
    } finally {
      setRollSaving(false);
    }
  };

  const goTab = (k) => { setActiveTab(k); setSearchTerm(''); };

  const createStudent = async (e) => {
    e.preventDefault();
    try {
      const { data } = await axiosClient.post('/auth/students/create', studentForm);
      setCreatedCredential(data.credential); setStudentForm({ name: '', phone: '', roll: '', password: '', classId: '' });
      setStudentLoading(true); const refreshed = await axiosClient.get('/auth/students'); setStudents(refreshed.data); setStudentLoading(false);
    } catch (err) { alert(err.response?.data?.message || 'স্টুডেন্ট account তৈরি করা যায়নি'); }
  };
  const importStudents = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    setStudentImportProgress(0);
    try { const { data } = await axiosClient.post('/auth/students/import', fd, { onUploadProgress: (event) => event.total && setStudentImportProgress(Math.round((event.loaded / event.total) * 100)) }); setCreatedCredential(data.created?.[0] || null); alert(`${data.message}${data.failed?.length ? `; ${data.failed.length}টি row ব্যর্থ` : ''}`); const refreshed = await axiosClient.get('/auth/students'); setStudents(refreshed.data); } catch (err) { alert(err.response?.data?.message || 'Import ব্যর্থ হয়েছে'); }
    finally { setStudentImportProgress(null); }
  };
  const updateBulkRow = (index, key, value) => setBulkRows((rows) => rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const addBulkRows = (count = 5) => setBulkRows((rows) => [...rows, ...Array.from({ length: count }, () => ({ name: '', phone: '', roll: '', password: '', classId: '' }))]);
  const submitBulkRows = async () => {
    const rows = bulkRows.filter((r) => r.name.trim() || r.phone.trim());
    if (!rows.length) return alert('কমপক্ষে একজন শিক্ষার্থীর নাম ও মোবাইল নম্বর দিন');
    if (rows.some((r) => !r.name.trim() || !r.phone.trim() || !r.classId)) return alert('প্রতিটি পূরণ করা row-তে নাম, মোবাইল ও শ্রেণী দিতে হবে');
    try {
      const { data } = await axiosClient.post('/auth/students/bulk-create', { rows });
      setCreatedCredential(data.created?.[0] || null);
      alert(`${data.message}${data.failed?.length ? `; ${data.failed.length}টি row ব্যর্থ` : ''}`);
      setBulkRows(Array.from({ length: 5 }, () => ({ name: '', phone: '', roll: '', password: '', classId: '' })));
      const refreshed = await axiosClient.get('/auth/students'); setStudents(refreshed.data);
    } catch (err) { alert(err.response?.data?.message || 'Bulk account তৈরি করা যায়নি'); }
  };

  useShellBadges({ pending: pendingExams.length });

  // একটি পরীক্ষার অ্যাকশন বাটন (এডিট / রেজাল্ট / PDF / ডিলিট)
  const examActions = (exam) => (
    <div className="flex flex-wrap gap-1">
      <Link to={`/teacher/exam/${exam._id}`} className="btn-secondary !px-2 !py-1 text-xs">{t('dash.editSettings')}</Link>
      {has('results') ? (
        <Link to={`/teacher/exam/${exam._id}/results`} className="btn-secondary !px-2 !py-1 text-xs">{t('common.results')}</Link>
      ) : (
        <button onClick={() => warnLocked('results')} className="btn-secondary !px-2 !py-1 text-xs opacity-60">🔒 {t('common.results')}</button>
      )}
      {[false, true].map((withAns) => (
        <button
          key={withAns ? 'a' : 'q'}
          onClick={() => handleExamPdf(exam, withAns)}
          disabled={!!pdfBusy}
          title={withAns ? t('exam.pdfAnswersTitle') : t('exam.pdfQuestionsTitle')}
          className={`btn-secondary !px-2 !py-1 text-xs ${has('downloadExamPdf') ? '' : 'opacity-60'}`}
        >
          {has('downloadExamPdf') ? '📄' : '🔒'} {pdfBusy === `${exam._id}:${withAns ? 1 : 0}` ? '...' : (withAns ? t('exam.pdfWithAnswers') : t('exam.pdfQuestions'))}
        </button>
      ))}
      <button onClick={() => handleDelete(exam)} className="btn-danger !px-2 !py-1 text-xs">{t('common.delete')}</button>
    </div>
  );

  const examTitleCell = (exam) => (
    <div>
      <div className="font-medium dark:text-white">{exam.title}</div>
      <div className="font-mono text-xs text-gray-500">{exam.examCode}</div>
    </div>
  );

  const classNamesOf = (exam) => (exam.classRefs?.length ? t('classes.classNames', { names: exam.classRefs.map((c) => c.name).join(', ') }) : t('classes.noClass'));

  const canCreate = activeTab === 'overview' || activeTab === 'exams' || activeTab === 'pending';

  return (
    <div>
      <main className="min-w-0 space-y-4">
        <SubscriptionBanner status={subStatus} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold dark:text-white">
            {activeTab === 'overview' ? t('dash.welcome', { name: user?.name || t('dash.teacherFallback') }) : t(`t.tab.${activeTab}`)}
          </h1>
          {canCreate ? (
            <div className="flex flex-wrap gap-2">
              {has('createExam') ? (
                <Link to="/teacher/create" className="btn-primary">{t('dash.newExamOnline')}</Link>
              ) : (
                <button onClick={() => warnLocked('createExam')} className="btn-primary opacity-60">🔒 {t('dash.newExamOnline')}</button>
              )}
              {has('uploadExam') ? (
                <Link to="/teacher/upload" className="btn-secondary">{t('dash.newExam')}</Link>
              ) : (
                <button onClick={() => warnLocked('uploadExam')} className="btn-secondary opacity-60">🔒 {t('dash.newExam')}</button>
              )}
            </div>
          ) : activeTab === 'students' ? (
            <button
              onClick={has('exportStudents') ? handleExportStudents : () => warnLocked('exportStudents')}
              className={`btn-success ${has('exportStudents') ? '' : 'opacity-60'}`}
            >
              {has('exportStudents') ? '' : '🔒 '}
              {t('dash.downloadExcel')}
            </button>
          ) : null}
          <MyDataExportButton />
        </div>

        {/* ---------- ওভারভিউ ---------- */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label={t('t.stat.exams')} value={exams.length} onClick={() => goTab('exams')} />
              <Stat label={t('t.stat.pending')} value={pendingExams.length} onClick={() => goTab('pending')} />
              <Stat label={t('t.stat.classes')} value={classes.length} onClick={() => goTab('classes')} />
            </div>
            <QuickStart
              title={t('qs.title')}
              subtitle={t('qs.teacher.sub')}
              steps={[
                { icon: 'tag', title: t('qs.teacher.1.t'), body: t('qs.teacher.1.b'), to: '/teacher/dashboard?tab=classes' },
                { icon: 'plus', title: t('qs.teacher.2.t'), body: t('qs.teacher.2.b'), to: '/teacher/create' },
                { icon: 'file', title: t('qs.teacher.3.t'), body: t('qs.teacher.3.b'), to: '/teacher/dashboard?tab=exams' },
                { icon: 'chart', title: t('qs.teacher.4.t'), body: t('qs.teacher.4.b'), to: '/teacher/dashboard?tab=students' },
              ]}
            />
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm text-gray-500">{t('t.recent')}</h2>
                {exams.length > 5 && <button className="act" onClick={() => goTab('exams')}>{t('t.viewAll')}</button>}
              </div>
              {loading ? (
                <div className="empty">{t('common.loading')}</div>
              ) : exams.length === 0 ? (
                <div className="empty">{t('dash.noExams')}</div>
              ) : (
                <div className="card overflow-x-auto !p-1">
                  <table className="admin-table">
                    <thead><tr><th>{t('t.col.exam')}</th><th>{t('t.col.class')}</th><th>{t('t.col.status')}</th><th>{t('t.col.actions')}</th></tr></thead>
                    <tbody className="dark:text-gray-200">
                      {exams.slice(0, 5).map((exam) => (
                        <tr key={exam._id} className="align-top">
                          <td>{examTitleCell(exam)}</td>
                          <td className="text-xs text-primary-700 dark:text-primary-300">{classNamesOf(exam)}</td>
                          <td><span className={`badge ${statusColor[exam.status] || statusColor.draft}`}>{statusLabel(exam.status)}</span></td>
                          <td>{examActions(exam)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ---------- শ্রেণী ও এক্সেস কোড ---------- */}
        {activeTab === 'classes' && (
          <>
      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold dark:text-white">{t('classes.title')}</h2>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('classes.desc')}</p>

        {classes.length > 0 && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {classes.map((c) => (
              <div key={c._id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div>
                  <p className="font-medium dark:text-white">{t('classes.className', { name: c.name })}</p>
                  <p className="text-xs text-gray-400">{t('classes.examCount', { n: c.examCount })}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-primary-50 px-3 py-1 font-mono font-bold tracking-widest text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                    {c.accessCode}
                  </span>
                  <button onClick={() => handleCopyCode(c)} className="btn-secondary !px-2 !py-1 text-xs">
                    {copiedId === c._id ? t('dash.accessCodeCopied') : t('dash.accessCodeCopy')}
                  </button>
                  <button onClick={() => handleDeleteClass(c)} className="text-red-500 text-sm" title={t('common.delete')}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mb-2 text-sm font-medium dark:text-gray-200">{t('classes.pickToCreate')}</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {remainingPresets.map((p) => (
            <button
              key={p}
              onClick={() => handleCreateClass(p)}
              className="rounded-full border border-gray-300 px-3 py-1 text-sm hover:border-primary-500 hover:text-primary-600 dark:border-white/10 dark:text-gray-300"
            >
              + {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:max-w-md">
          <input
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            placeholder={t('classes.customPlaceholder')}
            className="input"
          />
          <button onClick={() => handleCreateClass()} className="btn-primary shrink-0">
            {t('classes.create')}
          </button>
        </div>
        {classMsg && <p className="mt-2 text-sm text-red-600">{classMsg}</p>}
      </div>
          </>
        )}

        {/* 🔍 সার্চবার */}
        {['exams', 'pending', 'students'].includes(activeTab) && (
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={activeTab !== 'students' ? t('dash.searchExams') : t('dash.searchStudents')}
            className="input w-full bg-white sm:w-96 dark:bg-white/5"
          />
        )}

        {/* 📝 পরীক্ষা তালিকা */}
        {activeTab === 'exams' && (
          !has('manageExams') ? <div className="card p-6 text-center text-sm text-gray-600 dark:text-gray-300">🔒 {lockedMessage('manageExams')}</div> : <>
            <div className="flex flex-wrap gap-2">
              {[['all', t('classes.filterAll')], ...classes.map((c) => [c._id, c.name]), ['none', t('classes.filterNone')]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setClassFilter(key)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    classFilter === key
                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-primary-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {loading ? (
              <div className="empty">{t('common.loading')}</div>
            ) : error ? (
              <p className="text-red-500">{t('dash.examsLoadError', { error: String(error) })}</p>
            ) : exams.length === 0 ? (
              <div className="empty">{t('dash.noExams')}</div>
            ) : filteredExams.length === 0 ? (
              <div className="empty">{t('dash.noExamMatch', { term: searchTerm })}</div>
            ) : (
              <div className="card overflow-x-auto !p-1">
                <table className="admin-table">
                  <thead><tr><th>{t('t.col.exam')}</th><th>{t('t.col.class')}</th><th>{t('t.col.details')}</th><th>{t('t.col.status')}</th><th>{t('t.col.actions')}</th></tr></thead>
                  <tbody className="dark:text-gray-200">
                    {filteredExams.map((exam) => (
                      <tr key={exam._id} className="align-top">
                        <td>{examTitleCell(exam)}</td>
                        <td className="text-xs text-primary-700 dark:text-primary-300">{classNamesOf(exam)}</td>
                        <td className="text-xs text-gray-500 dark:text-gray-400">{t('dash.examMeta', { time: exam.settings?.totalTimeMinutes ?? '-', marks: exam.settings?.marksPerQuestion ?? '-' })}</td>
                        <td><span className={`badge ${statusColor[exam.status] || statusColor.draft}`}>{statusLabel(exam.status)}</span></td>
                        <td>{examActions(exam)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ⏳ পেন্ডিং (অসম্পূর্ণ) পরীক্ষা */}
        {activeTab === 'pending' && (
          !has('manageExams') ? <div className="card p-6 text-center text-sm text-gray-600 dark:text-gray-300">🔒 {lockedMessage('manageExams')}</div> : <>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('dash.pendingHelp')}</p>
            {loading ? (
              <div className="empty">{t('common.loading')}</div>
            ) : pendingExams.length === 0 ? (
              <div className="empty">{t('dash.noPending')}</div>
            ) : filteredPending.length === 0 ? (
              <div className="empty">{t('dash.noExamMatch', { term: searchTerm })}</div>
            ) : (
              <div className="card overflow-x-auto !p-1">
                <table className="admin-table">
                  <thead><tr><th>{t('t.col.exam')}</th><th>{t('t.col.details')}</th><th>{t('t.col.status')}</th><th>{t('t.col.actions')}</th></tr></thead>
                  <tbody className="dark:text-gray-200">
                    {filteredPending.map((exam) => (
                      <tr key={exam._id} className="align-top">
                        <td className="font-medium dark:text-white">{exam.title}</td>
                        <td className="text-xs text-gray-500 dark:text-gray-400">{t('dash.pendingMeta', { n: exam.pendingQuestionCount ?? 0, time: fmtTime(exam.updatedAt) })}</td>
                        <td><span className="badge bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">⏳ {t('dash.pendingBadge')}</span></td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Link to={`/teacher/create?pending=${exam._id}`} className="btn-secondary !px-2 !py-1 text-xs">{t('dash.pendingEdit')}</Link>
                            <button onClick={() => handleDelete(exam)} className="btn-danger !px-2 !py-1 text-xs">{t('common.delete')}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* 💬 ট্যাব ৩: Message with student */}
      {activeTab === 'messages' && <MessagesTab classes={classes} />}

        {/* 🎓 ট্যাব ২: নিবন্ধিত শিক্ষার্থী (Students Tab) */}
      {activeTab === 'students' && (
        <>
          <TeacherBackupPanel />
          <form onSubmit={createStudent} className="card mb-5 grid gap-2 p-4 sm:grid-cols-6">
            <strong className="sm:col-span-6 dark:text-white">নতুন student account</strong>
            <input className="input" required placeholder="নাম" value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} />
            <input className="input" required placeholder="মোবাইল নম্বর" value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} />
            <input className="input" placeholder="রোল (ফাঁকা হলে auto)" value={studentForm.roll} onChange={(e) => setStudentForm({ ...studentForm, roll: e.target.value })} />
            <input className="input" placeholder="পাসওয়ার্ড (ফাঁকা হলে auto)" value={studentForm.password} onChange={(e) => setStudentForm({ ...studentForm, password: e.target.value })} />
            <select className="input" required value={studentForm.classId} onChange={(e) => setStudentForm({ ...studentForm, classId: e.target.value })}><option value="">শ্রেণী বাছাই করুন</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select>
            <button className="btn-primary">Account তৈরি</button>
            <label className="btn-secondary cursor-pointer text-center">ফাইল import<input type="file" className="sr-only" accept=".csv,.xlsx,.pdf,.doc,.docx,.json,.txt" onChange={importStudents} /></label>
            <UploadProgress progress={studentImportProgress} label="Import হচ্ছে..." />
            <button type="button" className="btn-success" onClick={() => downloadFile('/auth/students/credentials/export', `student-credentials-${studentClassFilter}.xlsx`, studentClassFilter !== 'all' ? { classId: studentClassFilter } : {})}>এই শ্রেণীর Credentials Excel</button>
            <button type="button" className="btn-secondary" onClick={() => downloadFile('/auth/students/credentials/pdf', `student-credentials-${studentClassFilter}.pdf`, studentClassFilter !== 'all' ? { classId: studentClassFilter } : {})}>এই শ্রেণীর Credentials PDF</button>
            <span className="text-xs text-gray-500 sm:col-span-6">ফাইলের header: name, phone, roll, password, class. roll/password না দিলে automatically তৈরি হবে।</span>
          </form>
          <div className="card mb-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><strong className="dark:text-white">Excel-এর মতো সরাসরি অনেক শিক্ষার্থী যোগ করুন</strong><p className="text-xs text-gray-500">নাম ও মোবাইল দিন; Roll/Password ফাঁকা রাখলে auto হবে।</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={() => downloadFile('/auth/students/import-template', 'student-import-template.xlsx')}>Excel header template</button>
                <button type="button" className="btn-primary !px-3 !py-1 text-xs" onClick={() => setShowStudentGrid((v) => !v)}>{showStudentGrid ? 'টেবিল বন্ধ করুন' : 'টেবিল খুলুন'}</button>
              </div>
            </div>
            {showStudentGrid && <>
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
                <table className="min-w-[820px] w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs dark:bg-white/5"><tr><th className="p-2">#</th><th className="p-2">নাম *</th><th className="p-2">মোবাইল *</th><th className="p-2">Roll</th><th className="p-2">Password</th><th className="p-2">শ্রেণী *</th><th className="p-2"></th></tr></thead>
                  <tbody>{bulkRows.map((row, index) => <tr key={index} className="border-t border-gray-100 dark:border-white/10">
                    <td className="p-2 text-gray-500">{index + 1}</td>
                    {['name', 'phone', 'roll', 'password'].map((key) => <td key={key} className="p-2"><input className="input min-w-[130px]" placeholder={key === 'name' ? 'শিক্ষার্থীর নাম' : key === 'phone' ? '017...' : key === 'roll' ? 'Auto' : 'Auto'} value={row[key]} onChange={(e) => updateBulkRow(index, key, e.target.value)} /></td>)}
                    <td className="p-2"><select className="input min-w-[150px]" value={row.classId} onChange={(e) => updateBulkRow(index, 'classId', e.target.value)}><option value="">শ্রেণী বাছাই</option>{classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></td>
                    <td className="p-2"><button type="button" className="btn-danger !px-2 !py-1" onClick={() => setBulkRows((rows) => rows.length > 1 ? rows.filter((_, i) => i !== index) : rows)}>×</button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => addBulkRows(5)}>+ আরও ৫টি row</button><button type="button" className="btn-primary" onClick={submitBulkRows}>সব account তৈরি করুন</button></div>
            </>}
          </div>
          {createdCredential && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"><b>নতুন credential:</b> {createdCredential.name} · Login: {createdCredential.phone} · Roll: <span className="font-mono">{createdCredential.roll}</span> · Password: <span className="font-mono font-bold select-all">{createdCredential.password}</span></div>}
          {/* 🎓 প্রত্যেক শ্রেণীর আলাদা management option; export-ও এই নির্বাচনের উপর নির্ভর করে */}
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold dark:text-white">শ্রেণী অনুযায়ী শিক্ষার্থী ম্যানেজ করুন</h3><span className="text-xs text-gray-500">নির্দিষ্ট শ্রেণী বাছলে শুধু সেই শ্রেণীর তালিকা ও export হবে</span></div>
          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[['all', t('classes.filterAll')], ...classes.map((c) => [c._id, c.name])].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStudentClassFilter(key)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  studentClassFilter === key
                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-primary-400 dark:border-white/10 dark:bg-white/5 dark:text-gray-300'
                }`}
              >
                <span>{label}</span><span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/15">{key === 'all' ? students.length : students.filter((s) => (s.classes || []).some((c) => String(c._id) === String(key))).length}</span>
              </button>
            ))}
          </div>
          {studentLoading ? (
            <div className="empty">{t('dash.studentsLoading')}</div>
          ) : studentError ? (
            <p className="text-red-500">{studentError}</p>
          ) : students.length === 0 ? (
            <div className="empty">{t('dash.noStudents')}</div>
          ) : filteredStudents.length === 0 ? (
            <div className="empty">{t('dash.noStudentMatch', { term: searchTerm })}</div>
          ) : (
            <div className="card !p-1">
              <div className="overflow-x-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('common.name')}</th>
                      <th>{t('common.roll')}</th>
                      <th>{t('dash.colMobile')}</th>
                      <th>{t('dash.colClass')}</th>
                      <th>{t('dash.colRegDate')}</th>
                      <th>{t('dash.colStatus')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody className="dark:text-gray-200">
                    {filteredStudents.map((s, index) => (
                      <tr key={s._id}>
                        <td>{index + 1}</td>
                        <td className="font-medium"><div className="flex items-center gap-3"><Avatar name={s.name} />{s.name}</div></td>
                        <td>
                          {rollEdit?.id === s._id ? (
                            <div className="min-w-40 space-y-1">
                              <div className="flex items-center gap-1">
                                <input aria-label={`${s.name} রোল নম্বর`} className="input w-28 !px-2 !py-1" inputMode="numeric" value={rollEdit.roll} onChange={(e) => { setRollEdit({ ...rollEdit, roll: e.target.value }); setRollEditError(''); }} />
                                <button type="button" className="btn-primary !px-2 !py-1 text-xs" disabled={rollSaving} onClick={saveStudentRoll}>{rollSaving ? '...' : 'সংরক্ষণ'}</button>
                                <button type="button" className="btn-secondary !px-2 !py-1 text-xs" disabled={rollSaving} onClick={() => { setRollEdit(null); setRollEditError(''); }}>বাতিল</button>
                              </div>
                              {rollEditError && <p role="alert" className="text-xs text-red-600">{rollEditError}</p>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2"><span>{s.roll || '-'}</span><button type="button" className="act" onClick={() => { setRollEdit({ id: s._id, roll: s.roll || '' }); setRollEditError(''); }}>এডিট</button></div>
                          )}
                        </td>
                        <td>{s.phone || '-'}</td>
                        <td>{s.classes?.length ? s.classes.map((c) => c.name).join(', ') : '-'}</td>
                        <td>
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString(locale) : '-'}
                        </td>
                        <td>
                          <span className={`badge ${s.banned ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                            {s.banned ? t('dash.statusBanned') : t('dash.statusActive')}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleToggleBan(s)}
                            className={s.banned ? 'act' : 'act-danger'}
                          >
                            {s.banned ? t('dash.unban') : t('dash.ban')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      </main>
      <PdfPreviewModal
        url={pdfPreview?.url}
        filename={pdfPreview?.filename}
        title={t('exam.pdfPreview')}
        previewLabel={t('exam.pdfPreviewLabel')}
        downloadLabel={t('exam.pdfDownloadAfterPreview')}
        closeLabel={t('exam.pdfClosePreview')}
        onDownload={() => downloadBlob(pdfPreview.blob, pdfPreview.filename)}
        onClose={closePdfPreview}
      />
    </div>
  );
}
