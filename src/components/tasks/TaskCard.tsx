"use client";

import React from "react";
import { Calendar, User } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Task, TaskPriority, TaskStatus } from "@/types/erp";

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  medium: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400",
  urgent: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  done: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

interface TaskCardProps {
  task: Task;
  onClick?: (task: Task) => void;
  compact?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, compact = false }) => {
  const isOverdue =
    task.dueDate &&
    task.status !== "done" &&
    task.status !== "cancelled" &&
    new Date(task.dueDate) < new Date();

  return (
    <div
      onClick={() => onClick?.(task)}
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 ${
        onClick ? "cursor-pointer" : ""
      } ${compact ? "p-3" : ""}`}
    >
      {/* Header: Priority + Status */}
      <div className="flex items-center justify-between mb-2">
        <StatusBadge
          label={priorityLabels[task.priority]}
          color={priorityStyles[task.priority]}
          size="sm"
        />
        <StatusBadge
          label={statusLabels[task.status]}
          color={statusStyles[task.status]}
          size="sm"
        />
      </div>

      {/* Title */}
      <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1 line-clamp-2">
        {task.title}
      </h4>

      {/* Description preview */}
      {!compact && task.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        {/* Assigned to */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-1 shrink-0">
            <User className="w-3 h-3 text-gray-400" />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {task.assignedToName || "Unassigned"}
          </span>
        </div>

        {/* Due date */}
        {task.dueDate && (
          <div
            className={`flex items-center gap-1 shrink-0 ${
              isOverdue
                ? "text-red-500 dark:text-red-400"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            <Calendar className="w-3 h-3" />
            <span className="text-xs font-medium">
              {formatDate(task.dueDate, "short")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
