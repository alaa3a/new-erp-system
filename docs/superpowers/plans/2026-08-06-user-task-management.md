# Phase 2F: User & Task Management Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Professional user management with tree-view permissions and a full task management module.

**Architecture:** Extend existing users module + new tasks module with database table, API routes, and UI pages.

---

## Part 1: User Management Enhancements

### Task 27: Professional User Management UI ✅ (DONE)
- ID column in table
- Split Edit / Permissions modals
- Tree-view permissions grouped by module

### Task 28: Password Management
**Files:**
- Modify: `src/app/(admin)/users/page.tsx`

**Features:**
- Generate secure random password button (copy to clipboard)
- Password strength indicator with requirements list
- "Require password change on first login" toggle
- Show/hide password in form

### Task 29: User Account Features
**Files:**
- Modify: `src/app/api/users/[id]/route.ts`
- Modify: `src/app/(admin)/users/page.tsx`

**Features:**
- Account status: Active / Suspended / Pending
- "Force password change" flag on user
- Copy credentials button (email + temp password)
- Last login display in table

---

## Part 2: Task Management Module

### Task 30: Database & API
**Files:**
- Create: migration in `src/lib/db.ts` (tasks table)
- Create: `src/lib/repositories/taskRepository.ts`
- Create: `src/app/api/tasks/route.ts` (GET, POST)
- Create: `src/app/api/tasks/[id]/route.ts` (GET, PUT, DELETE)
- Create: `src/app/api/tasks/[id]/status/route.ts` (PATCH)

**Schema:**
```sql
CREATE TABLE task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo', -- todo, in_progress, done, cancelled
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  assignedTo INTEGER, -- user id
  createdBy INTEGER,
  dueDate TEXT,
  completedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (assignedTo) REFERENCES users(id),
  FOREIGN KEY (createdBy) REFERENCES users(id)
);
```

### Task 31: Task Types & Repository
**Files:**
- Create: `src/types/task.ts` (or add to `src/types/erp.ts`)
- Create: `src/lib/repositories/taskRepository.ts`

**Types:**
```typescript
type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo: number | null;
  assignedToName?: string;
  createdBy: number;
  createdByName?: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Task 32: Task List & Kanban Board
**Files:**
- Create: `src/app/(admin)/tasks/page.tsx`
- Create: `src/components/tasks/TaskCard.tsx`
- Create: `src/components/tasks/KanbanColumn.tsx`

**Features:**
- View toggle: List / Kanban board
- Kanban columns: To Do, In Progress, Done
- Drag-and-drop to change status (or status buttons)
- Filter by: status, priority, assigned to me
- Sort by: due date, priority, created date
- Color-coded priority indicators

### Task 33: Create & Edit Task Modal
**Files:**
- Create: `src/components/tasks/TaskFormModal.tsx`

**Form fields:**
- Title (required)
- Description (textarea)
- Status (dropdown)
- Priority (dropdown)
- Assigned To (user picker)
- Due Date (date picker)

### Task 34: My Tasks Dashboard Widget
**Files:**
- Modify: `src/app/(admin)/page.tsx` (dashboard)

**Widget shows:**
- My open tasks count
- Overdue tasks (red)
- Due today
- Quick task list with status badges

### Task 35: Task Notifications
**Files:**
- Create: notification on task assignment
- Create: notification on task completion

**Features:**
- Notify user when task is assigned to them
- Notify creator when task is completed
- Due date reminder (optional)

---

## Execution Order

```
Task 28 (Password Mgmt) → Task 29 (Account Features)
Task 30 (DB & API) → Task 31 (Types) → Task 32 (Kanban UI) → Task 33 (Form) → Task 34 (Dashboard) → Task 35 (Notifications)
```

Part 1 and Part 2 can be done in parallel.

---

## Summary

| Task | Focus | Status |
|------|-------|--------|
| 27 | User UI (tree permissions) | ✅ Done |
| 28 | Password management | ⬜ |
| 29 | Account features | ⬜ |
| 30 | Task DB & API | ⬜ |
| 31 | Task types & repository | ⬜ |
| 32 | Task list & Kanban board | ⬜ |
| 33 | Create/Edit task modal | ⬜ |
| 34 | My Tasks dashboard | ⬜ |
| 35 | Task notifications | ⬜ |
