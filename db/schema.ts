import {
  bigint,
  index,
  int,
  json,
  mediumtext,
  mysqlEnum,
  mysqlTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const taskStatus = mysqlEnum("task_status", [
  "queued",
  "cloning",
  "executing",
  "checking",
  "reviewing",
  "final_review",
  "creating_pr",
  "waiting_input",
  "ready",
  "failed",
  "cancelled",
]);

export const stageKind = mysqlEnum("stage_kind", [
  "clone",
  "execute",
  "checks",
  "review",
  "final",
  "pr",
]);

export const stageStatus = mysqlEnum("stage_status", [
  "running",
  "passed",
  "failed",
  "skipped",
]);

export const reviewVerdict = mysqlEnum("review_verdict", [
  "approve",
  "rework",
  "ask_user",
  "reject",
]);

export const tasks = mysqlTable("agent_tasks", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  prompt: text("prompt").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  repoUrl: varchar("repo_url", { length: 512 }).notNull(),
  baseBranch: varchar("base_branch", { length: 255 }).notNull().default("main"),
  taskType: mysqlEnum("task_type", ["code", "analysis"]).notNull().default("code"),
  checkCommands: text("check_commands"),
  executorModel: varchar("executor_model", { length: 255 }),
  reviewerModel: varchar("reviewer_model", { length: 255 }),
  finalModel: varchar("final_model", { length: 255 }),
  status: taskStatus.notNull().default("queued"),
  attempt: int("attempt").notNull().default(0),
  maxAttempts: int("max_attempts").notNull().default(2),
  totalTokens: int("total_tokens").notNull().default(0),
  branchName: varchar("branch_name", { length: 255 }),
  prUrl: varchar("pr_url", { length: 512 }),
  summary: text("summary"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  completedAt: timestamp("completed_at"),
});

export const stages = mysqlTable(
  "agent_stages",
  {
    id: serial("id").primaryKey(),
    taskId: bigint("task_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: stageKind.notNull(),
    status: stageStatus.notNull().default("running"),
    attempt: int("attempt").notNull().default(1),
    summary: text("summary"),
    logs: mediumtext("logs"),
    diff: mediumtext("diff"),
    tokens: int("tokens").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    taskIdx: index("agent_stages_task_idx").on(table.taskId),
  }),
);

export const reviews = mysqlTable(
  "agent_reviews",
  {
    id: serial("id").primaryKey(),
    taskId: bigint("task_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["reviewer", "final"]).notNull(),
    verdict: reviewVerdict.notNull(),
    summary: text("summary").notNull(),
    issues: json("issues").$type<string[]>().notNull(),
    confidence: int("confidence").notNull().default(0),
    attempt: int("attempt").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("agent_reviews_task_idx").on(table.taskId),
  }),
);

export type AgentTask = typeof tasks.$inferSelect;
export type NewAgentTask = typeof tasks.$inferInsert;
export type AgentStage = typeof stages.$inferSelect;
export type AgentReview = typeof reviews.$inferSelect;
