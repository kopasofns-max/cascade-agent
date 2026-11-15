import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import {
  createTask,
  findTask,
  getTaskDetails,
  listTasks,
  updateTask,
} from "./queries/tasks";
import { validateRepositoryUrl } from "./agent/git";
import { ACTIVE_STATUSES } from "@contracts/agent";

const repositoryInput = z.string().trim().min(12).max(512).superRefine((value, context) => {
  try {
    validateRepositoryUrl(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Некорректный репозиторий",
    });
  }
});

export const taskRouter = createRouter({
  list: publicQuery.query(() => listTasks()),

  byId: publicQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const details = await getTaskDetails(input.id);
    if (!details) throw new TRPCError({ code: "NOT_FOUND", message: "Задача не найдена" });
    return details;
  }),

  create: publicQuery
    .input(z.object({
      title: z.string().trim().min(3).max(255),
      prompt: z.string().trim().min(10).max(30_000),
      acceptanceCriteria: z.string().trim().min(3).max(15_000),
      repoUrl: repositoryInput,
      baseBranch: z.string().trim().regex(/^[a-zA-Z0-9._/-]+$/).max(255),
      taskType: z.enum(["code", "analysis"]),
      checkCommands: z.string().trim().max(4_000).optional(),
      executorModel: z.string().trim().max(255).optional(),
      reviewerModel: z.string().trim().max(255).optional(),
      finalModel: z.string().trim().max(255).optional(),
      maxAttempts: z.number().int().min(1).max(3).default(2),
    }))
    .mutation(async ({ input }) => {
      const task = await createTask({
        ...input,
        checkCommands: input.checkCommands || null,
        executorModel: input.executorModel || null,
        reviewerModel: input.reviewerModel || null,
        finalModel: input.finalModel || null,
      });
      return task;
    }),

  cancel: publicQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const task = await findTask(input.id);
    if (!task) throw new TRPCError({ code: "NOT_FOUND" });
    if (!ACTIVE_STATUSES.includes(task.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Эту задачу уже нельзя остановить" });
    }
    return updateTask(input.id, { status: "cancelled", completedAt: new Date() });
  }),

  retry: publicQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const task = await findTask(input.id);
    if (!task) throw new TRPCError({ code: "NOT_FOUND" });
    if (!["failed", "cancelled"].includes(task.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Повтор доступен после ошибки или остановки" });
    }
    return updateTask(input.id, {
      status: "queued",
      attempt: 0,
      error: null,
      summary: null,
      prUrl: null,
      completedAt: null,
    });
  }),

  respond: publicQuery
    .input(z.object({ id: z.number().int().positive(), answer: z.string().trim().min(2).max(5_000) }))
    .mutation(async ({ input }) => {
      const task = await findTask(input.id);
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.status !== "waiting_input") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Задача не ждёт ответа" });
      }
      return updateTask(input.id, {
        prompt: `${task.prompt}\n\nУточнение пользователя:\n${input.answer}`,
        status: "queued",
        attempt: 0,
        summary: null,
        error: null,
        completedAt: null,
      });
    }),
});
