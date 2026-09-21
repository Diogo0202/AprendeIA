export type LessonSummary = {
  id: string;
  title: string;
  position: number;
  estimated_minutes: number;
  summary: string;
  learning_objectives: string[];
  completed: boolean;
  time_seconds: number;
  last_accessed_at?: string | null;
};
export type SubjectModule = {
  id: string;
  title: string;
  position: number;
  completed_lessons: number;
  total_lessons: number;
  lessons: LessonSummary[];
};

export type StudentSubject = {
  id: string;
  name: string;
  description: string;
  category: string;
  code: string;
  completed_lessons: number;
  total_lessons: number;
  remaining_lessons: number;
  difficulty: string;
  tone: string;
  topics: { topic: string; accuracy: number; attempts: number; level?: string }[];
  modules: SubjectModule[];
};

export type TopicMastery = {
  subject_id: string;
  subject: string;
  topic: string;
  attempts: number;
  accuracy: number;
  status: "mastered" | "developing" | "fragile";
};

export type StudyRecommendation = TopicMastery & {
  reason: string;
  lessons: {
    id: string;
    subject_id: string;
    subject: string;
    module: string;
    title: string;
    summary: string;
    completed: boolean;
  }[];
};

export type LearningRecommendations = {
  mastery: TopicMastery[];
  recommendations: StudyRecommendation[];
};

export type PublicQuestion = {
  id: string;
  subject: string;
  topic: string;
  difficulty: string;
  question: string;
  options: string[];
};

export type DiagnosticState = {
  status: "open" | "completed";
  session_id: string;
  completed_at?: string;
  answered_question_ids?: string[];
  questions?: PublicQuestion[];
  mastery?: TopicMastery[];
  recommendations?: StudyRecommendation[];
};

export type LessonDetail = LessonSummary & {
  content: string;
  modules: { subject_id: string; title: string; subjects: { name: string } };
  progress: { completed: boolean; time_seconds: number; last_accessed_at?: string };
  required_exercises: RequiredExercise[];
};

export type RequiredExercise = PublicQuestion & {
  position: number;
  answered: boolean;
  checked: boolean;
};
