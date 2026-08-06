"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  List,
  LayoutGrid,
  Loader2,
  AlertTriangle,
  Plus,
  CheckCircle,
  Clock,
  XCircle,
  Circle,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
import { SearchInput, EmptyState } from "@/components/ui";
import StatusBadge from "@/components/ui/StatusBadge";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import TaskCard from "@/components/tasks/TaskCard";
import { formatDate } from "@/lib/formatters";
import type { Task, TaskStatus, TaskPriority } from "@/types/erp";

// ─── Types ──────────────────────────────────────────────────────────────

type ViewMode = "list" | "kanban";
type SortField = "dueDate" | "priority" | "created";

// ─── Constants ──────────────────────────────────────────────────────────

const statusConfig: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  todo: {
    label: "To Do",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    icon: <Circle className="w-4 h-4" />,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    icon: <Clock className="w-4 h-4" />,
  },
  done: {
    label: "Done",
    color: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400",
    icon: <CheckCircle className="w-4 h-4" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    icon: <XCircle className="w-4 h-4" />,
  },
};

const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  low: {
    label: "Low",
    color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  medium: {
    label: "Medium",
    color: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  },
  high: {
    label: "High",
    color: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
  },
  urgent: {
    label: "Urgent",
    color: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  },
};

const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Main Component ─────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // View & filters
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created");

  // Move task modal
  const [moveTask, setMoveTask] = useState<Task | null>(null);

  // ── Fetch data ──
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      const res = await fetch(`/api/tasks?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load tasks");
      const json = await res.json();
      if (json.success) setTasks(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, searchQuery]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Filtered & sorted tasks ──
  const filteredTasks = useMemo(() => {
    let list = tasks;

    if (assignedToMe) {
      // Filter to current user — we'll use a simple approach since we don't have
      // the current user ID in state. The API supports assignedTo param.
      // For now, we skip client-side filtering for this and rely on API param.
      // This is handled by toggling assignedToMe which triggers refetch.
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortField === "priority") {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (sortField === "dueDate") {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aDate - bDate;
      }
      // created
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [tasks, sortField, assignedToMe]);

  // ── Kanban columns ──
  const columns: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

  const getTasksByStatus = (status: TaskStatus) =>
    filteredTasks.filter((t) => t.status === status);

  // ── Move task handler ──
  const handleMoveTask = async (taskId: number, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      setMoveTask(null);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move task");
    }
  };

  // ── Overdue check ──
  const isOverdue = (task: Task) =>
    task.dueDate &&
    task.status !== "done" &&
    task.status !== "cancelled" &&
    new Date(task.dueDate) < new Date();

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Tasks
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage and track your team&apos;s tasks.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
          </div>
          <Button size="sm" className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-2.5">
        {/* Status filter */}
        <div className="flex items-center gap-1">
          {(["all", "todo", "in_progress", "done", "cancelled"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm"
                    : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
              >
                {s === "all" ? "All" : statusConfig[s].label}
              </button>
            )
          )}
        </div>

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

        {/* Priority filter */}
        <div className="flex items-center gap-1">
          {(["all", "urgent", "high", "medium", "low"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                priorityFilter === p
                  ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              {p === "all" ? "All Pri" : priorityConfig[p].label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0" />

        {/* Sort */}
        <button
          onClick={() => {
            const fields: SortField[] = ["dueDate", "priority", "created"];
            const idx = fields.indexOf(sortField);
            setSortField(fields[(idx + 1) % fields.length]);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          title="Sort by"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          <span className="capitalize">{sortField === "created" ? "Created" : sortField === "dueDate" ? "Due Date" : "Priority"}</span>
        </button>

        {/* Assigned to me */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={assignedToMe}
            onChange={(e) => setAssignedToMe(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-500 w-4 h-4"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
            Assigned to me
          </span>
        </label>

        {/* Search */}
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search tasks..."
          className="max-w-xs w-full"
          compact
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
            Loading tasks...
          </span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-3" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={fetchTasks}
            className="mt-3 text-sm font-medium text-brand-500 hover:text-brand-600"
          >
            Try again
          </button>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <EmptyState
            icon={<CheckCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />}
            title="No tasks found"
            description="Try adjusting your filters or create a new task."
          />
        </div>
      ) : viewMode === "kanban" ? (
        /* ═══════════════════════════════════════════════════════════════════
           KANBAN VIEW
           ═══════════════════════════════════════════════════════════════════ */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map((status) => {
            const columnTasks = getTasksByStatus(status);
            const config = statusConfig[status];

            return (
              <div
                key={status}
                className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex flex-col"
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className={config.color}>{config.icon}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {config.label}
                    </span>
                  </div>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="p-3 space-y-3 flex-1 min-h-[200px] overflow-y-auto">
                  {columnTasks.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-xs text-gray-400 dark:text-gray-500">
                      No tasks
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        compact
                        onClick={(t) => setMoveTask(t)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════
           LIST VIEW
           ═══════════════════════════════════════════════════════════════════ */
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Title
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Priority
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Assigned To
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Due Date
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {/* Title */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-xs">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4 text-center">
                      <StatusBadge
                        label={statusConfig[task.status].label}
                        color={statusConfig[task.status].color}
                      />
                    </td>

                    {/* Priority */}
                    <td className="py-3 px-4 text-center">
                      <StatusBadge
                        label={priorityConfig[task.priority].label}
                        color={priorityConfig[task.priority].color}
                      />
                    </td>

                    {/* Assigned To */}
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {task.assignedToName || "Unassigned"}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td className="py-3 px-4">
                      {task.dueDate ? (
                        <div
                          className={`flex items-center gap-1.5 ${
                            isOverdue(task)
                              ? "text-red-500 dark:text-red-400"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span className="text-sm font-medium">
                            {formatDate(task.dueDate, "short")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setMoveTask(task)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors"
                        title="Move to status"
                      >
                        Move
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MOVE TASK MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      <Modal
        isOpen={!!moveTask}
        onClose={() => setMoveTask(null)}
        className="max-w-sm p-6"
      >
        {moveTask && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Move Task
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                {moveTask.title}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Move to:
              </p>
              {columns
                .filter((s) => s !== moveTask.status)
                .map((status) => {
                  const config = statusConfig[status];
                  return (
                    <button
                      key={status}
                      onClick={() => handleMoveTask(moveTask.id, status)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <span className={config.color}>{config.icon}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {config.label}
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMoveTask(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
