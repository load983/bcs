const User = require('../models/User');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const Subscription = require('../models/Subscription');
const Announcement = require('../models/Announcement');
const TeacherNotification = require('../models/TeacherNotification');
const Diagram = require('../models/Diagram');
const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const ExamFeedback = require('../models/ExamFeedback');

const safeUserProjection = 'name email phone roll role accessCode connectedTeachers connectedClasses bannedByTeachers createdAt updatedAt';

exports.exportMyData = async (req, res) => {
  try {
    const id = req.user.id;
    const ownProfile = await User.findById(id).select(safeUserProjection).lean();
    if (!ownProfile) return res.status(404).json({ message: 'অ্যাকাউন্ট পাওয়া যায়নি' });

    let data;
    if (req.user.role === 'teacher') {
      const [classes, exams, subscriptions, announcements, notifications, diagrams, students, thread] = await Promise.all([
        Class.find({ teacher: id }).lean(),
        Exam.find({ teacher: id }).lean(),
        Subscription.find({ teacher: id }).lean(),
        Announcement.find({ teacher: id }).lean(),
        TeacherNotification.find({ teacher: id }).lean(),
        Diagram.find({ teacher: id }).lean(),
        User.find({ role: 'student', $or: [{ connectedTeachers: id }, { connectedClasses: { $in: await Class.distinct('_id', { teacher: id }) } }] }).select(safeUserProjection).lean(),
        ChatThread.findOne({ owner: id }).select('_id').lean(),
      ]);
      const examIds = exams.map((e) => e._id);
      const classIds = classes.map((c) => c._id);
      const [questions, attempts, messages, feedback] = await Promise.all([
        Question.find({ exam: { $in: examIds } }).lean(),
        Attempt.find({ exam: { $in: examIds } }).lean(),
        thread ? ChatMessage.find({ thread: thread._id }).lean() : [],
        ExamFeedback.find({ exam: { $in: examIds } }).lean(),
      ]);
      data = { role: 'teacher', profile: ownProfile, classes, exams, questions, attempts, feedback, subscriptions, students, announcements, notifications, diagrams, support: { thread, messages } };
    } else if (req.user.role === 'student') {
      const classIds = ownProfile.connectedClasses || [];
      const teacherIds = [...new Set([...(ownProfile.connectedTeachers || []).map(String)])];
      const [classes, attempts, announcements, thread, feedback] = await Promise.all([
        Class.find({ _id: { $in: classIds } }).lean(),
        Attempt.find({ studentId: id }).lean(),
        Announcement.find({ classRefs: { $in: classIds } }).lean(),
        ChatThread.findOne({ owner: id }).select('_id').lean(),
        ExamFeedback.find({ studentId: id }).lean(),
      ]);
      for (const cls of classes) if (cls.teacher) teacherIds.push(String(cls.teacher));
      const uniqueTeacherIds = [...new Set(teacherIds)];
      const [teachers, messages] = await Promise.all([
        User.find({ _id: { $in: uniqueTeacherIds }, role: 'teacher' }).select('name email phone role createdAt').lean(),
        thread ? ChatMessage.find({ thread: thread._id }).lean() : [],
      ]);
      data = { role: 'student', profile: ownProfile, classes, teachers, attempts, feedback, announcements, support: { thread, messages } };
    } else {
      return res.status(403).json({ message: 'এই রপ্তানি শুধু শিক্ষক ও শিক্ষার্থীর জন্য' });
    }

    const filename = `my-data-${req.user.role}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(JSON.stringify({ exportedAt: new Date().toISOString(), format: 'json', data }, null, 2));
  } catch (err) {
    console.error('personal data export failed:', err.message);
    res.status(500).json({ message: 'ডাটা export করা যায়নি' });
  }
};
