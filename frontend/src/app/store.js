// ================== app/store.js ==================
// Redux স্টোর — এখানে সব slice একসাথে যুক্ত করা হয়েছে
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import examReducer from '../features/exam/examSlice';
import attemptReducer from '../features/attempt/attemptSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    exam: examReducer,
    attempt: attemptReducer,
  },
});

// Preserve the active attempt/result for refresh recovery in this browser tab.
store.subscribe(() => {
  try {
    const { attemptId, examTitle, totalTimeMinutes, startedAt, questions, answersMap, result, review } = store.getState().attempt;
    if (!attemptId) {
      sessionStorage.removeItem('student-attempt-state');
      return;
    }
    sessionStorage.setItem('student-attempt-state', JSON.stringify({
      attemptId, examTitle, totalTimeMinutes, startedAt, questions, answersMap, result, review,
    }));
  } catch {
    // Best effort only; storage restrictions must not stop the app.
  }
});
