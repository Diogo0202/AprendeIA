/** Adaptador HTTP das portas da interface: cada método conhece só o seu caminho na API. */
import type {
  Answer,
  Gateways,
  LoginCredentials,
  LoginOutcome,
  PrivacyRequestScope,
} from '../../application/ports';
import type { Failure, Result } from '../../application/result';
import { apiUrl } from '../supabase/client';
import { apiError, apiFetch } from './apiClient';

type Body = 'json' | 'blob' | 'none';

async function failure(response: Response): Promise<Failure> {
  return { ok: false, status: response.status, detail: await apiError(response, '') };
}

async function call<T>(body: Body, path: string, init?: RequestInit): Promise<Result<T>> {
  const response = await (init ? apiFetch(path, init) : apiFetch(path));
  if (!response.ok) return failure(response);
  if (body === 'none') return { ok: true, data: undefined as T };
  return { ok: true, data: (await (body === 'blob' ? response.blob() : response.json())) as T };
}

const read = <T>(path: string, signal?: AbortSignal) =>
  call<T>('json', path, signal ? { signal } : undefined);

const write = (method: string, payload?: object, signal?: AbortSignal): RequestInit => ({
  method,
  ...(payload ? { body: JSON.stringify(payload) } : {}),
  ...(signal ? { signal } : {}),
});

/** Envia e devolve o corpo da resposta. */
const send = <T>(method: string, path: string, payload?: object) =>
  call<T>('json', path, write(method, payload));

/** Envia quando a tela só precisa saber se deu certo. */
const submit = (method: string, path: string, payload?: object, signal?: AbortSignal) =>
  call<void>('none', path, write(method, payload, signal));

/**
 * Monta um caminho codificando cada valor interpolado como um segmento:
 * um identificador com `/`, `?` ou `..` nunca muda o endpoint chamado.
 */
export function path(strings: TemplateStringsArray, ...segments: string[]): string {
  return strings.reduce(
    (built, literal, index) =>
      built + literal + (index < segments.length ? encodeURIComponent(segments[index]) : ''),
    '',
  );
}

/** Parâmetros de consulta já codificados; valores vazios ficam de fora. */
function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

type LoginSessionPayload = { access_token?: string; refresh_token?: string };

const DEFAULT_RETRY_SECONDS = 300;

/** O login é público: vai sem token e devolve o status para a tela explicar o bloqueio. */
async function login(credentials: LoginCredentials): Promise<LoginOutcome> {
  const response = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const payload = (await response.json().catch(() => ({}))) as LoginSessionPayload;
  return {
    ok: response.ok,
    status: response.status,
    retryAfterSeconds: Number(response.headers.get('Retry-After') || DEFAULT_RETRY_SECONDS),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
  };
}

export function createHttpGateways(): Omit<Gateways, 'session'> {
  return {
    account: {
      login,
      status: (signal) => call('json', '/account/status', { signal }),
      declareAge: (payload) => submit('PUT', '/account/age-band', payload),
      requestAdmission: (payload) => submit('POST', '/account/admission', payload),
      acceptLegalDocuments: (policyVersion, termsVersion) =>
        submit('POST', '/privacy/accept', {
          policy_version: policyVersion,
          terms_version: termsVersion,
        }),
    },
    communication: {
      contacts: () => read('/communications/contacts'),
      conversations: () => read('/communications/conversations'),
      messages: (conversationId) =>
        read(path`/communications/conversations/${conversationId}/messages`),
      startConversation: (participantId) =>
        send('POST', '/communications/conversations', { participant_id: participantId }),
      sendMessage: (conversationId, body) =>
        send('POST', path`/communications/conversations/${conversationId}/messages`, { body }),
      askTutor: (body, conversationId) =>
        send('POST', '/communications/ai/messages', { body, conversation_id: conversationId }),
    },
    privacy: {
      requests: (scope: PrivacyRequestScope, signal) =>
        call('json', scope === 'all' ? '/admin/privacy-requests' : '/privacy/requests', { signal }),
      createRequest: (request) => submit('POST', '/privacy/requests', request),
      cancelRequest: (requestId) => submit('POST', path`/privacy/requests/${requestId}/cancel`),
      resolveRequest: (requestId, decision) =>
        submit('POST', path`/admin/privacy-requests/${requestId}/resolve`, decision),
      exportData: (requestId) => call<Blob>('blob', path`/privacy/requests/${requestId}/export`),
    },
    student: {
      subjects: () => read('/student/subjects'),
      recommendations: () => read('/student/recommendations'),
      diagnostic: () => read('/student/diagnostic'),
      answerDiagnostic: (questionId, selectedIndex) =>
        submit('POST', path`/student/diagnostic/${questionId}/answer`, {
          selected_index: selectedIndex,
          response_time_seconds: 0,
        }),
      completeDiagnostic: () => send('POST', '/student/diagnostic/complete'),
      gamification: (signal) => read('/student/gamification', signal),
      lesson: (lessonId) => read(path`/student/lessons/${lessonId}`),
      completeLesson: (lessonId, timeSeconds) =>
        submit('PUT', path`/student/lessons/${lessonId}/progress`, {
          completed: true,
          time_seconds: timeSeconds,
        }),
      confirmExercise: (lessonId, questionId) =>
        submit(
          'POST',
          path`/student/lessons/${lessonId}/required-exercises/${questionId}/complete`,
        ),
      nextQuestion: (subject) => read(`/question-bank/next${query({ subject })}`),
      answerQuestion: (questionId, answer: Answer) =>
        send('POST', path`/question-bank/${questionId}/answer`, answer),
      personalize: (payload) => submit('PUT', '/student/profile-personalization', payload),
      leaderboard: (search, signal) => call('json', `/student/leaderboard?${search}`, { signal }),
      saveLeaderboardPreferences: (preferences, signal) =>
        submit('PUT', '/student/leaderboard-preferences', preferences, signal),
    },
    teacher: {
      overview: () => read('/teacher/overview'),
      classes: () => read('/teacher/classes'),
      difficultyAlerts: () => read('/teacher/difficulty-alerts'),
      contents: () => read('/teacher/contents'),
      classDetail: (classId) => read(path`/teacher/classes/${classId}`),
      createClass: (draft) => send('POST', '/teacher/classes', draft),
      addStudent: (classId, studentEmail) =>
        submit('POST', path`/teacher/classes/${classId}/students`, { student_email: studentEmail }),
      removeStudent: (classId, studentId) =>
        submit('DELETE', path`/teacher/classes/${classId}/students/${studentId}`),
      exportReport: (classId, studentId) =>
        call<Blob>(
          'blob',
          `/teacher/reports/export${query({ class_id: classId, student_id: studentId })}`,
        ),
      createContent: (draft) => send('POST', '/teacher/contents', draft),
      importContents: (format, content) =>
        send('POST', '/teacher/contents/import', { format, content }),
      recommend: (classId, studentId) =>
        send('POST', '/teacher/recommendations', { class_id: classId, student_id: studentId }),
      classLeaderboard: (classId, search, signal) =>
        call('json', `${path`/teacher/classes/${classId}/leaderboard`}?${search}`, { signal }),
      questions: () => read('/teacher/questions'),
      generateQuestion: (parameters) => send('POST', '/question-bank/generate', parameters),
      reviewQuestion: (questionId, review) =>
        send('PATCH', path`/teacher/questions/${questionId}`, review),
      notificationPreferences: (signal) =>
        call('json', '/teacher/notification-preferences', { signal }),
      saveNotificationPreferences: (preferences) =>
        submit('PUT', '/teacher/notification-preferences', preferences),
    },
    admin: {
      overview: () => read('/admin/overview'),
      users: () => read('/admin/users'),
      createUser: (account) => submit('POST', '/admin/users', account),
      deleteUser: (userId, confirmation, reason) =>
        submit('POST', path`/admin/users/${userId}/delete`, { confirmation, reason }),
      teacherRequests: () => read('/admin/teacher-requests'),
      approveTeacher: (userId, subject) =>
        submit('POST', path`/admin/teacher-requests/${userId}/approve`, { subject }),
      subjects: () => read('/admin/subjects'),
      createSubject: (subject) => submit('POST', '/admin/subjects', subject),
      createModule: (subjectId, module) =>
        submit('POST', path`/admin/subjects/${subjectId}/modules`, module),
      createLesson: (moduleId, lesson) =>
        submit('POST', path`/admin/modules/${moduleId}/lessons`, lesson),
      mandatoryExercises: (lessonId) => read(path`/admin/lessons/${lessonId}/mandatory-exercises`),
      saveMandatoryExercises: (lessonId, questionIds) =>
        send('PUT', path`/admin/lessons/${lessonId}/mandatory-exercises`, {
          question_ids: questionIds,
        }),
      performance: (teacherId, signal) =>
        call('json', `/admin/performance${query({ teacher_id: teacherId })}`, { signal }),
      teachers: (signal) => call('json', '/admin/teachers', { signal }),
      classes: (signal) => call('json', '/admin/classes', { signal }),
      auditLogs: (search) => read(`/admin/audit-logs?${search}`),
      admissions: (signal) => call('json', '/admin/account-admissions', { signal }),
      reviewAdmission: (requestId, decision, note) =>
        submit('POST', path`/admin/account-admissions/${requestId}/review`, {
          decision,
          version: '1',
          note,
        }),
    },
  };
}
