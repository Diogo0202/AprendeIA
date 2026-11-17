/** Contratos do painel do professor, como a API os devolve. */
export type TeacherStudent = {
  id: string;
  full_name: string;
  grade: string;
  email?: string;
  subject?: string;
  accuracy: number;
  attempts: number;
  difficulty: string;
  time_minutes: number;
  completed_lessons: number;
  trend: TrendPoint[];
  difficulties: { topic: string; accuracy: number; attempts: number }[];
  recent_attempts: { answered_at: string; topic: string; correct: boolean }[];
};

export type TrendPoint = {
  week: string;
  accuracy: number;
  difficulty_score: number;
  attempts: number;
  level: string;
};

export type TeacherClass = {
  id: string;
  name: string;
  school_year: string;
  subject: string;
  student_count: number;
  students?: TeacherStudent[];
  trend?: TrendPoint[];
};

export type TeacherOverview = {
  subject: string;
  class_count: number;
  student_count: number;
  active_alerts: number;
  average_accuracy: number;
};

export type TeacherContent = {
  id: string;
  title: string;
  description: string;
  content_type: 'lesson' | 'exercise' | 'video' | 'link';
  source_url: string;
  created_at?: string;
};

export type TeacherRecommendation = {
  diagnosis: string;
  objective: string;
  actions: string[];
  content_suggestion: string;
};

export type TeacherAlert = {
  id: string;
  student_id?: string;
  student_name: string;
  student_grade?: string;
  subject: string;
  topic: string;
  accuracy: number;
  attempts: number;
  status: 'active' | 'resolved';
};

export type TeacherTab =
  'overview' | 'classes' | 'reports' | 'contents' | 'questions' | 'messages' | 'ai' | 'legal';
