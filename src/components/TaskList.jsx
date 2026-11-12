import React from 'react';
import { motion } from 'framer-motion';

function dueChip(task) {
  if (!task.dueDate) return null;
  const overdue = !task.completed && new Date(task.dueDate) < new Date();
  return (
    <span className={`due-chip ${overdue ? 'overdue' : 'ontime'}`}>
      {new Date(task.dueDate).toLocaleDateString()}
    </span>
  );
}

export default function TaskList({ tasks, onComplete, onEdit, onDelete }) {
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 40 }}>📜</div>
        <p>Your quest log is empty — add your first quest.</p>
      </div>
    );
  }

  const active = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  return (
    <div>
      {active.map((task) => (
        <motion.div
          key={task.id}
          layout
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="task-card"
        >
          <button className="seal-checkbox" onClick={() => onComplete(task.id)} aria-label="Complete quest">
            ✓
          </button>
          <span className="task-title" onClick={() => onEdit(task)} style={{ cursor: 'pointer' }}>
            {task.title}
          </span>
          {dueChip(task)}
          <button className="delete-btn" onClick={() => onDelete(task.id)}>✕</button>
        </motion.div>
      ))}

      {completed.length > 0 && (
        <>
          <h3 style={{ opacity: 0.6, fontSize: 14 }}>Completed</h3>
          {completed.map((task) => (
            <div key={task.id} className="task-card completed">
              <span className="seal-checkbox">✓</span>
              <span className="task-title">{task.title}</span>
              {dueChip(task)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
