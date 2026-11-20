import { motion, useReducedMotion } from "framer-motion";

export type ChecklistItem = {
  id: string;
  label: string;
  answered: boolean;
  checked: boolean;
};

type ChecklistProps = {
  items: ChecklistItem[];
  pendingId?: string | null;
  onCheck: (id: string) => void;
};

/* 
   ONE SPRING PER ROW, AND EVERYTHING IS READ OFF IT. The box filling,
   the tick drawing, the rule crossing the words and the words giving up
   their ink are readings of a single state, not separate transitions that
   might arrive at different moments.

   This adaptation deliberately has no "add task" control and no reset. In
   AprendeIA each row is a mandatory exercise defined by the teacher, and a
   check only becomes available after the backend has recorded an answer. */
export function Checklist({ items, pendingId, onCheck }: ChecklistProps) {
  const reduceMotion = useReducedMotion();

  return (
    <ul className="chk" aria-label="Exercícios obrigatórios">
      {items.map((item) => {
        const pending = pendingId === item.id;
        const unavailable = !item.answered || pending || item.checked;
        return (
          <motion.li
            key={item.id}
            className="chk-row"
            initial={false}
            animate={{ opacity: item.checked ? 0.62 : 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 26, mass: 0.9 }}
          >
            <button
              type="button"
              className="chk-toggle"
              role="checkbox"
              aria-checked={item.checked}
              aria-describedby={!item.answered ? `${item.id}-status` : undefined}
              disabled={unavailable}
              onClick={() => onCheck(item.id)}
            >
              {/* Two layers and neither is a border being recoloured: the
                  ring is always there and the fill grows inside it. */}
              <span className="chk-box" aria-hidden="true">
                <motion.span
                  className="chk-fill"
                  animate={{ scale: item.checked ? 1 : 0 }}
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 24 }}
                />
                <svg className="chk-tick" viewBox="0 0 24 24" aria-hidden="true">
                  <motion.path
                    d="M6 12.4 L10.3 16.7 L18 7.6"
                    pathLength="1"
                    initial={false}
                    animate={{ pathLength: item.checked ? 1 : 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                  />
                </svg>
              </span>
              <span className="chk-say">
                <span className="chk-word">{item.label}</span>
                <motion.span
                  className="chk-rule"
                  aria-hidden="true"
                  animate={{ scaleX: item.checked ? 1 : 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.18, delay: 0.06 }}
                />
              </span>
            </button>
            <span className="chk-status" id={`${item.id}-status`}>
              {item.checked ? "Confirmado" : pending ? "Validando no servidor..." : item.answered ? "Marcar como concluído" : "Responda ao exercício para liberar"}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
