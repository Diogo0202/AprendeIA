#!/usr/bin/env python3
"""
Script para gerar diagrama BPMN do AprendeIA em formato PNG.
Requer: pip install bpmn-python
"""

import io
from pathlib import Path

def create_aprendeia_bpmn_xml():
    """
    Cria arquivo BPMN XML do fluxo principal do AprendeIA.
    Inclui: Autenticação, Área do Aluno, Área do Professor e Administração.
    """
    
    bpmn_xml = '''<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             id="AprendeIA_Process"
             name="AprendeIA - Fluxo do Sistema">

    <!-- ===================== PROCESSO PRINCIPAL ===================== -->
    <process id="aprendeia_main_process" name="Fluxo Principal AprendeIA" isExecutable="false">
        
        <!-- INÍCIO -->
        <startEvent id="start_event" name="Usuário Acessa">
            <outgoing>flow_to_auth</outgoing>
        </startEvent>

        <!-- ===================== AUTENTICAÇÃO ===================== -->
        <task id="task_login" name="Login/Cadastro">
            <incoming>flow_to_auth</incoming>
            <outgoing>flow_auth_decision</outgoing>
        </task>

        <exclusiveGateway id="gateway_auth_success" name="Autenticação Bem-Sucedida?">
            <incoming>flow_auth_decision</incoming>
            <outgoing>flow_auth_failed</outgoing>
            <outgoing>flow_auth_success</outgoing>
        </exclusiveGateway>

        <task id="task_rate_limit_check" name="Verificar Taxa de Tentativas">
            <incoming>flow_auth_failed</incoming>
            <outgoing>flow_rate_limit_decision</outgoing>
        </task>

        <exclusiveGateway id="gateway_rate_limit" name="Bloqueado?">
            <incoming>flow_rate_limit_decision</incoming>
            <outgoing>flow_blocked_account</outgoing>
            <outgoing>flow_retry_login</outgoing>
        </exclusiveGateway>

        <task id="task_blocked_account" name="Conta Bloqueada (15 min)">
            <incoming>flow_blocked_account</incoming>
            <outgoing>flow_to_end_blocked</outgoing>
        </task>

        <endEvent id="end_blocked" name="Fim - Bloqueado">
            <incoming>flow_to_end_blocked</incoming>
        </endEvent>

        <!-- Retornar ao login -->
        <sequenceFlow id="flow_retry_login" sourceRef="gateway_rate_limit" targetRef="task_login" name="Tentar Novamente"/>

        <!-- ===================== DECISÃO DE PERFIL ===================== -->
        <task id="task_load_profile" name="Carregar Perfil">
            <incoming>flow_auth_success</incoming>
            <outgoing>flow_to_profile_decision</outgoing>
        </task>

        <exclusiveGateway id="gateway_role" name="Qual o Perfil?">
            <incoming>flow_to_profile_decision</incoming>
            <outgoing>flow_student_path</outgoing>
            <outgoing>flow_teacher_path</outgoing>
            <outgoing>flow_admin_path</outgoing>
        </exclusiveGateway>

        <!-- ===================== FLUXO ALUNO ===================== -->
        <subProcess id="subprocess_student" name="Área do Aluno">
            <incoming>flow_student_path</incoming>
            <outgoing>flow_student_to_end</outgoing>
            
            <startEvent id="start_student" name="Aluno Autenticado"/>
            
            <parallelGateway id="gateway_student_parallel" name="Paralelizar Ações">
                <incoming>student_flow_start</incoming>
                <outgoing>flow_to_materia</outgoing>
                <outgoing>flow_to_progresso</outgoing>
                <outgoing>flow_to_gamificacao</outgoing>
            </parallelGateway>
            
            <task id="task_view_subjects" name="Visualizar Matérias">
                <incoming>flow_to_materia</incoming>
                <outgoing>flow_merge_student</outgoing>
            </task>

            <task id="task_view_progress" name="Acompanhar Progresso">
                <incoming>flow_to_progresso</incoming>
                <outgoing>flow_merge_student</outgoing>
            </task>

            <task id="task_view_gamification" name="Ver XP, Nível e Insígnias">
                <incoming>flow_to_gamificacao</incoming>
                <outgoing>flow_merge_student</outgoing>
            </task>

            <parallelGateway id="gateway_student_merge" name="Sincronizar">
                <incoming>flow_merge_student</incoming>
                <outgoing>flow_to_practice</outgoing>
            </parallelGateway>

            <task id="task_practice_question" name="Solicitar Próxima Questão">
                <incoming>flow_to_practice</incoming>
                <outgoing>flow_to_ai_generate</outgoing>
            </task>

            <task id="task_ai_generate_question" name="IA Gera Questão (OpenAI)">
                <incoming>flow_to_ai_generate</incoming>
                <outgoing>flow_display_question</outgoing>
            </task>

            <task id="task_display_and_answer" name="Responder Questão">
                <incoming>flow_display_question</incoming>
                <outgoing>flow_submit_answer</outgoing>
            </task>

            <task id="task_check_answer" name="Verificar Resposta">
                <incoming>flow_submit_answer</incoming>
                <outgoing>flow_show_feedback</outgoing>
            </task>

            <task id="task_show_feedback" name="Exibir Explicação e Acertos">
                <incoming>flow_show_feedback</incoming>
                <outgoing>flow_update_difficulty</outgoing>
            </task>

            <task id="task_adjust_difficulty" name="Ajustar Nível de Dificuldade">
                <incoming>flow_update_difficulty</incoming>
                <outgoing>flow_update_gamification</outgoing>
            </task>

            <task id="task_update_xp" name="Atualizar XP e Nível">
                <incoming>flow_update_gamification</incoming>
                <outgoing>flow_student_decide_continue</outgoing>
            </task>

            <exclusiveGateway id="gateway_student_continue" name="Continuar Estudando?">
                <incoming>flow_student_decide_continue</incoming>
                <outgoing>flow_student_continue_yes</outgoing>
                <outgoing>flow_student_continue_no</outgoing>
            </exclusiveGateway>

            <sequenceFlow id="flow_student_continue_yes" sourceRef="gateway_student_continue" targetRef="task_practice_question" name="Sim"/>
            <sequenceFlow id="flow_student_continue_no" sourceRef="gateway_student_continue" targetRef="end_student" name="Não"/>

            <endEvent id="end_student" name="Sair"/>

            <sequenceFlow id="student_flow_start" sourceRef="start_student" targetRef="gateway_student_parallel"/>
            
        </subProcess>

        <!-- ===================== FLUXO PROFESSOR ===================== -->
        <subProcess id="subprocess_teacher" name="Painel do Professor">
            <incoming>flow_teacher_path</incoming>
            <outgoing>flow_teacher_to_end</outgoing>
            
            <startEvent id="start_teacher" name="Professor Autenticado"/>
            
            <parallelGateway id="gateway_teacher_parallel" name="Paralelizar Ações">
                <incoming>teacher_flow_start</incoming>
                <outgoing>flow_to_students</outgoing>
                <outgoing>flow_to_classes</outgoing>
                <outgoing>flow_to_contents</outgoing>
                <outgoing>flow_to_alerts</outgoing>
            </parallelGateway>
            
            <task id="task_view_students" name="Visualizar Estudantes">
                <incoming>flow_to_students</incoming>
                <outgoing>flow_merge_teacher</outgoing>
            </task>

            <task id="task_manage_classes" name="Gerenciar Turmas">
                <incoming>flow_to_classes</incoming>
                <outgoing>flow_merge_teacher</outgoing>
            </task>

            <task id="task_manage_contents" name="Gerenciar Conteúdos">
                <incoming>flow_to_contents</incoming>
                <outgoing>flow_merge_teacher</outgoing>
            </task>

            <task id="task_view_alerts" name="Ver Alertas de Dificuldade">
                <incoming>flow_to_alerts</incoming>
                <outgoing>flow_merge_teacher</outgoing>
            </task>

            <parallelGateway id="gateway_teacher_merge" name="Sincronizar">
                <incoming>flow_merge_teacher</incoming>
                <outgoing>flow_to_reports</outgoing>
            </parallelGateway>

            <task id="task_generate_reports" name="Gerar Relatórios e Gráficos">
                <incoming>flow_to_reports</incoming>
                <outgoing>flow_to_recommendations</outgoing>
            </task>

            <task id="task_ai_recommendations" name="IA Gera Recomendações Pedagógicas">
                <incoming>flow_to_recommendations</incoming>
                <outgoing>flow_teacher_decide_continue</outgoing>
            </task>

            <exclusiveGateway id="gateway_teacher_continue" name="Continuar?">
                <incoming>flow_teacher_decide_continue</incoming>
                <outgoing>flow_teacher_continue_yes</outgoing>
                <outgoing>flow_teacher_continue_no</outgoing>
            </exclusiveGateway>

            <sequenceFlow id="flow_teacher_continue_yes" sourceRef="gateway_teacher_continue" targetRef="task_manage_classes" name="Sim"/>
            <sequenceFlow id="flow_teacher_continue_no" sourceRef="gateway_teacher_continue" targetRef="end_teacher" name="Não"/>

            <endEvent id="end_teacher" name="Sair"/>

            <sequenceFlow id="teacher_flow_start" sourceRef="start_teacher" targetRef="gateway_teacher_parallel"/>
            
        </subProcess>

        <!-- ===================== FLUXO ADMINISTRAÇÃO ===================== -->
        <subProcess id="subprocess_admin" name="Área Administrativa">
            <incoming>flow_admin_path</incoming>
            <outgoing>flow_admin_to_end</outgoing>
            
            <startEvent id="start_admin" name="Admin Autenticado"/>
            
            <task id="task_create_accounts" name="Criar Contas (Alunos/Professores)">
                <incoming>admin_flow_start</incoming>
                <outgoing>flow_to_requests</outgoing>
            </task>

            <task id="task_view_requests" name="Visualizar Solicitações de Professor">
                <incoming>flow_to_requests</incoming>
                <outgoing>flow_admin_decision</outgoing>
            </task>

            <exclusiveGateway id="gateway_admin_decision" name="Aprovar Solicitação?">
                <incoming>flow_admin_decision</incoming>
                <outgoing>flow_approve_teacher</outgoing>
                <outgoing>flow_reject_teacher</outgoing>
            </exclusiveGateway>

            <task id="task_approve" name="Aprovar e Atribuir Disciplina">
                <incoming>flow_approve_teacher</incoming>
                <outgoing>flow_admin_continue</outgoing>
            </task>

            <task id="task_reject" name="Rejeitar Solicitação">
                <incoming>flow_reject_teacher</incoming>
                <outgoing>flow_admin_continue</outgoing>
            </task>

            <exclusiveGateway id="gateway_admin_final" name="Continuar?">
                <incoming>flow_admin_continue</incoming>
                <outgoing>flow_admin_final_yes</outgoing>
                <outgoing>flow_admin_final_no</outgoing>
            </exclusiveGateway>

            <sequenceFlow id="flow_admin_final_yes" sourceRef="gateway_admin_final" targetRef="task_create_accounts" name="Sim"/>
            <sequenceFlow id="flow_admin_final_no" sourceRef="gateway_admin_final" targetRef="end_admin" name="Não"/>

            <endEvent id="end_admin" name="Sair"/>

            <sequenceFlow id="admin_flow_start" sourceRef="start_admin" targetRef="task_create_accounts"/>
            
        </subProcess>

        <!-- ===================== FIM ===================== -->
        <endEvent id="end_general" name="Sessão Encerrada">
            <incoming>flow_student_to_end</incoming>
            <incoming>flow_teacher_to_end</incoming>
            <incoming>flow_admin_to_end</incoming>
        </endEvent>

        <!-- ===================== FLOWS PRINCIPAIS ===================== -->
        <sequenceFlow id="flow_to_auth" sourceRef="start_event" targetRef="task_login"/>
        <sequenceFlow id="flow_auth_decision" sourceRef="task_login" targetRef="gateway_auth_success"/>
        <sequenceFlow id="flow_auth_failed" sourceRef="gateway_auth_success" targetRef="task_rate_limit_check" name="Não"/>
        <sequenceFlow id="flow_auth_success" sourceRef="gateway_auth_success" targetRef="task_load_profile" name="Sim"/>
        <sequenceFlow id="flow_rate_limit_decision" sourceRef="task_rate_limit_check" targetRef="gateway_rate_limit"/>
        <sequenceFlow id="flow_blocked_account" sourceRef="gateway_rate_limit" targetRef="task_blocked_account" name="Sim (4+ tentativas)"/>
        <sequenceFlow id="flow_to_end_blocked" sourceRef="task_blocked_account" targetRef="end_blocked"/>
        <sequenceFlow id="flow_to_profile_decision" sourceRef="task_load_profile" targetRef="gateway_role"/>
        <sequenceFlow id="flow_student_path" sourceRef="gateway_role" targetRef="subprocess_student" name="Aluno"/>
        <sequenceFlow id="flow_teacher_path" sourceRef="gateway_role" targetRef="subprocess_teacher" name="Professor"/>
        <sequenceFlow id="flow_admin_path" sourceRef="gateway_role" targetRef="subprocess_admin" name="Admin"/>
        <sequenceFlow id="flow_student_to_end" sourceRef="subprocess_student" targetRef="end_general"/>
        <sequenceFlow id="flow_teacher_to_end" sourceRef="subprocess_teacher" targetRef="end_general"/>
        <sequenceFlow id="flow_admin_to_end" sourceRef="subprocess_admin" targetRef="end_general"/>

    </process>

    <!-- ===================== DIAGRAMA ===================== -->
    <bpmndi:BPMNDiagram id="bpmn_diagram" name="AprendeIA BPMN Diagram">
        <bpmndi:BPMNPlane id="plane" bpmnElement="aprendeia_main_process">
            <!-- Define as posições dos elementos no diagrama -->
        </bpmndi:BPMNPlane>
    </bpmndi:BPMNDiagram>

</definitions>
'''
    return bpmn_xml


def save_bpmn_to_file():
    """Salva o XML BPMN em arquivo."""
    xml_content = create_aprendeia_bpmn_xml()
    
    output_path = Path(__file__).parent / "AprendeIA_BPMN.bpmn"
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(xml_content)
    
    print(f"✅ Arquivo BPMN criado: {output_path}")
    print("\nPróximos passos para converter em PNG:")
    print("1. Acesse: https://bpmn.io")
    print("2. Clique em 'Open File' e selecione o arquivo AprendeIA_BPMN.bpmn")
    print("3. Vá em File → Download as Image → PNG")
    print("\nOu use uma ferramenta CLI como:")
    print("   npm install -g bpmn-to-image")
    print("   bpmn-to-image AprendeIA_BPMN.bpmn AprendeIA_BPMN.png")
    
    return output_path


if __name__ == "__main__":
    save_bpmn_to_file()
