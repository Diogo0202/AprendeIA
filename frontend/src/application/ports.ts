/**
 * Portas de saída da interface: o que as telas precisam do servidor.
 *
 * Os componentes dependem só destes contratos. O formato de cada resposta
 * continua declarado por quem a consome, no parâmetro de tipo.
 */
import type { Result } from './result';

export type Answer = { selected_index: number; response_time_seconds?: number };
export type PrivacyRequestScope = 'own' | 'all';
export type AdminListing = 'teachers' | 'classes';

export type LoginCredentials = { email: string; password: string; captcha_token?: string };

/** Desfecho do login: os tokens só existem quando o servidor emitiu a sessão completa. */
export type LoginOutcome = {
  ok: boolean;
  status: number;
  retryAfterSeconds: number;
  accessToken?: string;
  refreshToken?: string;
};

export interface AccountGateway {
  login(credentials: LoginCredentials): Promise<LoginOutcome>;
  status<T>(signal?: AbortSignal): Promise<Result<T>>;
  declareAge(payload: object): Promise<Result<void>>;
  requestAdmission(payload: object): Promise<Result<void>>;
  acceptLegalDocuments(policyVersion: string, termsVersion: string): Promise<Result<void>>;
}

export interface CommunicationGateway {
  contacts<T>(): Promise<Result<T>>;
  conversations<T>(): Promise<Result<T>>;
  messages<T>(conversationId: string): Promise<Result<T>>;
  startConversation<T>(participantId: string): Promise<Result<T>>;
  sendMessage<T>(conversationId: string, body: string): Promise<Result<T>>;
  askTutor<T>(body: string, conversationId?: string): Promise<Result<T>>;
}

export interface PrivacyGateway {
  requests<T>(scope: PrivacyRequestScope, signal?: AbortSignal): Promise<Result<T>>;
  /** Cria, cancela ou resolve um pedido; o caminho identifica a operação. */
  submit(path: string, body?: object): Promise<Result<void>>;
  exportData(requestId: string): Promise<Result<Blob>>;
}

export interface StudentGateway {
  subjects<T>(): Promise<Result<T>>;
  recommendations<T>(): Promise<Result<T>>;
  diagnostic<T>(): Promise<Result<T>>;
  answerDiagnostic(questionId: string, selectedIndex: number): Promise<Result<void>>;
  completeDiagnostic<T>(): Promise<Result<T>>;
  gamification<T>(signal?: AbortSignal): Promise<Result<T>>;
  lesson<T>(lessonId: string): Promise<Result<T>>;
  completeLesson(lessonId: string, timeSeconds: number): Promise<Result<void>>;
  confirmExercise(lessonId: string, questionId: string): Promise<Result<void>>;
  nextQuestion<T>(subject: string): Promise<Result<T>>;
  answerQuestion<T>(questionId: string, answer: Answer): Promise<Result<T>>;
  personalize(payload: object): Promise<Result<void>>;
  leaderboard<T>(query: string, signal?: AbortSignal): Promise<Result<T>>;
  saveLeaderboardPreferences(preferences: object, signal?: AbortSignal): Promise<Result<void>>;
}

export interface TeacherGateway {
  overview<T>(): Promise<Result<T>>;
  classes<T>(): Promise<Result<T>>;
  difficultyAlerts<T>(): Promise<Result<T>>;
  contents<T>(): Promise<Result<T>>;
  classDetail<T>(classId: string): Promise<Result<T>>;
  createClass<T>(draft: object): Promise<Result<T>>;
  addStudent(classId: string, studentEmail: string): Promise<Result<void>>;
  removeStudent(classId: string, studentId: string): Promise<Result<void>>;
  exportReport(classId: string, studentId?: string): Promise<Result<Blob>>;
  createContent<T>(draft: object): Promise<Result<T>>;
  importContents<T>(format: 'json' | 'csv', content: string): Promise<Result<T>>;
  recommend<T>(classId: string, studentId?: string): Promise<Result<T>>;
  classLeaderboard<T>(classId: string, query: string, signal?: AbortSignal): Promise<Result<T>>;
  questions<T>(): Promise<Result<T>>;
  generateQuestion<T>(parameters: object): Promise<Result<T>>;
  reviewQuestion<T>(questionId: string, review: object): Promise<Result<T>>;
  notificationPreferences<T>(signal?: AbortSignal): Promise<Result<T>>;
  saveNotificationPreferences(preferences: object): Promise<Result<void>>;
}

export interface AdminGateway {
  overview<T>(): Promise<Result<T>>;
  users<T>(): Promise<Result<T>>;
  createUser(account: object): Promise<Result<void>>;
  deleteUser(userId: string, confirmation: string, reason: string): Promise<Result<void>>;
  teacherRequests<T>(): Promise<Result<T>>;
  approveTeacher(userId: string, subject: string): Promise<Result<void>>;
  subjects<T>(): Promise<Result<T>>;
  createSubject(subject: object): Promise<Result<void>>;
  createModule(subjectId: string, module: object): Promise<Result<void>>;
  createLesson(moduleId: string, lesson: object): Promise<Result<void>>;
  mandatoryExercises<T>(lessonId: string): Promise<Result<T>>;
  saveMandatoryExercises<T>(lessonId: string, questionIds: string[]): Promise<Result<T>>;
  /** Leitura de um painel agregado; o caminho já traz os filtros escolhidos. */
  panel<T>(path: string, signal?: AbortSignal): Promise<Result<T>>;
  auditLogs<T>(query: string): Promise<Result<T>>;
  admissions<T>(signal?: AbortSignal): Promise<Result<T>>;
  reviewAdmission(requestId: string, decision: string, note: string): Promise<Result<void>>;
}

export interface Gateways {
  account: AccountGateway;
  communication: CommunicationGateway;
  privacy: PrivacyGateway;
  student: StudentGateway;
  teacher: TeacherGateway;
  admin: AdminGateway;
}
