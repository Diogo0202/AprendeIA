import type { Role } from './app';

/** Contratos das telas administrativas, como a API os devolve. */
export type { Role };

export type TrendPoint = { week_start: string; attempts: number; accuracy: number | null };
export type GroupMetrics = {
  students: number;
  small_sample: boolean;
  attempts: number | null;
  accuracy: number | null;
  completed_lessons: number | null;
  active_alerts: number | null;
  trend: TrendPoint[];
};
export type ClassPerformance = GroupMetrics & {
  id: string;
  name: string;
  school_year: string;
  subject: string;
  teacher_id: string | null;
  teacher_name: string;
};
export type TeacherPerformance = GroupMetrics & {
  id: string;
  full_name: string;
  subject: string;
  classes: number;
};
export type Performance = {
  min_group_size: number;
  classes: ClassPerformance[];
  teachers: TeacherPerformance[];
};
export type TeacherRow = {
  id: string;
  full_name: string;
  email: string;
  registration_status: string;
  subject: string | null;
  classes: number;
  students: number;
};
export type ClassRow = {
  id: string;
  name: string;
  school_year: string;
  subject: string;
  teacher_name: string;
  students: number;
};
export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  registration_status?: string | null;
  created_at?: string | null;
};

export const roleLabels: Record<Role, string> = {
  student: 'Estudante',
  teacher: 'Professor',
  admin: 'Administração',
};
