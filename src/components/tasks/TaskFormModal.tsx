'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { ModalHeader } from '@/components/ui';
import Button from '@/components/ui/button/Button';
import DatePicker from '@/components/form/input/DatePicker';
import SearchSelect from '@/components/form/SearchSelect';
import type { Task, TaskStatus, TaskPriority } from '@/types/erp';

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task | null;
  onSuccess?: () => void;
}

type FormState = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: number | null;
  dueDate: string;
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const initialFormState: FormState = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignedTo: null,
  dueDate: '',
};

export default function TaskFormModal({ isOpen, onClose, task, onSuccess }: TaskFormModalProps) {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [users, setUsers] = useState<{ id: number; label: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const isEditing = Boolean(task);

  // Reset form when modal opens or task changes
  useEffect(() => {
    if (isOpen) {
      if (task) {
        setForm({
          title: task.title,
          description: task.description || '',
          status: task.status,
          priority: task.priority,
          assignedTo: task.assignedTo,
          dueDate: task.dueDate || '',
        });
      } else {
        setForm(initialFormState);
      }
      setErrors({});
      setSubmitError('');
    }
  }, [isOpen, task]);

  // Fetch users for the assigned-to picker
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setUsersLoading(true);
    fetch('/api/users', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load users');
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          const options = json.data.map((u: { id: number; firstName: string; lastName: string; email: string }) => ({
            id: u.id,
            label: `${u.firstName} ${u.lastName}`.trim() || u.email,
          }));
          setUsers(options);
        }
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  const validate = useCallback((): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) {
      next.title = 'Title is required';
    } else if (form.title.length > 200) {
      next.title = 'Title must be 200 characters or less';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const doSubmit = useCallback(async () => {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        assignedTo: form.assignedTo,
        dueDate: form.dueDate || null,
      };

      const url = isEditing ? `/api/tasks/${task!.id}` : '/api/tasks';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || json.message || 'Failed to save task');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSubmitting(false);
    }
  }, [form, isEditing, task, onSuccess, onClose, validate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void doSubmit();
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-lg p-0" showCloseButton={false}>
      <ModalHeader
        title={isEditing ? 'Edit Task' : 'New Task'}
        subtitle={isEditing ? 'Update task details' : 'Create a new task for your team'}
        onClose={handleClose}
      />

      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Task title"
              disabled={submitting}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 disabled:opacity-50 ${
                errors.title
                  ? 'border-red-300 dark:border-red-700 focus:ring-red-500/20 focus:border-red-500'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-brand-500/20 focus:border-brand-500'
              } focus:outline-none focus:ring-2 transition-colors`}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-500">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Add more details..."
              rows={3}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-50 transition-colors resize-none"
            />
          </div>

          {/* Status & Priority row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value as TaskStatus)}
                disabled={submitting}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-50 transition-colors"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => updateField('priority', e.target.value as TaskPriority)}
                disabled={submitting}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 disabled:opacity-50 transition-colors"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Assigned To
            </label>
            {usersLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                <span className="text-xs text-gray-400">Loading users...</span>
              </div>
            ) : (
              <SearchSelect
                options={users}
                value={form.assignedTo}
                onChange={(val) => updateField('assignedTo', val ? Number(val) : null)}
                placeholder="Select assignee..."
                noneLabel="Unassigned"
                searchPlaceholder="Search users..."
                notFoundLabel="No users found"
              />
            )}
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Due Date
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <DatePicker
                  value={form.dueDate}
                  onChange={(val) => updateField('dueDate', val)}
                  placeholder="Select due date"
                />
              </div>
              {form.dueDate && (
                <button
                  type="button"
                  onClick={() => updateField('dueDate', '')}
                  disabled={submitting}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  title="Clear date"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 px-4 py-2.5">
              <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 bg-gray-50 dark:bg-gray-900/50 rounded-b-3xl">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void doSubmit()} disabled={submitting} className="flex items-center gap-2">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEditing ? 'Update Task' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
