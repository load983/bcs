const MAX_EXPLANATION_MEDIA_ITEMS = 3;
const MAX_EXPLANATION_MEDIA_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EXPLANATION_MEDIA_TOTAL_DATA_CHARS = 8_500_000;
const ALLOWED_EXPLANATION_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

function validateExplanationMedia(input) {
  if (!Array.isArray(input) || input.length > MAX_EXPLANATION_MEDIA_ITEMS) {
    return { ok: false, message: `ব্যাখ্যার জন্য সর্বোচ্চ ${MAX_EXPLANATION_MEDIA_ITEMS}টি ছবি/ভিডিও যোগ করা যাবে` };
  }
  const media = [];
  let totalDataChars = 0;
  for (const item of input) {
    const mime = String(item?.mime || '').trim().toLowerCase();
    const data = typeof item?.data === 'string' ? item.data : '';
    const prefix = `data:${mime};base64,`;
    if (!ALLOWED_EXPLANATION_MEDIA_TYPES.has(mime) || !data.startsWith(prefix)) {
      return { ok: false, message: 'ব্যাখ্যায় শুধু বৈধ ছবি বা ভিডিও যোগ করা যাবে' };
    }
    const encoded = data.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      return { ok: false, message: 'ব্যাখ্যার মিডিয়া ফাইলটি পড়া যায়নি' };
    }
    const fileBytes = Buffer.from(encoded, 'base64').length;
    if (fileBytes > MAX_EXPLANATION_MEDIA_FILE_BYTES) {
      return { ok: false, message: 'প্রতিটি ব্যাখ্যার ছবি/ভিডিও সর্বোচ্চ ৪ MB হতে পারবে' };
    }
    totalDataChars += data.length;
    if (totalDataChars > MAX_EXPLANATION_MEDIA_TOTAL_DATA_CHARS) {
      return { ok: false, message: 'ব্যাখ্যার ছবি/ভিডিওর মোট আকার বেশি; ছোট ফাইল ব্যবহার করুন' };
    }
    media.push({
      name: String(item?.name || 'explanation-media').trim().slice(0, 180),
      mime,
      data,
    });
  }
  return { ok: true, media };
}

module.exports = {
  MAX_EXPLANATION_MEDIA_FILE_BYTES,
  MAX_EXPLANATION_MEDIA_ITEMS,
  MAX_EXPLANATION_MEDIA_TOTAL_DATA_CHARS,
  validateExplanationMedia,
};
