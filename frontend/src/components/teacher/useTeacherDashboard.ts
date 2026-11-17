import { FormEvent, useEffect, useState } from 'react';
import { gateways, isConnected } from '../../application/gateways';
import type {
  TeacherClass,
  TeacherOverview,
  TeacherContent,
  TeacherRecommendation,
  TeacherAlert,
  TeacherTab,
} from '../../domain/teacher';
import {
  demoTeacherStudents,
  demoTeacherClasses,
  emptyTeacherClass,
  demoTeacherContents,
  demoTeacherAlerts,
} from './teacherDemo';

/** Estado e ações do painel do professor; a tela só exibe o que este hook devolve. */
export function useTeacherDashboard() {
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview');
  const [overview, setOverview] = useState<TeacherOverview>(
    isConnected()
      ? {
          subject: 'Sua disciplina',
          class_count: 0,
          student_count: 0,
          active_alerts: 0,
          average_accuracy: 0,
        }
      : {
          subject: 'Matemática',
          class_count: 2,
          student_count: 2,
          active_alerts: 1,
          average_accuracy: 60,
        },
  );
  const [classes, setClasses] = useState<TeacherClass[]>(isConnected() ? [] : demoTeacherClasses);
  const [selectedClassId, setSelectedClassId] = useState(
    isConnected() ? '' : demoTeacherClasses[0].id,
  );
  const [selectedClass, setSelectedClass] = useState<TeacherClass>(
    isConnected() ? emptyTeacherClass : demoTeacherClasses[0],
  );
  const [selectedStudentId, setSelectedStudentId] = useState(
    isConnected() ? '' : demoTeacherStudents[0].id,
  );
  const [alerts, setAlerts] = useState<TeacherAlert[]>(isConnected() ? [] : demoTeacherAlerts);
  const [contents, setContents] = useState<TeacherContent[]>(
    isConnected() ? [] : demoTeacherContents,
  );
  const [recommendation, setRecommendation] = useState<TeacherRecommendation | null>(null);
  const [message, setMessage] = useState('Painel pronto para acompanhar sua disciplina.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      if (!isConnected()) return;
      setBusy(true);
      try {
        const { teacher } = gateways();
        const [loadedOverview, loadedClasses, loadedAlerts, loadedContents] = await Promise.all([
          teacher.overview<TeacherOverview>(),
          teacher.classes<TeacherClass[]>(),
          teacher.difficultyAlerts<TeacherAlert[]>(),
          teacher.contents<TeacherContent[]>(),
        ]);
        if (!loadedOverview.ok || !loadedClasses.ok || !loadedAlerts.ok || !loadedContents.ok) {
          throw new Error('dashboard-data');
        }
        const nextClasses = loadedClasses.data;
        if (!active) return;
        setOverview(loadedOverview.data);
        setClasses(nextClasses);
        setAlerts(loadedAlerts.data);
        setContents(loadedContents.data);
        setSelectedClassId(nextClasses[0]?.id ?? '');
        if (!nextClasses.length) {
          setSelectedClass(emptyTeacherClass);
          setSelectedStudentId('');
        }
        setMessage('Dados atualizados com segurança.');
      } catch {
        if (active) setMessage('Não foi possível atualizar o painel. Tente novamente.');
      } finally {
        if (active) setBusy(false);
      }
    }
    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadClass() {
      if (!selectedClassId) return;
      if (!isConnected()) {
        const demoClass = demoTeacherClasses.find((item) => item.id === selectedClassId);
        if (demoClass) {
          setSelectedClass(demoClass);
          setSelectedStudentId(
            [...(demoClass.students ?? [])].sort(
              (first, second) => first.accuracy - second.accuracy,
            )[0]?.id ?? '',
          );
        }
        return;
      }
      try {
        const loaded = await gateways().teacher.classDetail<TeacherClass>(selectedClassId);
        if (!loaded.ok) throw new Error('class-data');
        const nextClass = loaded.data;
        if (!active) return;
        setSelectedClass(nextClass);
        setSelectedStudentId(
          [...(nextClass.students ?? [])].sort(
            (first, second) => first.accuracy - second.accuracy,
          )[0]?.id ?? '',
        );
      } catch {
        if (active) setMessage('Não foi possível abrir esta turma.');
      }
    }
    void loadClass();
    return () => {
      active = false;
    };
  }, [selectedClassId]);

  const sortedStudents = [...(selectedClass.students ?? [])].sort(
    (first, second) => first.accuracy - second.accuracy,
  );
  const selectedStudent = sortedStudents.find((student) => student.id === selectedStudentId);
  const tabs: { id: TeacherTab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'classes', label: 'Turmas' },
    { id: 'reports', label: 'Relatórios' },
    { id: 'contents', label: 'Conteúdos' },
    { id: 'questions', label: 'Questões' },
    { id: 'messages', label: 'Mensagens' },
    { id: 'ai', label: 'Recomendação IA' },
    { id: 'legal', label: 'Termos e privacidade' },
  ];
  const teacherGlyphs: Record<TeacherTab, string> = {
    overview: 'VG',
    classes: 'TU',
    reports: 'RL',
    contents: 'CO',
    questions: 'QT',
    messages: 'MS',
    ai: 'IA',
    legal: 'TP',
  };

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draft = {
      name: String(data.get('name')),
      school_year: String(data.get('school_year')),
    };
    setBusy(true);
    try {
      let created: TeacherClass;
      if (isConnected()) {
        const saved = await gateways().teacher.createClass<TeacherClass>(draft);
        if (!saved.ok) throw new Error(saved.detail);
        created = saved.data;
      } else {
        created = {
          id: `demo-${Date.now()}`,
          subject: overview.subject,
          student_count: 0,
          students: [],
          trend: [],
          ...draft,
        };
      }
      setClasses((current) => [...current, created]);
      setSelectedClass(created);
      setSelectedClassId(created.id);
      setActiveTab('classes');
      setMessage('Turma criada com sucesso.');
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message ? error.message : 'Não foi possível criar a turma.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('student_email'));
    if (!selectedClassId) return;
    setBusy(true);
    try {
      if (isConnected()) {
        const { teacher } = gateways();
        const added = await teacher.addStudent(selectedClassId, email);
        if (!added.ok) throw new Error(added.detail);
        const refreshed = await teacher.classDetail<TeacherClass>(selectedClassId);
        // Se a releitura falhar, a turma já exibida continua na tela em vez de um erro virar dado.
        if (refreshed.ok) setSelectedClass(refreshed.data);
      } else {
        setMessage('No modo de demonstração, use os alunos que já aparecem na turma.');
        return;
      }
      setMessage('Estudante incluído na turma. Os dados pessoais não foram alterados.');
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível incluir o estudante.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(studentId: string) {
    if (!isConnected() || !selectedClassId) {
      setMessage('A remoção fica disponível quando o projeto estiver conectado ao Supabase.');
      return;
    }
    setBusy(true);
    try {
      const removed = await gateways().teacher.removeStudent(selectedClassId, studentId);
      if (!removed.ok) throw new Error('Não foi possível remover o vínculo.');
      setSelectedClass((current) => ({
        ...current,
        student_count: Math.max(0, current.student_count - 1),
        students: current.students?.filter((student) => student.id !== studentId),
      }));
      setMessage('Estudante removido da turma. O histórico foi preservado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível remover o estudante.');
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    if (!selectedClassId) return;
    if (!isConnected()) {
      setMessage(
        'Relatório de demonstração preparado. Conecte o Supabase para baixar dados reais.',
      );
      return;
    }
    const report = await gateways().teacher.exportReport(
      selectedClassId,
      selectedStudentId || undefined,
    );
    if (!report.ok) {
      setMessage('Não foi possível exportar o relatório.');
      return;
    }
    const url = URL.createObjectURL(report.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-${selectedStudent?.full_name ?? selectedClass.name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Relatório exportado em CSV.');
  }

  async function createContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draft = {
      title: String(data.get('title')),
      description: String(data.get('description')),
      content_type: String(data.get('content_type')) as TeacherContent['content_type'],
      source_url: String(data.get('source_url')),
    };
    setBusy(true);
    try {
      let created: TeacherContent;
      if (isConnected()) {
        const saved = await gateways().teacher.createContent<TeacherContent>(draft);
        if (!saved.ok) throw new Error(saved.detail);
        created = saved.data;
      } else {
        created = { id: `demo-content-${Date.now()}`, ...draft };
      }
      setContents((current) => [created, ...current]);
      setMessage('Conteúdo salvo na sua disciplina.');
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o conteúdo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function importContents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get('content_file') as File | null;
    if (!file || !/\.(csv|json)$/i.test(file.name) || file.size > 100_000) {
      setMessage('Escolha um arquivo CSV ou JSON de até 100 KB.');
      return;
    }
    if (!isConnected()) {
      setMessage('Arquivo validado. A importação real precisa do Supabase conectado.');
      return;
    }
    setBusy(true);
    try {
      const imported = await gateways().teacher.importContents<{
        contents: TeacherContent[];
        imported: number;
      }>(file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv', await file.text());
      if (!imported.ok) throw new Error(imported.detail);
      const result = imported.data;
      setContents((current) => [...result.contents, ...current]);
      setMessage(`${result.imported} conteúdo(s) importado(s).`);
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível importar o arquivo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestRecommendation() {
    if (!selectedClassId) return;
    setBusy(true);
    setRecommendation(null);
    try {
      if (isConnected()) {
        const generated = await gateways().teacher.recommend<TeacherRecommendation>(
          selectedClassId,
          selectedStudentId || undefined,
        );
        if (!generated.ok) throw new Error(generated.detail);
        setRecommendation(generated.data);
      } else {
        setRecommendation({
          diagnosis: 'A turma está avançando, mas frações ainda concentram erros recorrentes.',
          objective: 'Consolidar equivalência de frações antes de avançar para porcentagem.',
          actions: [
            'Retomar o conceito com representações visuais.',
            'Formar duplas para comparar estratégias de resolução.',
            'Aplicar uma verificação curta no fim da aula.',
          ],
          content_suggestion:
            'Use a sequência Frações com apoio visual e finalize com cinco questões progressivas.',
        });
      }
      setMessage('Recomendação pedagógica gerada para o contexto selecionado.');
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível gerar a recomendação.',
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    activeTab,
    setActiveTab,
    overview,
    classes,
    selectedClassId,
    setSelectedClassId,
    selectedClass,
    selectedStudentId,
    setSelectedStudentId,
    alerts,
    contents,
    recommendation,
    message,
    busy,
    sortedStudents,
    selectedStudent,
    tabs,
    teacherGlyphs,
    createClass,
    addStudent,
    removeStudent,
    exportReport,
    createContent,
    importContents,
    requestRecommendation,
  };
}
