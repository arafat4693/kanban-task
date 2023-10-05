import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { formatError } from "~/lib/utils";
import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "~/server/api/trpc";

export const taskRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(2).max(50),
        description: z.string().max(150).optional(),
        columnId: z.string().min(6),
        subtasks: z.object({ title: z.string() }).array(),
      })
    )
    .mutation(async ({ ctx: { prisma, session }, input }) => {
      try {
        await prisma.boardColumn.findUniqueOrThrow({
          where: {
            id: input.columnId,
            board: {
              user: {
                id: session.user.id,
              },
            },
          },
        });

        return await prisma.task.create({
          data: {
            title: input.title,
            description: input.description,
            boardColumn: {
              connect: {
                id: input.columnId,
              },
            },
            subTasks: input.subtasks.length
              ? {
                  createMany: {
                    data: input.subtasks,
                  },
                }
              : undefined,
          },
          select: {
            id: true,
            title: true,
            subTasks: {
              where: {
                completed: true,
              },
              select: {
                id: true,
              },
            },
            _count: {
              select: {
                subTasks: true,
              },
            },
          },
        });
      } catch (err) {
        console.log(err);
        throw new TRPCError(formatError(err));
      }
    }),
  getTaskDetail: protectedProcedure
    .input(z.object({ taskId: z.string(), boardId: z.string() }))
    .query(async ({ ctx: { prisma, session }, input }) => {
      try {
        const taskDetail = await prisma.task.findUniqueOrThrow({
          where: {
            id: input.taskId,
            boardColumn: {
              board: {
                user: {
                  id: session.user.id,
                },
              },
            },
          },
          select: {
            id: true,
            title: true,
            description: true,
            subTasks: {
              select: {
                id: true,
                title: true,
                completed: true,
              },
            },
            boardColumn: {
              select: {
                id: true,
              },
            },
          },
        });

        const columns = await prisma.board.findUniqueOrThrow({
          where: {
            id: input.boardId,
          },
          select: {
            boardColumns: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });

        return { taskDetail, ...columns };
      } catch (err) {
        console.log(err);
        throw new TRPCError(formatError(err));
      }
    }),
  saveTaskDetail: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        columnId: z.string().optional(),
        subtasks: z
          .object({ completed: z.boolean(), id: z.string(), title: z.string() })
          .array(),
      })
    )
    .mutation(async ({ ctx: { prisma, session }, input }) => {
      try {
        return await prisma.$transaction(async (tx) => {
          if (input.subtasks.length) {
            await Promise.all(
              input.subtasks.map((st) =>
                tx.subTask.update({
                  where: {
                    id: st.id,
                    Task: {
                      id: input.taskId,
                    },
                  },
                  data: {
                    completed: st.completed,
                  },
                })
              )
            );
          }

          const saveTask = await tx.task.update({
            where: {
              id: input.taskId,
              boardColumn: {
                board: {
                  user: {
                    id: session.user.id,
                  },
                },
              },
            },
            data: {
              boardColumn: input.columnId
                ? {
                    connect: {
                      id: input.columnId,
                    },
                  }
                : undefined,
            },
            select: {
              id: true,
              subTasks: {
                select: {
                  id: true,
                  completed: true,
                  title: true,
                },
              },
              boardColumn: {
                select: {
                  id: true,
                },
              },
            },
          });

          return saveTask;
        });
      } catch (err) {
        console.log(err);
        throw new TRPCError(formatError(err));
      }
    }),
  editTask: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        columnId: z.string().optional(),
        taskTitle: z.string().min(2).max(50).optional(),
        taskDescription: z.string().max(150).optional(),
        deleteSubtasks: z.string().min(1).array(),
        updateSubtasks: z
          .object({ title: z.string().min(1), id: z.string() })
          .array(),
        createSubtasks: z.object({ title: z.string().min(1) }).array(),
      })
    )
    .mutation(async ({ ctx: { prisma, session }, input }) => {
      try {
        return await prisma.$transaction(async (tx) => {
          if (input.updateSubtasks.length) {
            await Promise.all(
              input.updateSubtasks.map((st) =>
                tx.subTask.update({
                  where: {
                    id: st.id,
                    Task: {
                      id: input.taskId,
                    },
                  },
                  data: {
                    title: st.title,
                  },
                })
              )
            );
          }

          return await tx.task.update({
            where: {
              id: input.taskId,
              boardColumn: {
                board: {
                  user: {
                    id: session.user.id,
                  },
                },
              },
            },
            data: {
              title: input.taskTitle,
              description: input.taskDescription,
              boardColumn: input.columnId
                ? {
                    connect: {
                      id: input.columnId,
                    },
                  }
                : undefined,
              subTasks: {
                createMany: input.createSubtasks.length
                  ? {
                      data: input.createSubtasks.map((st) => ({
                        title: st.title,
                      })),
                    }
                  : undefined,
                deleteMany: input.deleteSubtasks.length
                  ? input.deleteSubtasks.map((st) => ({ id: st }))
                  : undefined,
              },
            },
            select: {
              id: true,
              title: true,
              description: true,
              subTasks: {
                select: {
                  id: true,
                  title: true,
                  completed: true,
                },
              },
              boardColumn: {
                select: {
                  id: true,
                },
              },
            },
          });
        });
      } catch (err) {
        console.log(err);
        throw new TRPCError(formatError(err));
      }
    }),
  deleteTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ ctx: { prisma, session }, input }) => {
      try {
        return await prisma.task.delete({
          where: {
            id: input.taskId,
            boardColumn: {
              board: {
                user: {
                  id: session.user.id,
                },
              },
            },
          },
          select: {
            boardColumn: {
              select: {
                id: true,
              },
            },
          },
        });
      } catch (err) {
        console.log(err);
        throw new TRPCError(formatError(err));
      }
    }),
});