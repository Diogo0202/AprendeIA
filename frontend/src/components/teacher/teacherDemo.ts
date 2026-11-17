import type {
  TeacherStudent,
  TeacherClass,
  TeacherContent,
  TeacherAlert,
} from '../../domain/teacher';

// O modo local continua útil para apresentar o TCC, mas não cria permissões reais.
export const demoTeacherStudents: TeacherStudent[] = [
  {
    id: 'demo-ana',
    full_name: 'Ana Souza',
    grade: '8º ano',
    subject: 'Matemática',
    accuracy: 42,
    attempts: 12,
    difficulty: 'Alta',
    time_minutes: 155,
    completed_lessons: 5,
    trend: [
      { week: 'S34', accuracy: 38, difficulty_score: 62, attempts: 4, level: 'Alta' },
      { week: 'S35', accuracy: 46, difficulty_score: 54, attempts: 5, level: 'Alta' },
      { week: 'S36', accuracy: 58, difficulty_score: 42, attempts: 3, level: 'Alta' },
    ],
    difficulties: [{ topic: 'Frações', accuracy: 40, attempts: 5 }],
    recent_attempts: [
      { answered_at: '2026-09-08', topic: 'Frações equivalentes', correct: true },
      { answered_at: '2026-09-07', topic: 'Porcentagem', correct: false },
    ],
  },
  {
    id: 'demo-bruno',
    full_name: 'Bruno Lima',
    grade: '8º ano',
    subject: 'Matemática',
    accuracy: 78,
    attempts: 18,
    difficulty: 'Média',
    time_minutes: 194,
    completed_lessons: 7,
    trend: [
      { week: 'S34', accuracy: 62, difficulty_score: 38, attempts: 6, level: 'Média' },
      { week: 'S35', accuracy: 72, difficulty_score: 28, attempts: 6, level: 'Média' },
      { week: 'S36', accuracy: 83, difficulty_score: 17, attempts: 6, level: 'Baixa' },
    ],
    difficulties: [{ topic: 'Equações', accuracy: 68, attempts: 6 }],
    recent_attempts: [
      { answered_at: '2026-09-08', topic: 'Equações', correct: true },
      { answered_at: '2026-09-06', topic: 'Frações', correct: true },
    ],
  },
];

export const demoTeacherClasses: TeacherClass[] = [
  {
    id: 'demo-class-a',
    name: '8º ano A',
    school_year: '2026',
    subject: 'Matemática',
    student_count: 2,
    students: demoTeacherStudents,
    trend: [
      { week: 'S34', accuracy: 50, difficulty_score: 50, attempts: 10, level: 'Alta' },
      { week: 'S35', accuracy: 59, difficulty_score: 41, attempts: 11, level: 'Alta' },
      { week: 'S36', accuracy: 71, difficulty_score: 29, attempts: 9, level: 'Média' },
    ],
  },
  {
    id: 'demo-class-b',
    name: '9º ano B',
    school_year: '2026',
    subject: 'Matemática',
    student_count: 0,
    students: [],
    trend: [],
  },
];

export const emptyTeacherClass: TeacherClass = {
  id: '',
  name: 'Nenhuma turma selecionada',
  school_year: '',
  subject: '',
  student_count: 0,
  students: [],
  trend: [],
};

export const demoTeacherContents: TeacherContent[] = [
  {
    id: 'demo-content-1',
    title: 'Frações com apoio visual',
    description: 'Sequência curta para retomar equivalência e comparação.',
    content_type: 'lesson',
    source_url: '',
  },
  {
    id: 'demo-content-2',
    title: 'Lista guiada de porcentagem',
    description: 'Exercícios progressivos com situações do dia a dia.',
    content_type: 'exercise',
    source_url: '',
  },
];

export const demoTeacherAlerts: TeacherAlert[] = [
  {
    id: 'demo-alert',
    student_id: 'demo-ana',
    student_name: 'Ana Souza',
    student_grade: '8º ano',
    subject: 'Matemática',
    topic: 'Frações',
    accuracy: 40,
    attempts: 5,
    status: 'active',
  },
];
