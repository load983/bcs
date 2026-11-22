// ================== components/AiAssistantWidget.jsx ==================
// সব পেজে বাম-নিচে ভাসমান "AI সহকারী" বাটন (ডান-নিচে 🎧 হেল্পলাইন আছে, তাই মুখোমুখি হয় না)।
// বাংলা ও English — ইউজার যে ভাষায় লিখবে AI সেই ভাষায় উত্তর দেবে। সূত্র ($...$, \ce{...}) MathText দিয়ে সুন্দরভাবে দেখায়।
// লাইভ পরীক্ষা (/exam/live) ও অ্যাডমিন পেজে বাটন দেখানো হয় না।
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axiosClient from '../api/axiosClient';
import { useLanguage } from '../context/LanguageContext';
import MathText from './MathText';
import { openHelpline } from './HelplineWidget';
import { clampWidgetPosition, loadWidgetPosition, saveWidgetPosition } from '../utils/floatingWidgetPosition';
import useTeacherFeatures from '../hooks/useTeacherFeatures';

const STORE_KEY = 'ai-assistant-chat';
const MAX_SEND = 12;
const RAIL_TOP_KEY = 'ai-assistant-rail-top';

const TXT = {
  bn: {
    title: 'AI সহকারী',
    subtitle: 'বাংলা বা English — যেভাবে খুশি জিজ্ঞেস করো',
    hello: 'আসসালামু আলাইকুম! আমি UPMCQ সহকারী 👋 ওয়েবসাইট ব্যবহার বা পড়াশোনার যেকোনো প্রশ্ন বাংলা বা English-এ করতে পারো।',
    placeholder: 'এখানে লেখো… (Type in Bangla or English)',
    send: 'পাঠাও',
    thinking: 'ভাবছি…',
    clear: 'নতুন চ্যাট',
    error: 'উত্তর আনা যায়নি। আবার চেষ্টা করো।',
    human: '🎧 অ্যাডমিনের সাথে কথা বলো',
    disclaimer: 'AI ভুল করতে পারে — গুরুত্বপূর্ণ বিষয় যাচাই করে নাও।',
    chips: {
      teacher: ['কীভাবে PDF থেকে পরীক্ষা তৈরি করব?', 'Negative marking কীভাবে সেট করব?', 'স্টুডেন্টদের এক্সেস কোড কোথায় পাব?', 'রেজাল্ট Excel-এ নামাব কীভাবে?'],
      student: ['কীভাবে পরীক্ষায় জয়েন করব?', 'আমার আগের পরীক্ষার ফল কোথায় দেখব?', 'Newton-এর ২য় সূত্র সহজে বুঝিয়ে দাও', 'Explain mole concept simply'],
      guest: ['এই ওয়েবসাইটে কী কী সুবিধা আছে?', 'How do I join an exam?', 'শিক্ষক হিসেবে কীভাবে শুরু করব?', 'সাবস্ক্রিপশন কীভাবে কাজ করে?'],
    },
  },
  en: {
    title: 'AI Assistant',
    subtitle: 'Ask in Bangla or English — whichever you like',
    hello: 'Hi! I\'m the UPMCQ assistant 👋 Ask me anything about using this website or about your studies — in English or Bangla (বাংলা).',
    placeholder: 'Type here… (বাংলা বা English)',
    send: 'Send',
    thinking: 'Thinking…',
    clear: 'New chat',
    error: 'Couldn\'t get a reply. Please try again.',
    human: '🎧 Talk to the admin',
    disclaimer: 'AI can make mistakes — please double-check important things.',
    chips: {
      teacher: ['How do I create an exam from a PDF?', 'How do I set negative marking?', 'Where do I find the class access code?', 'How do I download results as Excel?'],
      student: ['How do I join an exam?', 'Where can I see my past results?', 'Explain Newton\'s second law simply', 'নিউটনের গতিসূত্র বুঝিয়ে দাও'],
      guest: ['What can I do on this website?', 'কীভাবে পরীক্ষায় জয়েন করব?', 'How do I start as a teacher?', 'How does the subscription work?'],
    },
  },
};

const loadSaved = () => {
  try {
    const arr = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-40) : [];
  } catch { return []; }
};

export default function AiAssistantWidget() {
  const { user } = useSelector((s) => s.auth);
  const { pathname } = useLocation();
  const { lang } = useLanguage();
  const { status, has } = useTeacherFeatures();
  const L = TXT[lang === 'en' ? 'en' : 'bn'];

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadSaved);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [railPosition, setRailPosition] = useState(() => loadWidgetPosition(RAIL_TOP_KEY, { x: 88, y: 46 }));
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const abortRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  const hidden = user?.role === 'admin' || pathname.startsWith('/admin') || pathname.startsWith('/exam/live');
  const aiLocked = user?.role === 'teacher' && !!status?.featureLimited && !has('aiAssistant');

  useEffect(() => {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* ignore */ }
  }, [messages]);

  // ইউজার বদলালে (লগইন/লগআউট) আগের চ্যাট মুছে দাও
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setMessages([]); setError('');
  }, [user?.id, user?._id, user?.role]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, loading, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150); }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const keepInView = () => setRailPosition((position) => clampWidgetPosition(position.x, position.y));
    window.addEventListener('resize', keepInView);
    return () => window.removeEventListener('resize', keepInView);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const dismissOutside = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const dismissOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [open]);

  if (hidden) return null;

  const ask = async (raw) => {
    const content = String(raw || '').trim().slice(0, 2000);
    if (!content || loading) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setText(''); setError(''); setLoading(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data } = await axiosClient.post(
        '/ai/chat',
        { messages: next.slice(-MAX_SEND), page: pathname },
        { signal: ctrl.signal, timeout: 45000 }
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      if (err.code === 'ERR_CANCELED') return;
      setError(err.response?.data?.message || L.error);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(text); }
  };

  const newChat = () => { abortRef.current?.abort(); setMessages([]); setError(''); setLoading(false); setText(''); };
  const chips = L.chips[user?.role === 'teacher' ? 'teacher' : user?.role === 'student' ? 'student' : 'guest'];

  const handleRailPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosition: railPosition, position: railPosition, moved: false };
  };
  const handleRailPointerMove = (e) => {
    if (!dragRef.current) return;
    const deltaX = ((e.clientX - dragRef.current.startX) / window.innerWidth) * 100;
    const deltaY = ((e.clientY - dragRef.current.startY) / window.innerHeight) * 100;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) dragRef.current.moved = true;
    dragRef.current.position = clampWidgetPosition(dragRef.current.startPosition.x + deltaX, dragRef.current.startPosition.y + deltaY);
    setRailPosition(dragRef.current.position);
  };
  const handleRailPointerUp = (e) => {
    if (!dragRef.current) return;
    suppressClickRef.current = dragRef.current.moved;
    const finalPosition = dragRef.current.position;
    dragRef.current = null;
    saveWidgetPosition(RAIL_TOP_KEY, finalPosition);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const toggleOpen = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    setOpen((v) => !v);
  };

  return (
    <>
      {/* ---------- ডান পাশের vertical AI Assistant tab ---------- */}
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        onPointerDown={handleRailPointerDown}
        onPointerMove={handleRailPointerMove}
        onPointerUp={handleRailPointerUp}
        style={{ left: `${railPosition.x}%`, top: `${railPosition.y}%` }}
        aria-label={open ? (lang === 'en' ? 'Close AI assistant' : 'AI সহকারী বন্ধ করুন') : L.title}
        aria-expanded={open}
        aria-controls="ai-assistant-panel"
        className="support-rail-button support-rail-ai bg-gradient-to-b from-violet-600 to-primary-600 text-white shadow-lg shadow-violet-600/40 hover:brightness-110"
      >
        <span aria-hidden="true" className="text-xl leading-none">{open ? '✕' : aiLocked ? '🔒' : '✨'}</span>
      </button>

      {/* ---------- চ্যাট প্যানেল ---------- */}
      {open && (
        <div ref={panelRef} id="ai-assistant-panel" className="card fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-[min(75vh,36rem)] w-[min(92vw,23rem)] animate-scale-in flex-col overflow-hidden md:bottom-20">
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-violet-600 to-primary-600 px-4 py-3 text-white">
            <div className="min-w-0">
              <div className="font-bold">✨ {L.title}</div>
              <div className="truncate text-xs opacity-90">{L.subtitle}</div>
            </div>
            {!aiLocked && messages.length > 0 && (
              <button onClick={newChat} className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-medium hover:bg-white/30">↺ {L.clear}</button>
            )}
          </div>

          {aiLocked ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-gray-50 p-5 text-center dark:bg-black/20">
              <div className="text-3xl">🔒</div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{lang === 'en' ? 'AI Assistant is not enabled for this trial.' : 'এই ট্রায়ালে AI সহকারী চালু নেই।'}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300">{lang === 'en' ? 'Please subscribe to unlock it.' : 'চালু করতে একটি সাবস্ক্রিপশন নিন।'}</p>
            </div>
          ) : <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3 dark:bg-black/20" aria-live="polite">
            <div className="flex justify-start">
              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100">{L.hello}</div>
            </div>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {chips.map((c) => (
                  <button key={c} onClick={() => ask(c)} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-left text-xs text-violet-700 transition hover:border-violet-400 hover:bg-violet-50 dark:border-violet-400/30 dark:bg-gray-800 dark:text-violet-300">{c}</button>
                ))}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary-600 px-3 py-2 text-sm text-white">{m.content}</div>
                ) : (
                  <MathText text={m.content} as="div" className="max-w-[88%] break-words rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100" />
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-500 shadow-sm dark:bg-gray-800">
                  <span className="inline-flex gap-1" aria-hidden="true">
                    {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500" style={{ animationDelay: `${d}ms` }} />)}
                  </span>
                  {L.thinking}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                {error}{' '}
                <button className="font-semibold underline" onClick={() => { setOpen(false); openHelpline('contact'); }}>{L.human}</button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>}

          {!aiLocked && <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="border-t border-gray-100 p-2 dark:border-white/10">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                className="input max-h-28 min-h-[2.5rem] flex-1 resize-none !py-2"
                placeholder={L.placeholder}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button className="btn-primary !px-4" disabled={loading || !text.trim()}>{L.send}</button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-gray-400">{L.disclaimer}</p>
          </form>}
        </div>
      )}
    </>
  );
}
