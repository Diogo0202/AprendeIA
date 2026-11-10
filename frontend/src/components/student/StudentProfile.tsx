import { CSSProperties, useEffect, useState } from 'react';
import { CommunicationCenter } from '../CommunicationCenter';
import { NavigationDock } from '../NavigationDock';
import { LegalDocuments } from '../LegalDocuments';
import { DiagnosticAssessment } from './DiagnosticAssessment';
import { LessonReader } from './LessonReader';
import { Leaderboard } from './Leaderboard';
import { GamificationAchievements } from './GamificationAchievements';
import { apiError, apiFetch } from '../../lib/api';
import { isSupabaseConfigured } from '../../lib/supabase';
import type {
  DiagnosticState,
  LearningRecommendations,
  StudentSubject,
} from '../../types/learning';
import type { UserProfile, GamificationSummary } from '../../types/app';
import { applyAccentTheme } from '../../lib/theme';
import { demoSubjects, demoGamification } from './demoData';
import { Header, Avatar, Difficulty } from '../layout/Chrome';
import { ProfileSetup } from './ProfileSetup';

/** Resume aulas, progresso e dificuldades para orientar o próximo estudo. */
export function StudentProfile({
  profile,
  onProfileChange,
  onLogout,
  onChangePassword,
  onPractice,
}: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onLogout: () => void;
  onChangePassword: () => void;
  onPractice: (subject?: string) => void;
}) {
  const [gamification, setGamification] = useState<GamificationSummary | null>(
    isSupabaseConfigured ? null : demoGamification,
  );
  const [gamificationError, setGamificationError] = useState('');
  const [studentSubjects, setStudentSubjects] = useState<StudentSubject[]>(
    isSupabaseConfigured ? [] : demoSubjects,
  );
  const [recommendations, setRecommendations] = useState<LearningRecommendations>({
    mastery: [],
    recommendations: [],
  });
  const [diagnostic, setDiagnostic] = useState<DiagnosticState | null>(
    isSupabaseConfigured ? null : { status: 'completed', session_id: 'demo' },
  );
  const [learningLoading, setLearningLoading] = useState(isSupabaseConfigured);
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
    if (!isSupabaseConfigured) return;
    let active = true;
    apiFetch('/student/gamification')
      .then(async (response) => {
        if (!response.ok) throw new Error('gamification request failed');
        return (await response.json()) as GamificationSummary;
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
    if (!isSupabaseConfigured) return;
    let active = true;
    setLearningLoading(true);
    Promise.all([
      apiFetch('/student/subjects'),
      apiFetch('/student/recommendations'),
      apiFetch('/student/diagnostic'),
    ])
      .then(async ([subjectsResponse, recommendationsResponse, diagnosticResponse]) => {
        if (!subjectsResponse.ok)
          throw new Error(
            await apiError(subjectsResponse, 'Não foi possível carregar as matérias.'),
          );
        if (!recommendationsResponse.ok)
          throw new Error(
            await apiError(recommendationsResponse, 'Não foi possível carregar as recomendações.'),
          );
        if (!diagnosticResponse.ok)
          throw new Error(
            await apiError(diagnosticResponse, 'Não foi possível abrir a avaliação diagnóstica.'),
          );
        return Promise.all([
          subjectsResponse.json() as Promise<StudentSubject[]>,
          recommendationsResponse.json() as Promise<LearningRecommendations>,
          diagnosticResponse.json() as Promise<DiagnosticState>,
        ]);
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

  if (isEditingProfile) {
    return (
      <main id="main-content" tabIndex={-1} className="profile-page">
        <Header area="PERSONALIZAR PERFIL" onLogout={onLogout} />
        <ProfileSetup
          profile={profile}
          achievements={gamification?.achievements ?? []}
          canCancel={profile.profileSetupComplete}
          onCancel={() => {
            applyAccentTheme(profile.accentTheme);
            setIsEditingProfile(false);
          }}
          onSave={(nextProfile) => {
            onProfileChange(nextProfile);
            setIsEditingProfile(false);
          }}
        />
      </main>
    );
  }

  if (diagnostic?.status === 'open') {
    return (
      <main id="main-content" tabIndex={-1} className="profile-page">
        <Header area="AVALIAÇÃO DIAGNÓSTICA" onLogout={onLogout} />
        <DiagnosticAssessment
          diagnostic={diagnostic}
          onComplete={(result) => {
            setRecommendations(result);
            setDiagnostic({
              ...diagnostic,
              status: 'completed',
              mastery: result.mastery,
              recommendations: result.recommendations,
            });
          }}
        />
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="profile-page">
      <Header area="ÁREA DO ESTUDANTE" onLogout={onLogout} />
      <div className="student-app-shell">
        <aside className="student-sidebar" aria-label="Menu do estudante">
          <div className="student-sidebar-brand">
            <strong>Seu espaço</strong>
            <small>Aprendizagem guiada</small>
          </div>
          <NavigationDock
            ariaLabel="Menu do estudante"
            items={[
              {
                id: 'study',
                label: 'Estudo',
                glyph: 'ES',
                onSelect: () =>
                  document
                    .getElementById('student-subjects')
                    ?.scrollIntoView({ behavior: 'smooth' }),
              },
              {
                id: 'teacher',
                label: 'Professor',
                glyph: 'PR',
                active: communicationMode === 'direct',
                onSelect: () => openStudentCommunication('direct'),
              },
              { id: 'exercises', label: 'Exercícios', glyph: 'EX', onSelect: () => onPractice() },
              {
                id: 'ranking',
                label: 'Ranking e conquistas',
                glyph: 'XP',
                onSelect: () =>
                  document
                    .getElementById('student-ranking')
                    ?.scrollIntoView({ behavior: 'smooth' }),
              },
              {
                id: 'assistant',
                label: 'Perguntar à IA',
                glyph: 'IA',
                active: communicationMode === 'ai',
                onSelect: () => openStudentCommunication('ai'),
              },
              {
                id: 'report',
                label: 'Boletim',
                glyph: 'BL',
                onSelect: () =>
                  document.getElementById('student-report')?.scrollIntoView({ behavior: 'smooth' }),
              },
              {
                id: 'legal',
                label: 'Termos e privacidade',
                glyph: 'TP',
                onSelect: () =>
                  document.getElementById('student-legal')?.scrollIntoView({ behavior: 'smooth' }),
              },
            ]}
          />
          <div className="student-sidebar-account">
            <button type="button" onClick={onChangePassword}>
              Alterar senha
            </button>
            <a href="#student-legal">Termos e política</a>
            <a href="#student-certificates">Certificados</a>
          </div>
        </aside>
        <section className="profile-content student-content">
          <section className="student-hero" aria-labelledby="student-name">
            <div className="student-avatar-column">
              <div className="student-avatar-wrap">
                <Avatar
                  name={profile.name}
                  avatarKey={profile.avatarKey}
                  className="student-avatar"
                  size={104}
                />
                {gamification?.achievements.find(
                  (achievement) => achievement.id === profile.featuredBadgeId,
                ) && (
                  <span className="featured-badge" title="Insígnia em destaque">
                    {
                      gamification.achievements.find(
                        (achievement) => achievement.id === profile.featuredBadgeId,
                      )?.icon
                    }
                  </span>
                )}
              </div>
              {gamification ? (
                <GamificationAchievements
                  data={{
                    points: gamification.points,
                    weekly_xp: gamification.weekly_xp ?? 0,
                    bonus_xp: gamification.bonus_xp ?? 0,
                    catalog: gamification.catalog,
                    achievements: gamification.achievements.map((item) => ({
                      bonus_xp: 0,
                      progress: 1,
                      target: 1,
                      ...item,
                      unlocked: true,
                    })),
                  }}
                />
              ) : (
                <p className="achievement-empty">Preparando suas conquistas...</p>
              )}
            </div>
            <div className="student-intro">
              <p className="eyebrow">MINHA JORNADA</p>
              <h1 id="student-name">Olá, {profile.name.split(' ')[0]}!</h1>
              <p className="subtitle">
                Cada aula e cada resposta ajudam a construir o seu caminho.
              </p>
              <button
                type="button"
                className="profile-edit-button"
                onClick={() => setIsEditingProfile(true)}
              >
                Personalizar perfil
              </button>
              {gamification && (
                <dl className="journey-stats" aria-label="Resumo da jornada">
                  <div>
                    <dt>Sequência</dt>
                    <dd>{gamification.current_streak} dias</dd>
                  </div>
                  <div>
                    <dt>Acertos</dt>
                    <dd>{gamification.accuracy_percent}%</dd>
                  </div>
                  <div>
                    <dt>Dias ativos</dt>
                    <dd>{gamification.active_days}</dd>
                  </div>
                </dl>
              )}
            </div>
            <section className="level-card" aria-label="Seu nível atual">
              {gamification ? (
                <>
                  <div className="level-ring" style={levelStyle}>
                    <progress
                      value={gamification.level_progress}
                      max="100"
                      aria-label={`${gamification.level_progress}% do caminho para o próximo nível`}
                    />
                    <span>
                      <strong>{gamification.level}</strong>Nível
                    </span>
                  </div>
                  <p>
                    <strong>{gamification.points} XP</strong> de {gamification.next_level_points} XP
                  </p>
                  <small>
                    {gamification.weekly_xp ?? 0} XP nesta semana. Continue estudando para subir de
                    nível.
                  </small>
                </>
              ) : (
                <p>Preparando sua jornada...</p>
              )}
            </section>
          </section>
          <section id="student-ranking" aria-label="Ranking e conquistas">
            <Leaderboard connected={isSupabaseConfigured} />
          </section>
          {gamificationError && (
            <p className="gamification-message" role="status">
              {gamificationError}
            </p>
          )}
          {learningError && (
            <p className="gamification-message" role="alert">
              {learningError}
            </p>
          )}
          {learningLoading && (
            <p className="catalog-loading" role="status">
              Carregando matérias e recomendações...
            </p>
          )}
          <section
            className="student-report-summary"
            id="student-report"
            aria-labelledby="student-report-title"
          >
            <div>
              <h2 id="student-report-title">Meu boletim</h2>
              <p>Acompanhe a evolução registrada nas aulas e exercícios.</p>
            </div>
            <dl>
              <div>
                <dt>Acertos</dt>
                <dd>{gamification?.accuracy_percent ?? 0}%</dd>
              </div>
              <div>
                <dt>Aulas concluídas</dt>
                <dd>
                  {studentSubjects.reduce((total, subject) => total + subject.completed_lessons, 0)}
                </dd>
              </div>
              <div>
                <dt>Certificados</dt>
                <dd id="student-certificates">0</dd>
              </div>
            </dl>
            <p id="student-terms">
              Os certificados são liberados ao concluir todos os requisitos da matéria. Seus dados
              de estudo seguem os Termos de Uso e a Política de Privacidade do AprendeIA.
            </p>
          </section>
          <div id="student-communications" className="student-communications-anchor">
            <CommunicationCenter role="student" requestedMode={communicationMode} />
          </div>
          <button className="primary-button practice-button" onClick={() => onPractice()}>
            Praticar questões com IA
          </button>
          <section
            className="section subject-catalog"
            id="student-subjects"
            aria-labelledby="subjects-title"
          >
            <div className="catalog-heading">
              <div>
                <h2 id="subjects-title">Todas as matérias</h2>
                <p>Escolha uma matéria e continue pelo módulo em andamento.</p>
              </div>
              <label className="subject-search">
                <span>Buscar matéria</span>
                <input
                  type="search"
                  value={subjectQuery}
                  onChange={(event) => setSubjectQuery(event.target.value)}
                  placeholder="Ex.: Matemática"
                />
              </label>
            </div>
            <div className="category-filters" role="group" aria-label="Filtrar matérias por área">
              {subjectCategories.map((category) => (
                <button
                  className={activeCategory === category ? 'active' : ''}
                  type="button"
                  aria-pressed={activeCategory === category}
                  onClick={() => setActiveCategory(category)}
                  key={category}
                >
                  {category}
                </button>
              ))}
            </div>
            {visibleSubjects.length ? (
              <div className="subject-grid">
                {visibleSubjects.map((subject) => {
                  const currentModule =
                    subject.modules.find((module) =>
                      module.lessons.some((lesson) => !lesson.completed),
                    ) ?? subject.modules[0];
                  const nextLesson =
                    currentModule?.lessons.find((lesson) => !lesson.completed) ??
                    currentModule?.lessons[0];
                  return (
                    <article className="subject-card" key={subject.id}>
                      <div className={`subject-cover catalog-cover ${subject.tone}`}>
                        <span>{subject.category}</span>
                        <strong aria-hidden="true">{subject.code}</strong>
                      </div>
                      <div className="subject-card-body">
                        <div className="subject-card-heading">
                          <span className={`difficulty ${subject.tone}`}>{subject.difficulty}</span>
                          <h3>{subject.name}</h3>
                          <p>{currentModule?.title || 'Conteúdo em preparação'}</p>
                        </div>
                        <div className="course-meta" aria-label={`Progresso em ${subject.name}`}>
                          <span>
                            <strong>{subject.total_lessons}</strong> aulas
                          </span>
                          <span>
                            <strong>{subject.completed_lessons}</strong> concluídas
                          </span>
                        </div>
                        <progress
                          className="course-progress"
                          value={subject.completed_lessons}
                          max={Math.max(1, subject.total_lessons)}
                          aria-label={`${subject.completed_lessons} de ${subject.total_lessons} aulas concluídas`}
                        />
                        <div className="subject-card-footer">
                          <span>Faltam {subject.remaining_lessons} aulas</span>
                          <button
                            type="button"
                            onClick={() =>
                              nextLesson
                                ? setSelectedLessonId(nextLesson.id)
                                : onPractice(subject.name)
                            }
                          >
                            {nextLesson ? 'Abrir aula' : 'Praticar'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="catalog-empty" role="status">
                <strong>Nenhuma matéria encontrada.</strong>
                <span>Limpe a busca ou escolha outra área.</span>
              </div>
            )}
          </section>
          <section
            className="section recommendation-section"
            aria-labelledby="recommendations-title"
          >
            <div className="section-heading">
              <h2 id="recommendations-title">Recomendado para você</h2>
              <span>Escolhido a partir dos tópicos que pedem mais atenção</span>
            </div>
            {recommendations.recommendations.length ? (
              <div className="recommendation-list">
                {recommendations.recommendations.map((recommendation) => (
                  <article key={`${recommendation.subject_id}-${recommendation.topic}`}>
                    <div>
                      <strong>{recommendation.topic}</strong>
                      <span>
                        {recommendation.subject} - {recommendation.accuracy}% de acertos
                      </span>
                      <p>{recommendation.reason}</p>
                    </div>
                    {recommendation.lessons[0] ? (
                      <button
                        type="button"
                        className="outline-button"
                        onClick={() => setSelectedLessonId(recommendation.lessons[0].id)}
                      >
                        Estudar {recommendation.lessons[0].title}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="outline-button"
                        onClick={() => onPractice(recommendation.subject)}
                      >
                        Praticar agora
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="catalog-empty">
                <strong>Continue praticando.</strong>
                <span>Com mais respostas, as recomendações ficam mais precisas.</span>
              </div>
            )}
          </section>
          <section className="section">
            <div className="section-heading">
              <h2>Minhas dificuldades</h2>
              <span>Identificadas pelas suas atividades</span>
            </div>
            <div className="difficulty-list">
              {recommendations.mastery.length ? (
                recommendations.mastery.map((topic) => (
                  <article className="difficulty-row" key={`${topic.subject_id}-${topic.topic}`}>
                    <div>
                      <strong>{topic.subject}</strong>
                      <span>
                        {topic.topic} - {topic.attempts} tentativa(s)
                      </span>
                    </div>
                    <Difficulty
                      level={
                        topic.status === 'mastered'
                          ? 'Dominado'
                          : topic.status === 'fragile'
                            ? 'Frágil'
                            : 'Em desenvolvimento'
                      }
                      tone={
                        topic.status === 'mastered'
                          ? 'low'
                          : topic.status === 'fragile'
                            ? 'high'
                            : 'medium'
                      }
                    />
                  </article>
                ))
              ) : (
                <p className="teacher-empty">
                  Ainda não há tentativas suficientes para mapear seus tópicos.
                </p>
              )}
            </div>
          </section>
          <LegalDocuments id="student-legal" />
        </section>
      </div>
      {selectedLessonId && (
        <LessonReader
          lessonId={selectedLessonId}
          onClose={() => setSelectedLessonId(null)}
          onUpdated={() => setCatalogVersion((version) => version + 1)}
        />
      )}
    </main>
  );
}
