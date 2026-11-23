// ================== features/attempt/attemptSlice.js ==================
// Student সাইডে পরীক্ষা দেয়ার সময়কার স্টেট (প্রশ্ন, উত্তর, টাইমার) ম্যানেজ করে
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axiosClient from '../../api/axiosClient';
import { translate } from '../../context/LanguageContext';

export const joinExam = createAsyncThunk('attempt/join', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await axiosClient.post('/attempts/join', payload);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || translate('attempt.joinFailed'));
  }
});

export const resumeAttempt = createAsyncThunk('attempt/resume', async (attemptId, { rejectWithValue }) => {
  try {
    const { data } = await axiosClient.get(`/attempts/${attemptId}/resume`);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'পরীক্ষার উত্তর ফেরত আনা যায়নি');
  }
});

// StudentJoin.jsx ফাইলে startAttempt নামে ইমপোর্ট সামঞ্জস্য রাখার জন্য alias export
export const startAttempt = joinExam;

export const saveAnswer = createAsyncThunk(
  'attempt/saveAnswer',
  async ({ attemptId, questionId, selectedOptionIndex, answerText, answerFiles }, { rejectWithValue }) => {
    try {
      const { data } = await axiosClient.put(`/attempts/${attemptId}/answer`, { questionId, selectedOptionIndex, answerText, answerFiles });
      return {
        questionId,
        selectedOptionIndex: selectedOptionIndex ?? 'answered',
        isShort: selectedOptionIndex === null,
        answerText,
        answerFiles,
        hasResponse: data.hasResponse ?? !!(String(answerText || '').trim() || answerFiles?.length),
      };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'উত্তর সেভ করা যায়নি');
    }
  }
);

export const submitAttempt = createAsyncThunk(
  'attempt/submit',
  async ({ attemptId, autoSubmitted }, { rejectWithValue }) => {
    try {
      const { data } = await axiosClient.post(`/attempts/${attemptId}/submit`, { autoSubmitted });
      return data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message);
    }
  }
);

export const fetchAttemptResult = createAsyncThunk('attempt/fetchResult', async (attemptId, { rejectWithValue }) => {
  try {
    const { data } = await axiosClient.get(`/attempts/${attemptId}/result`);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'ফলাফল আনতে সমস্যা হয়েছে');
  }
});

export const fetchReview = createAsyncThunk('attempt/fetchReview', async (attemptId, { rejectWithValue }) => {
  try {
    const { data } = await axiosClient.get(`/attempts/${attemptId}/review`);
    return data;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const emptyAttemptState = {
  attemptId: null, examTitle: '', totalTimeMinutes: 0, startedAt: null,
  questions: [], answersMap: {}, shortAnswers: {}, result: null, review: null, status: 'idle', error: null,
};
const loadSavedAttempt = () => {
  try {
    const saved = sessionStorage.getItem('student-attempt-state');
    if (!saved) return emptyAttemptState;
    const parsed = JSON.parse(saved);
    let currentUserId = null;
    try {
      currentUserId = JSON.parse(localStorage.getItem('user') || 'null')?._id || null;
    } catch {
      currentUserId = null;
    }
    if (!currentUserId || parsed.ownerId !== currentUserId) {
      sessionStorage.removeItem('student-attempt-state');
      return emptyAttemptState;
    }
    return { ...emptyAttemptState, ...parsed };
  } catch {
    return emptyAttemptState;
  }
};
const attemptSlice = createSlice({
  name: 'attempt',
  initialState: loadSavedAttempt(),
  reducers: {
    resetAttempt: () => emptyAttemptState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(joinExam.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(joinExam.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.attemptId = action.payload.attemptId;
        state.examTitle = action.payload.examTitle;
        state.totalTimeMinutes = action.payload.totalTimeMinutes;
        state.startedAt = action.payload.startedAt;
        state.questions = action.payload.questions || [];
        state.answersMap = action.payload.answers || {};
        state.shortAnswers = action.payload.shortAnswers || {};
      })
      .addCase(joinExam.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(resumeAttempt.fulfilled, (state, action) => {
        state.examTitle = action.payload.examTitle;
        state.totalTimeMinutes = action.payload.totalTimeMinutes;
        state.startedAt = action.payload.startedAt;
        state.questions = action.payload.questions || [];
        state.answersMap = action.payload.answers || {};
        state.shortAnswers = action.payload.shortAnswers || {};
      })
      .addCase(saveAnswer.fulfilled, (state, action) => {
        const { questionId, isShort, hasResponse } = action.payload;
        if (isShort) {
          if (hasResponse) {
            state.answersMap[questionId] = 'answered';
            state.shortAnswers[questionId] = { answerText: action.payload.answerText || '', answerFiles: action.payload.answerFiles || [] };
          } else {
            delete state.answersMap[questionId];
            delete state.shortAnswers[questionId];
          }
        } else state.answersMap[questionId] = action.payload.selectedOptionIndex;
      })
      .addCase(submitAttempt.fulfilled, (state, action) => {
        state.result = action.payload;
      })
      .addCase(fetchAttemptResult.fulfilled, (state, action) => {
        state.result = action.payload;
        if (action.payload.showInstantly) state.review = null;
      })
      .addCase(fetchReview.fulfilled, (state, action) => {
        state.review = action.payload;
      });
  },
});

export const { resetAttempt } = attemptSlice.actions;
export default attemptSlice.reducer;
