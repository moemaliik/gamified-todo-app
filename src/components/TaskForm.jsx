import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function TaskForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ? initial.dueDate.slice(0, 10) : '');
  const [showDescription, setShowDescription] = useState(!!initial?.description);

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <h3>{initial ? 'Edit Quest' : 'New Quest'}</h3>
        <input
          placeholder="Quest title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />

        {showDescription ? (
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        ) : (
          <button type="button" className="wax-btn" style={{ marginBottom: 12 }} onClick={() => setShowDescription(true)}>
            + Add description
          </button>
        )}

        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button type="button" className="wax-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="wax-btn">Save</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
