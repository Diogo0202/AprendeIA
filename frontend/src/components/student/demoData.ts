import type { StudentSubject } from '../../types/learning';
import type { GamificationSummary } from '../../types/app';

// Esta reserva aparece apenas no modo de apresentação sem banco configurado.
export const demoSubjects: StudentSubject[] = [
  {
    id: 'demo-math',
    name: 'Matemática',
    description: 'Raciocínio lógico, números e resolução de problemas.',
    category: 'Ciências Exatas',
    code: 'MA',
    completed_lessons: 1,
    total_lessons: 2,
    remaining_lessons: 1,
    difficulty: 'Alta',
    tone: 'high',
    topics: [{ topic: 'Frações', accuracy: 40, attempts: 5 }],
    modules: [
      {
        id: 'demo-module',
        title: 'Frações e porcentagens',
        position: 1,
        completed_lessons: 1,
        total_lessons: 2,
        lessons: [
          {
            id: 'demo-lesson-1',
            title: 'Conceito de fração',
            position: 1,
            estimated_minutes: 15,
            summary: 'Entenda numerador e denominador.',
            learning_objectives: [],
            completed: true,
            time_seconds: 900,
          },
          {
            id: 'demo-lesson-2',
            title: 'Frações equivalentes',
            position: 2,
            estimated_minutes: 15,
            summary: 'Compare frações com o mesmo valor.',
            learning_objectives: [],
            completed: false,
            time_seconds: 0,
          },
        ],
      },
    ],
  },
];

// Estes dados só aparecem sem Supabase para a apresentação não esconder a jornada.
export const demoGamification: GamificationSummary = {
  points: 400,
  level: 2,
  next_level_points: 500,
  level_progress: 60,
  accuracy_percent: 80,
  active_days: 4,
  current_streak: 3,
  achievements: [
    {
      id: 'first_lesson',
      title: 'Primeiro passo',
      description: 'Concluiu sua primeira aula.',
      icon: '🌱',
    },
    {
      id: 'study_streak',
      title: 'Ritmo de estudo',
      description: 'Estudou por 3 dias seguidos.',
      icon: '🔥',
    },
    {
      id: 'ten_correct_answers',
      title: 'Mente afiada',
      description: 'Acertou 10 questões.',
      icon: '🎯',
    },
    {
      id: 'excellent_accuracy',
      title: 'Em ótima fase',
      description: 'Chegou a 80% de acertos.',
      icon: '⭐',
    },
  ],
};
