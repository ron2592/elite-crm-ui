"use client";

import { useState } from "react";
import { mockTasks } from "@/lib/mock-data";
import { Task } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Calendar, User, Flag, CheckCircle2, Circle } from "lucide-react";

const priorityConfig = {
  high: { label: "High", variant: "destructive" as const, color: "text-red-600" },
  medium: { label: "Medium", variant: "warning" as const, color: "text-amber-600" },
  low: { label: "Low", variant: "secondary" as const, color: "text-slate-500" },
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "completed" ? "pending" : "completed" }
          : t
      )
    );
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="font-display text-2xl font-bold">{tasks.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Total Tasks</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="font-display text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Pending</p>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="font-display text-2xl font-bold text-emerald-600">{completedCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 rounded-lg border bg-muted p-1 w-fit">
        {(["all", "pending", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-all capitalize",
              filter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tasks to show</p>
            </div>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const priority = priorityConfig[task.priority];
            const isOverdue =
              task.status === "pending" && new Date(task.dueDate) < new Date();

            return (
              <div
                key={task.id}
                className={cn(
                  "rounded-xl border bg-card p-4 transition-all duration-200 hover:shadow-sm",
                  task.status === "completed" && "opacity-60"
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={task.status === "completed"}
                    onCheckedChange={() => toggleTask(task.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          task.status === "completed" && "line-through text-muted-foreground"
                        )}
                      >
                        {task.title}
                      </p>
                      <Badge variant={priority.variant} className="shrink-0 text-xs">
                        <Flag className="h-2.5 w-2.5 mr-1" />
                        {priority.label}
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "flex items-center gap-1",
                          isOverdue && "text-red-500 font-medium"
                        )}
                      >
                        <Calendar className="h-3 w-3" />
                        {isOverdue ? "Overdue · " : "Due "}
                        {new Date(task.dueDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {task.leadName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.leadName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
