export type AvatarKey = 'orbit' | 'spark' | 'books' | 'prism' | 'trail';

export type GamificationAchievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  bonus_xp: number;
  unlocked: boolean;
  progress: number;
  target: number;
};
// As visualizações funcionam como uma navegação leve para este protótipo.
export type View =
  | 'login'
  | 'signup'
  | 'privacy-consent'
  | 'forgot-password'
  | 'reset-password'
  | 'student'
  | 'teacher'
  | 'teacher-pending'
  | 'admin'
  | 'practice';

export type Role = 'student' | 'teacher' | 'admin';

export type SignupRole = Extract<Role, 'student' | 'teacher'>;

export type AccentTheme = 'wine' | 'ocean' | 'forest' | 'amber';

export type UserProfile = {
  id?: string;
  name: string;
  email: string;
  grade: string;
  goal: string;
  role: Role;
  registrationStatus?: 'active' | 'pending_teacher';
  requestedSubject?: string;
  avatarKey: AvatarKey;
  featuredBadgeId: string | null;
  accentTheme: AccentTheme;
  profileSetupComplete: boolean;
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

export type GamificationSummary = {
  points: number;
  level: number;
  next_level_points: number;
  level_progress: number;
  accuracy_percent: number;
  active_days: number;
  current_streak: number;
  achievements: Achievement[];
  weekly_xp?: number;
  bonus_xp?: number;
  catalog?: GamificationAchievement[];
};
