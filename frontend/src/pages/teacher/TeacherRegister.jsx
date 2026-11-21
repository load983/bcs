// ================== pages/teacher/TeacherRegister.jsx ==================
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { teacherRegister } from '../../features/auth/authSlice';
import { useLanguage } from '../../context/LanguageContext';
import AnimatedAuthCard, { AaField } from '../../components/AnimatedAuthCard';

export default function TeacherRegister() {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [localError, setLocalError] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { status, error } = useSelector((s) => s.auth);

  const normalizePhone = (value) => {
    const bn = '০১২৩৪৫৬৭৮৯';
    let phone = String(value || '').replace(/[০-৯]/g, (digit) => String(bn.indexOf(digit))).replace(/[\s()-]/g, '');
    if (phone.startsWith('00')) return `+${phone.slice(2)}`;
    if (phone.startsWith('880')) return `+${phone}`;
    if (/^01\d{9}$/.test(phone)) return `+880${phone.slice(1)}`;
    return phone;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    const phone = normalizePhone(form.phone);
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setLocalError('সঠিক মোবাইল নম্বর দিন, যেমন 01XXXXXXXXX বা +8801XXXXXXXXX');
      return;
    }
    const result = await dispatch(teacherRegister({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase(), phone }));
    if (teacherRegister.fulfilled.match(result)) {
      navigate('/teacher/dashboard');
    }
  };

  // Static preview shown on the left-hand panel (real form lives on /teacher/login)
  const loginSlot = (
    <>
      <h2 className="aa-form-title">{t('teacherLogin.title')}</h2>
      <p className="aa-switch" style={{ marginTop: 0 }}>
        {t('teacherRegister.haveAccount')}{' '}
        <a onClick={(e) => { e.preventDefault(); navigate('/teacher/login'); }}>
          {t('teacherRegister.loginLink')}
        </a>
      </p>
    </>
  );

  const signupSlot = (
    <>
      <h2 className="aa-form-title">{t('teacherRegister.title')}</h2>
      <form onSubmit={handleSubmit}>
        <AaField
          id="teacherName"
          label={t('teacherRegister.fullName')}
          icon="fa-regular fa-user"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <AaField
          id="teacherRegEmail"
          type="email"
          label={t('common.email')}
          icon="fa-regular fa-envelope"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <AaField
          id="teacherRegPhone"
          type="tel"
          label="মোবাইল নম্বর (SMS পেতে)"
          icon="fa-solid fa-phone"
          placeholder="+8801XXXXXXXXX"
          pattern="[+][1-9][0-9]{7,14}|01[0-9]{9}"
          title="01XXXXXXXXX অথবা +8801XXXXXXXXX লিখুন"
          autoComplete="tel"
          inputMode="tel"
          required
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <AaField
          id="teacherRegPassword"
          type="password"
          label={t('teacherRegister.passwordPlaceholder')}
          icon="fa-solid fa-lock"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {(localError || error) && <p className="aa-error">{localError || error}</p>}
        <button type="submit" className="aa-btn" disabled={status === 'loading'}>
          {status === 'loading' ? t('teacherRegister.creating') : t('teacherRegister.create')}
        </button>
      </form>
      <p className="aa-switch">
        {t('teacherRegister.haveAccount')}{' '}
        <a onClick={(e) => { e.preventDefault(); navigate('/teacher/login'); }}>
          {t('teacherRegister.loginLink')}
        </a>
      </p>
    </>
  );

  return (
    <AnimatedAuthCard
      active={true}
      loginSlot={loginSlot}
      signupSlot={signupSlot}
      welcomeTitle="WELCOME BACK!"
      welcomeText={t('teacherLogin.title')}
      joinTitle="JOIN US!"
      joinText={t('teacherRegister.title')}
    />
  );
}
