// ================== app/store.js ==================
// Redux স্টোর — এখানে সব slice একসাথে যুক্ত করা হয়েছে
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import examReducer from '../features/exam/examSlice';
import attemptReducer, { resetAttempt } from '../features/attempt/attemptSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    exam: examReducer,
    attempt: attemptReducer,
  },
});

// Preserve the active attempt/result for refresh recovery in this browser tab.
let previousUserId = store.getState?.()?.auth?.user?._id || null;
store.subscribe(() => {
  try {
    const state = store.getState();
    const currentUserId = state.auth.user?._id || null;
    if (currentUserId !== previousUserId) {
      previousUserId = currentUserId;
      sessionStorage.removeItem('student-attempt-state');
      if (state.attempt.attemptId) store.dispatch(resetAttempt());
      return;
    }
    const { attemptId, examTitle, totalTimeMinutes, startedAt, deadlineAt, serverNow, clientReceivedAt, questions, answersMap, result, review } = state.attempt;
    if (!attemptId) {
      sessionStorage.removeItem('student-attempt-state');
      return;
    }
    sessionStorage.setItem('student-attempt-state', JSON.stringify({
      ownerId: currentUserId, attemptId, examTitle, totalTimeMinutes, startedAt, deadlineAt, serverNow, clientReceivedAt, questions, answersMap, result, review,
    }));
  } catch {
    // Best effort only; storage restrictions must not stop the app.
  }
});
