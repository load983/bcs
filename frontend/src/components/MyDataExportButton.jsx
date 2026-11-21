import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { downloadFile } from '../utils/download';

export default function MyDataExportButton() {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const handleExport = async () => {
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadFile('/auth/my-data/export', `my-data-${date}.json`);
    } catch (err) {
      window.alert(err.message || t('dataExport.failed'));
    } finally {
      setBusy(false);
    }
  };
  return <button type="button" className="btn-secondary" onClick={handleExport} disabled={busy} title={t('dataExport.help')}>
    {busy ? t('dataExport.loading') : `⬇ ${t('dataExport.button')}`}
  </button>;
}
