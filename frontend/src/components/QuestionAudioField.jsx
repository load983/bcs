import React, { useEffect, useRef, useState } from 'react';

const MAX_AUDIO_BYTES = 1_800_000;
const ACCEPTED_AUDIO = /^(audio\/(webm|ogg|mp4|mpeg|mp3|aac|wav|x-wav|x-m4a|3gpp))(;codecs=[a-z0-9._-]+)?$/i;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('অডিও ফাইল পড়া যায়নি'));
    reader.readAsDataURL(file);
  });
}

export default function QuestionAudioField({ label, value = '', onChange }) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => () => {
    clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    stopTracks();
  }, []);

  const acceptFile = async (file) => {
    setError('');
    if (!file) return;
    if (!file.type.toLowerCase().startsWith('audio/')) {
      setError('একটি অডিও ফাইল নির্বাচন করুন।');
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError('অডিও সর্বোচ্চ ১.৮ MB হতে পারবে। ছোট/সংক্ষিপ্ত রেকর্ডিং ব্যবহার করুন।');
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      if (!ACCEPTED_AUDIO.test(dataUrl.slice(5, dataUrl.indexOf(',')).replace(/;base64$/i, ''))) {
        setError('এই audio format সমর্থিত নয়। WebM, MP4, MP3, OGG বা WAV ব্যবহার করুন।');
        return;
      }
      onChange(dataUrl);
    } catch (e) {
      setError(e.message || 'অডিও ফাইল পড়া যায়নি');
    }
  };

  const startRecording = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('এই browser-এ সরাসরি recording সমর্থিত নয়। অডিও ফাইল upload করুন।');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = types.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setError('Recording-এ সমস্যা হয়েছে। আবার চেষ্টা করুন।');
      recorder.onstop = async () => {
        clearTimeout(timeoutRef.current);
        stopTracks();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) return;
        if (blob.size > MAX_AUDIO_BYTES) {
          setError('রেকর্ডিং ১.৮ MB-এর বেশি হয়েছে। সংক্ষিপ্ত করে আবার record করুন।');
          return;
        }
        setBusy(true);
        try { onChange(await readAsDataUrl(blob)); }
        catch (e) { setError(e.message || 'Recording সংরক্ষণ করা যায়নি'); }
        finally { setBusy(false); }
      };
      recorder.start(500);
      setRecording(true);
      timeoutRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
        setError('২ মিনিট পূর্ণ হয়েছে—রেকর্ডিংটি সংরক্ষণ করা হয়েছে।');
      }, 120_000);
    } catch (e) {
      stopTracks();
      setError(e.name === 'NotAllowedError' ? 'Microphone ব্যবহারের অনুমতি দিন, অথবা অডিও upload করুন।' : 'Microphone চালু করা যায়নি। অডিও upload করে চেষ্টা করুন।');
    }
  };

  const stopRecording = () => {
    clearTimeout(timeoutRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-white/10">
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">{label} <span className="font-normal text-gray-500">(ঐচ্ছিক)</span></p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:text-gray-100" disabled={busy} onClick={recording ? stopRecording : startRecording}>
          {recording ? '⏹ Recording বন্ধ করুন' : '🎙️ মুখে বলে রেকর্ড করুন'}
        </button>
        <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm dark:border-white/15 dark:text-gray-100">
          অডিও ফাইল বাছুন
          <input className="sr-only" type="file" accept="audio/*" disabled={busy || recording} onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {value && <button type="button" className="rounded-lg px-3 py-2 text-sm text-red-600" onClick={() => onChange('')}>অডিও সরান</button>}
      </div>
      {recording && <p className="mt-2 text-xs text-red-600" role="status">রেকর্ড হচ্ছে… শেষ হলে বন্ধ করুন (সর্বোচ্চ ২ মিনিট)।</p>}
      {busy && <p className="mt-2 text-xs text-gray-500" role="status">অডিও সংরক্ষণ হচ্ছে…</p>}
      {value && <audio className="mt-3 w-full" controls preload="none" src={value}>এই browser audio playback সমর্থন করে না।</audio>}
      {error && <p className="mt-2 text-xs text-red-600" role="alert">{error}</p>}
      <p className="mt-2 text-xs text-gray-500">WebM, MP4, MP3, OGG বা WAV; সর্বোচ্চ ১.৮ MB।</p>
    </div>
  );
}
