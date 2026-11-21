// ব্যাকএন্ডের /uploads/... পাথকে পূর্ণ URL বানায় (API base থেকে /api বাদ দিয়ে)
export default function assetUrl(p) {
  if (!p) return '';
  if (/^(https?:|data:image\/)/i.test(p)) return p;
  // In a same-origin production container, uploaded assets are served by the
  // current origin. Keep localhost only for SSR/build-time fallbacks.
  const env = import.meta.env.VITE_API_URL
    || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');
  return `${env.replace(/\/+$/, '').replace(/\/api$/, '')}${p}`;
}
