import { CSSProperties, useEffect, useState } from 'react';
import { gateways, isConnected } from '../../application/gateways';
import { failureMessage } from '../../application/result';
import type {
  DiagnosticState,
  LearningRecommendations,
  StudentSubject,
} from '../../domain/learning';
import type { UserProfile, GamificationSummary } from '../../domain/app';
import { demoSubjects, demoGamification } from './demoData';

/** Estado e ações de StudentProfile; a tela só exibe o que este hook devolve. */
export function useStudentProfile({ profile }: { profile: UserProfile }) {
  const [gamification, setGamification] = useState<GamificationSummary | null>(
    isConnected() ? null : demoGamification,
  );
  const [gamificationError, setGamificationError] = useState('');
  const [studentSubjects, setStudentSubjects] = useState<StudentSubject[]>(
    isConnected() ? [] : demoSubjects,
  );
  const [recommendations, setRecommendations] = useState<LearningRecommendations>({
    mastery: [],
    recommendations: [],
  });
  const [diagnostic, setDiagnostic] = useState<DiagnosticState | null>(
    isConnected() ? null : { status: 'completed', session_id: 'demo' },
  );
  const [learningLoading, setLearningLoading] = useState(isConnected());
  const [learningError, setLearningError] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [subjectQuery, setSubjectQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todas');
  const [isEditingProfile, setIsEditingProfile] = useState(!profile.profileSetupComplete);
  const [communicationMode, setCommunicationMode] = useState<'direct' | 'ai'>('direct');

  function openStudentCommunication(mode: 'direct' | 'ai') {
    setCommunicationMode(mode);
    window.requestAnimationFrame(() => {
      document
        .getElementById('student-communications')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // A pontuação vem da API para que o navegador nunca consiga premiar a si mesmo.
  useEffect(() => {
    if (!isConnected()) return;
    let active = true;
    gateways()
      .student.gamification<GamificationSummary>()
      .then((result) => {
        if (!result.ok) throw new Error('gamification request failed');
        return result.data;
      })
      .then((summary) => {
        if (active) setGamification(summary);
      })
      .catch(() => {
        if (active)
          setGamificationError(
            'Não foi possível atualizar suas conquistas agora. Tente novamente mais tarde.',
          );
      });
    return () => {
      active = false;
    };
  }, []);

  // O catálogo, o diagnóstico e as recomendações usam a mesma sessão, mas cada
  // resposta mantém seu próprio estado para a tela continuar útil em falha parcial.
  useEffect(() => {
    if (!isConnected()) return;
    let active = true;
    setLearningLoading(true);
    const { student } = gateways();
    Promise.all([
      student.subjects<StudentSubject[]>(),
      student.recommendations<LearningRecommendations>(),
      student.diagnostic<DiagnosticState>(),
    ])
      .then(([subjects, recommendations, diagnostic]) => {
        if (!subjects.ok)
          throw new Error(failureMessage(subjects, 'Não foi possível carregar as matérias.'));
        if (!recommendations.ok)
          throw new Error(
            failureMessage(recommendations, 'Não foi possível carregar as recomendações.'),
          );
        if (!diagnostic.ok)
          throw new Error(
            failureMessage(diagnostic, 'Não foi possível abrir a avaliação diagnóstica.'),
          );
        return [subjects.data, recommendations.data, diagnostic.data] as const;
      })
      .then(([nextSubjects, nextRecommendations, nextDiagnostic]) => {
        if (!active) return;
        setStudentSubjects(nextSubjects);
        setRecommendations(nextRecommendations);
        setDiagnostic(nextDiagnostic);
        setLearningError('');
      })
      .catch((error) => {
        if (active)
          setLearningError(
            error instanceof Error ? error.message : 'Não foi possível carregar sua jornada.',
          );
      })
      .finally(() => active && setLearningLoading(false));
    return () => {
      active = false;
    };
  }, [catalogVersion]);

  const levelStyle = gamification
    ? ({ '--progress': gamification.level_progress } as CSSProperties &
        Record<'--progress', number>)
    : undefined;

  const normalizedQuery = subjectQuery.trim().toLocaleLowerCase('pt-BR');
  const subjectCategories = [
    'Todas',
    ...Array.from(new Set(studentSubjects.map((subject) => subject.category))),
  ];
  const visibleSubjects = studentSubjects.filter((subject) => {
    const matchesCategory = activeCategory === 'Todas' || subject.category === activeCategory;
    const matchesSearch =
      !normalizedQuery ||
      `${subject.name} ${subject.modules.map((module) => module.title).join(' ')} ${subject.category}`
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedQuery);
    return matchesCategory && matchesSearch;
  });

  return {
    gamification,
    gamificationError,
    studentSubjects,
    recommendations,
    setRecommendations,
    diagnostic,
    setDiagnostic,
    learningLoading,
    learningError,
    selectedLessonId,
    setSelectedLessonId,
    setCatalogVersion,
    subjectQuery,
    setSubjectQuery,
    activeCategory,
    setActiveCategory,
    isEditingProfile,
    setIsEditingProfile,
    communicationMode,
    openStudentCommunication,
    levelStyle,
    subjectCategories,
    visibleSubjects,
  };
}
