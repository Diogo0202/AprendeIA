import type { UserProfile } from '../../domain/app';

// Dados de demonstração permitem apresentar o TCC sem serviços externos.
export const initialProfile: UserProfile = {
  name: 'Diogo Mendes Baptista',
  email: 'diogo@email.com',
  grade: 'Graduação',
  goal: 'Reforçar meus estudos',
  role: 'student',
  avatarKey: 'orbit',
  featuredBadgeId: null,
  accentTheme: 'wine',
  profileSetupComplete: false,
};
