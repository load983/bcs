const MAX_MEDIA_ITEMS = 3;
const MAX_MEDIA_FILE_BYTES = 4 * 1024 * 1024;
const MAX_MEDIA_TOTAL_DATA_CHARS = 8_500_000;
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav',
  'video/mp4', 'video/webm', 'video/quicktime',
]);

function validateTeacherFeedbackMedia(input) {
  if (!Array.isArray(input) || input.length > MAX_MEDIA_ITEMS) {
    return { ok: false, message: `সর্বোচ্চ ${MAX_MEDIA_ITEMS}টি feedback media যোগ করা যাবে` };
  }

  const media = [];
  let totalDataChars = 0;
  for (const item of input) {
    const mime = String(item?.mime || '').trim().toLowerCase();
    const data = typeof item?.data === 'string' ? item.data : '';
    const prefix = `data:${mime};base64,`;
    if (!ALLOWED_MIME_TYPES.has(mime) || !data.startsWith(prefix)) {
      return { ok: false, message: 'শুধু বৈধ image, audio অথবা video ফাইল যোগ করা যাবে' };
    }
    const encoded = data.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
      return { ok: false, message: 'Feedback media ফাইলটি পড়া যায়নি' };
    }
    const fileBytes = Buffer.from(encoded, 'base64').length;
    if (fileBytes > MAX_MEDIA_FILE_BYTES) {
      return { ok: false, message: 'প্রতিটি feedback media ফাইল সর্বোচ্চ ৪ MB হতে পারবে' };
    }
    totalDataChars += data.length;
    if (totalDataChars > MAX_MEDIA_TOTAL_DATA_CHARS) {
      return { ok: false, message: 'Feedback media-এর মোট আকার বেশি; ছোট ফাইল ব্যবহার করুন' };
    }
    media.push({
      name: String(item?.name || 'feedback-media').trim().slice(0, 180),
      mime,
      data,
    });
  }

  return { ok: true, media };
}

module.exports = {
  MAX_MEDIA_FILE_BYTES,
  MAX_MEDIA_ITEMS,
  MAX_MEDIA_TOTAL_DATA_CHARS,
  validateTeacherFeedbackMedia,
};
