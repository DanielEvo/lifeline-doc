import { createContext, useContext, useState, type ReactNode } from "react";

export type ChatMessage = {
  id: string;
  from: "patient" | "bot";
  text?: string;
  attachment?: { kind: "pdf" | "image"; name: string };
  badge?: string;
  ts: string;
};

export type KanbanColumnId =
  | "triagem"
  | "atendimento"
  | "aguardando"
  | "retorno"
  | "estavel";

export type PatientCard = {
  id: string;
  name: string;
  age: number;
  reason: string;
  column: KanbanColumnId;
  hasBriefing: boolean;
  hasExams: boolean;
  examsCount: number;
  initials: string;
  tint: string;
  criticalFlag?: string;
  adherence?: number;
};

type Store = {
  messages: ChatMessage[];
  step: number;
  pushMessages: (msgs: ChatMessage[]) => void;
  setStep: (n: number) => void;
  resetChat: () => void;
  patients: PatientCard[];
  movePatient: (id: string, to: KanbanColumnId) => void;
  sealed: boolean;
  setSealed: (b: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

const initialPatients: PatientCard[] = [
  {
    id: "mariana",
    name: "Mariana Silva",
    age: 38,
    reason: "Fadiga + queda de hemoglobina",
    column: "triagem",
    hasBriefing: false,
    hasExams: false,
    examsCount: 0,
    initials: "MS",
    tint: "from-rose-400 to-pink-500",
    criticalFlag: "Hb 11.2 g/dL · abaixo do ref",
    adherence: 40,
  },
  {
    id: "carlos",
    name: "Carlos Andrade",
    age: 54,
    reason: "Hipertensão — ajuste",
    column: "atendimento",
    hasBriefing: true,
    hasExams: false,
    examsCount: 0,
    initials: "CA",
    tint: "from-cyan-400 to-teal-500",
    adherence: 82,
  },
  {
    id: "juliana",
    name: "Juliana Prado",
    age: 29,
    reason: "Cefaleia recorrente",
    column: "aguardando",
    hasBriefing: true,
    hasExams: false,
    examsCount: 0,
    initials: "JP",
    tint: "from-amber-400 to-orange-500",
  },
  {
    id: "roberto",
    name: "Roberto Lima",
    age: 61,
    reason: "Diabetes — retorno",
    column: "retorno",
    hasBriefing: true,
    hasExams: true,
    examsCount: 3,
    initials: "RL",
    tint: "from-emerald-400 to-teal-500",
    adherence: 91,
  },
  {
    id: "sofia",
    name: "Sofia Ramos",
    age: 45,
    reason: "Check-up anual · sem queixas",
    column: "estavel",
    hasBriefing: false,
    hasExams: false,
    examsCount: 0,
    initials: "SR",
    tint: "from-violet-400 to-indigo-500",
  },
];

export function DemoProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState(0);
  const [patients, setPatients] = useState<PatientCard[]>(initialPatients);
  const [sealed, setSealed] = useState(false);

  const pushMessages = (msgs: ChatMessage[]) =>
    setMessages((m) => [...m, ...msgs]);

  const resetChat = () => {
    setMessages([]);
    setStep(0);
    setPatients(initialPatients);
    setSealed(false);
  };

  const movePatient = (id: string, to: KanbanColumnId) => {
    setPatients((ps) => ps.map((p) => (p.id === id ? { ...p, column: to } : p)));
  };

  return (
    <Ctx.Provider
      value={{
        messages,
        step,
        pushMessages,
        setStep,
        resetChat,
        patients,
        movePatient,
        sealed,
        setSealed,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDemo() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemo must be used within DemoProvider");
  return v;
}

export const COLUMNS: { id: KanbanColumnId; title: string; hint: string }[] = [
  { id: "triagem", title: "Triagem / Pré-Consulta", hint: "Aguardando atendimento" },
  { id: "atendimento", title: "Em Atendimento", hint: "Consulta em andamento" },
  { id: "aguardando", title: "Aguardando Exames", hint: "Solicitações enviadas" },
  { id: "retorno", title: "Retorno Agendado", hint: "Exames recebidos · retorno marcado" },
  { id: "estavel", title: "Estável / Check-up", hint: "Acompanhamento sem queixa" },
];
