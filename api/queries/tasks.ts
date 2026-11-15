import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { reviews, stages, tasks, type NewAgentTask } from "@db/schema";

export async function listTasks() {
  return getDb().select().from(tasks).orderBy(desc(tasks.createdAt)).limit(100);
}

export async function findTask(id: number) {
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return task;
}

export async function getTaskDetails(id: number) {
  const [task, taskStages, taskReviews] = await Promise.all([
    findTask(id),
    getDb().select().from(stages).where(eq(stages.taskId, id)).orderBy(stages.id),
    getDb().select().from(reviews).where(eq(reviews.taskId, id)).orderBy(reviews.id),
  ]);
  if (!task) return undefined;
  return { task, stages: taskStages, reviews: taskReviews };
}

export async function createTask(data: NewAgentTask) {
  const [{ id }] = await getDb().insert(tasks).values(data).$returningId();
  return findTask(id);
}

export async function updateTask(
  id: number,
  data: Partial<typeof tasks.$inferInsert>,
) {
  await getDb().update(tasks).set(data).where(eq(tasks.id, id));
  return findTask(id);
}

export async function claimNextTask() {
  const db = getDb();
  const [candidate] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.status, "queued"))
    .orderBy(tasks.createdAt)
    .limit(1);
  if (!candidate) return undefined;

  await db
    .update(tasks)
    .set({ status: "cloning", error: null, summary: null })
    .where(and(eq(tasks.id, candidate.id), eq(tasks.status, "queued")));

  const claimed = await findTask(candidate.id);
  return claimed?.status === "cloning" ? claimed : undefined;
}

export async function createStage(data: typeof stages.$inferInsert) {
  const [{ id }] = await getDb().insert(stages).values(data).$returningId();
  const [stage] = await getDb().select().from(stages).where(eq(stages.id, id)).limit(1);
  return stage;
}

export async function finishStage(
  id: number,
  data: Partial<typeof stages.$inferInsert>,
) {
  await getDb()
    .update(stages)
    .set({ ...data, finishedAt: new Date() })
    .where(eq(stages.id, id));
}

export async function createReview(data: typeof reviews.$inferInsert) {
  const [{ id }] = await getDb().insert(reviews).values(data).$returningId();
  const [review] = await getDb().select().from(reviews).where(eq(reviews.id, id)).limit(1);
  return review;
}
