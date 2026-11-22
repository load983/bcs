// ================== models/SiteSettings.js ==================
// সাইটের সিঙ্গেল সেটিংস ডকুমেন্ট — অ্যাডমিনের দেওয়া যোগাযোগ (হেল্পলাইন) তথ্য এখানে জমা থাকে।
const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'main', unique: true },

    // নির্দিষ্ট কিছু যোগাযোগ মাধ্যম (ফাঁকা থাকলে ইউজারকে দেখানো হয় না)
    contacts: {
      phone: { type: String, default: '' },
      whatsapp: { type: String, default: '' },
      email: { type: String, default: '' },
      facebook: { type: String, default: '' },
      messenger: { type: String, default: '' },
      telegram: { type: String, default: '' },
      instagram: { type: String, default: '' },
      youtube: { type: String, default: '' },
      twitter: { type: String, default: '' },
      tiktok: { type: String, default: '' },
      website: { type: String, default: '' },
    },

    // অ্যাডমিনের নিজের ইচ্ছামতো যেকোনো লিংক/নাম্বার (যেমন: IMO, Viber, Line...)
    extras: [
      {
        _id: false,
        label: { type: String, default: '' },
        value: { type: String, default: '' },
      },
    ],

    // ম্যানুয়াল পেমেন্টের নাম্বার (অ্যাডমিন বদলাতে পারে)। null = সেট করা হয়নি → .env-এর মান ব্যবহার হবে; '' = ইচ্ছা করে ফাঁকা (দেখানো হবে না)
    payment: {
      bkash: { type: String, default: null },
      nagad: { type: String, default: null },
      rocket: { type: String, default: null },
    },

    // "Test Web": নতুন শিক্ষক একাউন্টের অটো ফ্রি ট্রায়াল সেটিং
    trial: {
      enabled: { type: Boolean, default: false },
      durationDays: { type: Number, default: 7, min: 1 },
      features: { type: [String], default: [] },
      examLimit: { type: Number, default: 0, min: 0 }, // ০ = সীমাহীন পরীক্ষা
      catalogVersion: { type: Number },
    },

    // ---------- ওয়েবসাইট কাস্টমাইজ (অ্যাডমিন প্যানেল → ওয়েবসাইট কাস্টমাইজ) ----------
    // লোগো ডাটাবেসেই থাকে (হোস্টিং রিস্টার্ট হলেও হারায় না); select:false — সাধারণ কোয়েরিতে আসে না
    logo: {
      data: { type: Buffer, select: false },
      contentType: { type: String, default: '' },
      updatedAt: { type: Date },
    },
    // অ্যাডমিনের বদলানো visual slots: hero, promo ও feature-এ image/video বসানো যায়।
    images: {
      type: [{
        _id: false,
        slot: { type: String, required: true },
        path: { type: String, default: '' },
        gridFsId: { type: mongoose.Schema.Types.ObjectId },
        kind: { type: String, enum: ['image', 'video'], default: 'image' },
        contentType: { type: String, default: '' },
        alt: { type: String, default: '' },
        updatedAt: { type: Date },
      }],
      default: [],
    },
    // Homepage gallery: admin যত ইচ্ছা image/video যোগ করতে পারে
    media: {
      type: [{
        kind: { type: String, enum: ['image', 'video'], required: true },
        path: { type: String, default: '' },
        gridFsId: { type: mongoose.Schema.Types.ObjectId },
        contentType: { type: String, default: '' },
        title: { type: String, default: '' },
        alt: { type: String, default: '' },
        updatedAt: { type: Date, default: Date.now },
      }],
      default: [],
    },

    // Homepage presentation and search/social metadata; all fields are optional for old records.
    homepage: {
      showHero: { type: Boolean, default: true },
      showGallery: { type: Boolean, default: true },
      showFeatures: { type: Boolean, default: true },
      showHowItWorks: { type: Boolean, default: true },
      showAudience: { type: Boolean, default: true },
      showFaq: { type: Boolean, default: true },
      showCta: { type: Boolean, default: true },
    },
    seo: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      keywords: { type: String, default: '' },
    },
    // পাঁচটি global UI preference — পুরোনো record-এ default থাকায় migration লাগে না।
    appearance: {
      accent: { type: String, enum: ['coral', 'indigo', 'violet', 'sky', 'emerald', 'rose', 'amber'], default: 'coral' },
      mode: { type: String, enum: ['light', 'dark', 'system'], default: 'dark' },
      background: { type: String, enum: ['minimal', 'blobs', 'dots', 'mesh'], default: 'minimal' },
      density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
      radius: { type: String, enum: ['sharp', 'soft', 'round'], default: 'soft' },
    },

    // যেকোনো লেখা বদলানো: key = ফ্রন্টএন্ডের অনুবাদ key, bn/en = নতুন লেখা (ফাঁকা = ডিফল্ট)
    textOverrides: [
      {
        _id: false,
        key: { type: String, required: true },
        bn: { type: String, default: '' },
        en: { type: String, default: '' },
      },
    ],

    // ফুটারের "Important Links" — প্রতিটা লিংক নিজস্ব পেজ (/page/:slug) অথবা বাইরের লিংক
    footerLinks: {
      type: [
        {
          _id: false,
          slug: { type: String, required: true },
          titleBn: { type: String, default: '' },
          titleEn: { type: String, default: '' },
          contentBn: { type: String, default: '' },
          contentEn: { type: String, default: '' },
          externalUrl: { type: String, default: '' },
          enabled: { type: Boolean, default: true },
        },
      ],
      default: () => [
        { slug: 'terms', titleBn: 'শর্তাবলী', titleEn: 'Terms and Conditions', enabled: true },
        { slug: 'privacy', titleBn: 'গোপনীয়তা নীতি', titleEn: 'Privacy Policy', enabled: true },
        { slug: 'refund', titleBn: 'রিটার্ন ও রিফান্ড নীতি', titleEn: 'Return and Refund Policy', enabled: true },
      ],
    },

    // ---------- ইমেইল/SMS নোটিফিকেশন ----------
    messaging: {
      emailEnabled: { type: Boolean, default: false }, smtpHost: { type: String, default: '' }, smtpPort: { type: Number, default: 587 }, smtpUser: { type: String, default: '' }, smtpPassEnc: { type: String, select: false, default: '' }, fromEmail: { type: String, default: '' }, fromName: { type: String, default: '' },
      smsEnabled: { type: Boolean, default: false }, smsExamEnabled: { type: Boolean, default: true }, smsResultEnabled: { type: Boolean, default: true }, twilioSid: { type: String, default: '' }, twilioTokenEnc: { type: String, select: false, default: '' }, twilioFrom: { type: String, default: '' },
    },
    // ---------- AI সহকারী (অ্যাডমিন প্যানেল → AI সহকারী) ----------
    // API key এনক্রিপ্ট করে রাখা হয়; select:false — সাধারণ কোয়েরিতে আসে না, ফ্রন্টএন্ডে কখনো যায় না
    ai: {
      enabled: { type: Boolean, default: true },
      apiKeyEnc: { type: String, select: false, default: '' },
      keyHint: { type: String, default: '' }, // শেষ ৪ অক্ষর (শুধু দেখানোর জন্য)
      model: { type: String, default: '' }, // ফাঁকা = ডিফল্ট
      // কোন কোম্পানির AI ব্যবহার হবে: 'anthropic' (Claude) বা 'gemini' (Google)
      provider: { type: String, enum: ['anthropic', 'gemini', 'openai'], default: 'anthropic' },
      geminiKeyEnc: { type: String, select: false, default: '' },
      geminiHint: { type: String, default: '' },
      geminiModel: { type: String, default: '' },
      // OpenAI-compatible যেকোনো সার্ভিস (OpenRouter, OpenAI, Groq, DeepSeek, Mistral, Together, xAI, Ollama ...)
      openaiKeyEnc: { type: String, select: false, default: '' },
      openaiHint: { type: String, default: '' },
      openaiModel: { type: String, default: '' },
      openaiBaseUrl: { type: String, default: '' }, // ফাঁকা = ডিফল্ট (OpenRouter)
      limitGuest: { type: Number, default: 0, min: 0 }, // ০ = ডিফল্ট
      limitUser: { type: Number, default: 0, min: 0 },
    },

    // ---------- অনলাইন পেমেন্ট গেটওয়ে (অ্যাডমিন প্যানেল → পেমেন্ট → অটো পেমেন্ট গেটওয়ে) ----------
    // Store Password এনক্রিপ্ট করে রাখা হয়; select:false — সাধারণ কোয়েরিতে আসে না, ফ্রন্টএন্ডে কখনো যায় না
    gateway: {
      enabled: { type: Boolean, default: true }, // false = অনলাইন পেমেন্ট বন্ধ (শুধু ম্যানুয়াল)
      active: { type: String, enum: ['sslcommerz', 'rupantorpay'], default: 'sslcommerz' }, // কোন গেটওয়ে চলবে
      sandbox: { type: Boolean, default: null }, // null = .env (SSLC_SANDBOX) অনুযায়ী
      storeId: { type: String, default: '' },
      storePasswordEnc: { type: String, select: false, default: '' },
      passwordHint: { type: String, default: '' }, // শেষ ৪ অক্ষর (শুধু দেখানোর জন্য)
      serverUrl: { type: String, default: '' }, // ব্যাকএন্ডের পাবলিক URL (ফাঁকা = .env SERVER_URL)
      clientUrl: { type: String, default: '' }, // ফ্রন্টএন্ডের URL (ফাঁকা = .env CLIENT_URL)
      // RupantorPay: API key এনক্রিপ্ট করে রাখা হয়; domain = ব্র্যান্ডে যোগ করা ডোমেইন (X-CLIENT; ফাঁকা = সাইট URL-এর হোস্ট)
      rupantorpayKeyEnc: { type: String, select: false, default: '' },
      rupantorpayHint: { type: String, default: '' },
      rupantorpayDomain: { type: String, default: '' },
    },

    helplineNote: { type: String, default: '' }, // যেমন: "সকাল ১০টা – রাত ৯টা"
    chatEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
