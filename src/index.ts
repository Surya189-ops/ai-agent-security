import "dotenv/config";
import express from "express";
import path from "path";
import crypto from "crypto";
import { prisma } from "./prisma";

const app = express();

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "../public")
  )
);

// ============================================================
// PUBLIC RECRUITER DEMO
// Read-only demo. No API key required.
// ============================================================

app.get("/demo", (_req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/demo.html")
  );
});

const PORT = Number(process.env.PORT) || 3000;

const SECURITY_API_KEY =
  process.env.SECURITY_API_KEY;

// ============================================================
// SECRET COMPARISON
// ============================================================

function secretsMatch(
  provided: string | undefined,
  expected: string | undefined
) {
  if (!provided || !expected) {
    return false;
  }

  const providedHash = crypto
    .createHash("sha256")
    .update(provided)
    .digest();

  const expectedHash = crypto
    .createHash("sha256")
    .update(expected)
    .digest();

  return crypto.timingSafeEqual(
    providedHash,
    expectedHash
  );
}

// ============================================================
// RATE LIMITING
// ============================================================

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

const requestTracker = new Map<
  string,
  {
    count: number;
    windowStart: number;
  }
>();

type Action = {
  type: string;
  amount?: number;
};

// ============================================================
// MASTER API KEY AUTHENTICATION
// ============================================================

function requireApiKey(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const apiKey = req.header("x-api-key");

  if (!SECURITY_API_KEY) {
    console.error(
      "SECURITY_API_KEY is not configured"
    );

    return res.status(500).json({
      error:
        "Security API key is not configured",
    });
  }

  if (!secretsMatch(apiKey, SECURITY_API_KEY)) {
    return res.status(401).json({
      error: "Unauthorized",
    });
  }

  next();
}

// ============================================================
// AGENT RATE LIMIT
// ============================================================

function checkRateLimit(agentId: string) {
  const now = Date.now();

  const current =
    requestTracker.get(agentId);

  if (!current) {
    requestTracker.set(agentId, {
      count: 1,
      windowStart: now,
    });

    return {
      allowed: true,
      remaining: RATE_LIMIT - 1,
    };
  }

  const windowExpired =
    now - current.windowStart >=
    RATE_WINDOW_MS;

  if (windowExpired) {
    requestTracker.set(agentId, {
      count: 1,
      windowStart: now,
    });

    return {
      allowed: true,
      remaining: RATE_LIMIT - 1,
    };
  }

  if (current.count >= RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
    };
  }

  current.count++;

  return {
    allowed: true,
    remaining:
      RATE_LIMIT - current.count,
  };
}

// ============================================================
// DAILY SPENDING LIMIT
// ============================================================

async function checkDailyLimit(
  agentId: string,
  amount?: number
) {
  if (amount === undefined) {
    return {
      allowed: true,
    };
  }

  const agent =
    await prisma.agent.findUnique({
      where: {
        id: agentId,
      },
      select: {
        dailyLimit: true,
      },
    });

  // null = unlimited
  if (
    agent?.dailyLimit === null ||
    agent?.dailyLimit === undefined
  ) {
    return {
      allowed: true,
    };
  }

  // Start of current calendar day
  const now = new Date();

  const startOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  // Calculate successful monetary actions
  // already performed today.
  const spending =
    await prisma.auditLog.aggregate({
      where: {
        agentId,
        allowed: true,
        executed: true,
        amount: {
          not: null,
        },
        createdAt: {
          gte: startOfDay,
        },
      },

      _sum: {
        amount: true,
      },
    });

  const spentToday =
    spending._sum.amount ?? 0;

  const projectedSpend =
    spentToday + amount;

  if (
    projectedSpend >
    agent.dailyLimit
  ) {
    return {
      allowed: false,
      reason:
        `Daily spending limit exceeded. ` +
        `Daily limit: ₹${agent.dailyLimit}. ` +
        `Spent today: ₹${spentToday}. ` +
        `Requested: ₹${amount}.`,
      spentToday,
      dailyLimit: agent.dailyLimit,
    };
  }

  return {
    allowed: true,
    spentToday,
    dailyLimit: agent.dailyLimit,
    remaining:
      agent.dailyLimit -
      projectedSpend,
  };
}

// ============================================================
// PERMISSION CHECKING
// ============================================================

async function checkPermission(
  agentId: string,
  action: Action
) {
  // ==========================================================
  // GLOBAL KILL SWITCH
  // ==========================================================

  const securityConfig =
    await prisma.securityConfig.findUnique({
      where: {
        id: 1,
      },
    });

  if (
    securityConfig?.killSwitch === true
  ) {
    return {
      allowed: false,
      reason:
        "Global kill switch is enabled",
    };
  }

  // ==========================================================
  // NORMAL PERMISSION CHECK
  // ==========================================================

  const permission =
    await prisma.permission.findFirst({
      where: {
        agentId,
        action: action.type,
      },
    });

  if (!permission) {
    return {
      allowed: false,
      reason:
        `Agent does not have permission for action: ${action.type}`,
    };
  }

  if (!permission.allowed) {
    return {
      allowed: false,
      reason:
        `Agent is not allowed to perform: ${action.type}`,
    };
  }

  // ==========================================================
  // REFUND LIMIT
  // ==========================================================

  if (action.type === "refund") {
    if (action.amount === undefined) {
      return {
        allowed: false,
        reason:
          "Refund amount is required",
      };
    }

    if (
      permission.maxAmount !== null &&
      action.amount >
        permission.maxAmount
    ) {
      return {
        allowed: false,
        reason:
          `Refund exceeds the ₹${permission.maxAmount} limit`,
      };
    }
  }

  // ==========================================================
  // DAILY SPENDING LIMIT
  // ==========================================================

  const dailyLimit =
    await checkDailyLimit(
      agentId,
      action.amount
    );

  if (!dailyLimit.allowed) {
    return {
      allowed: false,
      reason:
        dailyLimit.reason ??
        "Daily spending limit exceeded",
      dailyLimit: {
        limit:
          dailyLimit.dailyLimit,
        spentToday:
          dailyLimit.spentToday,
      },
    };
  }

  return {
    allowed: true,
    reason: "Action is allowed",

    ...(action.amount !== undefined &&
    dailyLimit.dailyLimit !== undefined
      ? {
          dailyLimit: {
            limit:
              dailyLimit.dailyLimit,
            spentToday:
              dailyLimit.spentToday,
            remaining:
              dailyLimit.remaining,
          },
        }
      : {}),
  };
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (_req, res) => {
  res.json({
    message:
      "AI Agent Security API is running",
  });
});

// ============================================================
// GET ALL AGENTS
// Protected: master API key required
// ============================================================

app.get(
  "/agents",
  requireApiKey,
  async (_req, res) => {
    try {
      const agents =
        await prisma.agent.findMany({
          include: {
            permissions: true,
          },
        });

      res.json(agents);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to fetch agents",
      });
    }
  }
);

// ============================================================
// CREATE AGENT
// Protected: master API key required
//
// New agents are BLOCKED by default.
// The dashboard can configure permissions afterward.
// ============================================================

app.post(
  "/agents",
  requireApiKey,
  async (req, res) => {
    try {
      const {
        id,
        agentId,
        name,
        dailyLimit,
      } = req.body;

      // Support both:
      // { id: "test-bot", name: "Test Bot" }
      // and
      // { agentId: "test-bot", name: "Test Bot" }

      const finalAgentId =
        id ?? agentId;

      if (
        !finalAgentId ||
        !name
      ) {
        return res.status(400).json({
          error:
            "id and name are required",
        });
      }

      const normalizedId =
        String(finalAgentId).trim();

      const normalizedName =
        String(name).trim();

      if (
        normalizedId.length === 0 ||
        normalizedName.length === 0
      ) {
        return res.status(400).json({
          error:
            "id and name cannot be empty",
        });
      }

      // Validate daily limit
      let normalizedDailyLimit:
        | number
        | null = null;

      if (
        dailyLimit !== undefined &&
        dailyLimit !== null &&
        dailyLimit !== ""
      ) {
        const parsedLimit =
          Number(dailyLimit);

        if (
          !Number.isFinite(
            parsedLimit
          ) ||
          parsedLimit < 0
        ) {
          return res.status(400).json({
            error:
              "dailyLimit must be a valid non-negative number",
          });
        }

        normalizedDailyLimit =
          parsedLimit;
      }

      // Check duplicate ID
      const existingAgentById =
        await prisma.agent.findUnique({
          where: {
            id: normalizedId,
          },
        });

      if (existingAgentById) {
        return res.status(409).json({
          error:
            "An agent with this id already exists",
        });
      }

      // Check duplicate name
      const existingAgentByName =
        await prisma.agent.findFirst({
          where: {
            name: normalizedName,
          },
        });

      if (existingAgentByName) {
        return res.status(409).json({
          error:
            "An agent with this name already exists",
        });
      }

      // Generate secure agent API key
      const apiKey =
        "agent_" +
        crypto
          .randomBytes(32)
          .toString("hex");

      // Create agent with safe defaults.
      //
      // IMPORTANT:
      // Every permission starts BLOCKED.
      // The administrator can explicitly enable
      // actions afterward.
      const agent =
        await prisma.agent.create({
          data: {
            id: normalizedId,

            name: normalizedName,

            apiKey,

            dailyLimit:
              normalizedDailyLimit,

            permissions: {
              create: [
                {
                  action:
                    "read_customers",
                  allowed: false,
                  maxAmount: null,
                },
                {
                  action:
                    "send_email",
                  allowed: false,
                  maxAmount: null,
                },
                {
                  action: "refund",
                  allowed: false,
                  maxAmount: 0,
                },
              ],
            },
          },

          include: {
            permissions: true,
          },
        });

      // IMPORTANT:
      // The API key is returned only during
      // agent creation.
      res.status(201).json({
        message:
          "Agent created successfully",

        agent: {
          id: agent.id,

          name: agent.name,

          apiKey: agent.apiKey,

          dailyLimit:
            agent.dailyLimit,

          permissions:
            agent.permissions,
        },
      });
    } catch (error) {
      console.error(
        "Create agent error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to create agent",
      });
    }
  }
);

// ============================================================
// GET AGENT PERMISSIONS
// Protected: master API key required
// ============================================================

app.get(
  "/agents/:agentId/permissions",
  requireApiKey,
  async (req, res) => {
    try {
      const agentId =
        String(req.params.agentId);

      const agent =
        await prisma.agent.findUnique({
          where: {
            id: agentId,
          },

          include: {
            permissions: true,
          },
        });

      if (!agent) {
        return res.status(404).json({
          error:
            "Agent not found",
        });
      }

      res.json({
        agentId: agent.id,
        name: agent.name,
        permissions:
          agent.permissions,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to fetch permissions",
      });
    }
  }
);

// ============================================================
// UPDATE / CREATE PERMISSION
// Protected: master API key required
// ============================================================

app.put(
  "/agents/:agentId/permissions",
  requireApiKey,
  async (req, res) => {
    try {
      const agentId =
        String(req.params.agentId);

      const {
        action,
        allowed,
        maxAmount,
      } = req.body;

      if (
        !action ||
        typeof allowed !==
          "boolean"
      ) {
        return res.status(400).json({
          error:
            "action and allowed are required",
        });
      }

      const agent =
        await prisma.agent.findUnique({
          where: {
            id: agentId,
          },
        });

      if (!agent) {
        return res.status(404).json({
          error:
            "Agent not found",
        });
      }

      let normalizedMaxAmount:
        | number
        | null = null;

      if (
        maxAmount !== undefined &&
        maxAmount !== null &&
        maxAmount !== ""
      ) {
        const parsedAmount =
          Number(maxAmount);

        if (
          !Number.isFinite(
            parsedAmount
          ) ||
          parsedAmount < 0
        ) {
          return res.status(400).json({
            error:
              "maxAmount must be a valid non-negative number",
          });
        }

        normalizedMaxAmount =
          parsedAmount;
      }

      const existingPermission =
        await prisma.permission.findFirst({
          where: {
            agentId,
            action,
          },
        });

      let permission;

      if (existingPermission) {
        permission =
          await prisma.permission.update({
            where: {
              id:
                existingPermission.id,
            },

            data: {
              allowed,

              maxAmount:
                normalizedMaxAmount,
            },
          });
      } else {
        permission =
          await prisma.permission.create({
            data: {
              agentId,

              action,

              allowed,

              maxAmount:
                normalizedMaxAmount,
            },
          });
      }

      res.json({
        message:
          "Permission updated",

        permission,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to update permission",
      });
    }
  }
);

// ============================================================
// CHECK PERMISSION
// Protected by agent-specific API key
// ============================================================

app.post(
  "/check-permission",
  async (req, res) => {
    try {
      const {
        agentId: rawAgentId,
        action,
      } = req.body;

      if (
        !rawAgentId ||
        !action?.type
      ) {
        return res.status(400).json({
          allowed: false,
          reason:
            "agentId and action.type are required",
        });
      }

      if (
        typeof action.type !== "string" ||
        action.type.trim().length === 0
      ) {
        return res.status(400).json({
          allowed: false,
          reason:
            "action.type must be a non-empty string",
        });
      }

      if (
        action.amount !== undefined &&
        (
          typeof action.amount !== "number" ||
          !Number.isFinite(action.amount) ||
          action.amount < 0
        )
      ) {
        return res.status(400).json({
          allowed: false,
          reason:
            "action.amount must be a finite non-negative number",
        });
      }

      const agentId =
        String(rawAgentId).trim();

      if (agentId.length === 0) {
        return res.status(400).json({
          allowed: false,
          reason:
            "agentId must be a non-empty string",
        });
      }

      // ========================================================
      // VERIFY AGENT API KEY
      // ========================================================
      // Missing agents and invalid credentials intentionally
      // return the same response to reduce agent enumeration.

      const providedApiKey =
        req.header("x-api-key");

      const agent =
        await prisma.agent.findUnique({
          where: {
            id: agentId,
          },
        });

      if (
        !agent ||
        !secretsMatch(
          providedApiKey,
          agent.apiKey
        )
      ) {
        return res.status(401).json({
          allowed: false,
          reason:
            "Invalid agent API key",
        });
      }

      const normalizedAction: Action = {
        type: action.type.trim(),
        ...(action.amount !== undefined
          ? { amount: action.amount }
          : {}),
      };

      // ========================================================
      // RATE LIMIT
      // ========================================================

      const rateLimit =
        checkRateLimit(agentId);

      if (!rateLimit.allowed) {
        res.setHeader(
          "X-RateLimit-Limit",
          RATE_LIMIT.toString()
        );

        res.setHeader(
          "X-RateLimit-Remaining",
          "0"
        );

        return res.status(429).json({
          allowed: false,
          reason:
            "Rate limit exceeded. Try again later.",
          remaining:
            rateLimit.remaining,
          rateLimit: {
            limit: RATE_LIMIT,
            remaining:
              rateLimit.remaining,
          },
        });
      }

      // ========================================================
      // PERMISSION DECISION
      // ========================================================

      const result =
        await checkPermission(
          agentId,
          normalizedAction
        );

      // ========================================================
      // AUDIT LOG
      // ========================================================

      const auditLog =
        await prisma.auditLog.create({
          data: {
            agentId,

            action:
              normalizedAction.type,

            amount:
              normalizedAction.amount ?? null,

            allowed:
              result.allowed,

            executed: false,

            reason:
              result.reason,
          },
        });

      res.setHeader(
        "X-RateLimit-Limit",
        RATE_LIMIT.toString()
      );

      res.setHeader(
        "X-RateLimit-Remaining",
        rateLimit.remaining.toString()
      );

      res.json({
        agentId,

        action: normalizedAction,

        decisionId: auditLog.id,

        ...result,

        rateLimit: {
          limit: RATE_LIMIT,
          remaining:
            rateLimit.remaining,
        },
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        allowed: false,
        reason:
          "Security service error",
      });
    }
  }
);

// ============================================================
// COMMIT EXECUTED ACTION
// Protected by agent-specific API key
//
// /check-permission only authorizes an action. It does NOT
// count the amount as spent. The agent calls this endpoint
// only after the downstream action actually succeeds.
// ============================================================

app.post(
  "/commit-action",
  async (req, res) => {
    try {
      const {
        decisionId,
        agentId: rawAgentId,
      } = req.body;

      if (
        !Number.isInteger(decisionId) ||
        decisionId <= 0
      ) {
        return res.status(400).json({
          success: false,
          reason:
            "decisionId must be a valid positive integer",
        });
      }

      if (
        typeof rawAgentId !== "string" ||
        rawAgentId.trim().length === 0
      ) {
        return res.status(400).json({
          success: false,
          reason:
            "agentId must be a non-empty string",
        });
      }

      const agentId = rawAgentId.trim();
      const providedApiKey =
        req.header("x-api-key");

      const agent =
        await prisma.agent.findUnique({
          where: { id: agentId },
          select: {
            id: true,
            apiKey: true,
            dailyLimit: true,
          },
        });

      if (
        !agent ||
        !secretsMatch(
          providedApiKey,
          agent.apiKey
        )
      ) {
        return res.status(401).json({
          success: false,
          reason: "Invalid agent API key",
        });
      }

      const committed =
        await prisma.$transaction(async (tx) => {
          const decision =
            await tx.auditLog.findUnique({
              where: { id: decisionId },
            });

          if (!decision) {
            return {
              ok: false as const,
              status: 404,
              reason: "Decision not found",
            };
          }

          if (decision.agentId !== agentId) {
            return {
              ok: false as const,
              status: 403,
              reason: "Decision does not belong to this agent",
            };
          }

          if (!decision.allowed) {
            return {
              ok: false as const,
              status: 409,
              reason: "Only an allowed decision can be committed",
            };
          }

          if (decision.executed) {
            return {
              ok: false as const,
              status: 409,
              reason: "Decision has already been committed",
            };
          }

          // Re-check the daily limit at commit time.
          // Only EXECUTED monetary actions count as spending.
          if (
            decision.amount !== null &&
            agent.dailyLimit !== null &&
            agent.dailyLimit !== undefined
          ) {
            const now = new Date();
            const startOfDay = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            );

            const spending =
              await tx.auditLog.aggregate({
                where: {
                  agentId,
                  allowed: true,
                  executed: true,
                  amount: { not: null },
                  createdAt: { gte: startOfDay },
                },
                _sum: { amount: true },
              });

            const spentToday =
              spending._sum.amount ?? 0;

            if (
              spentToday + decision.amount >
              agent.dailyLimit
            ) {
              return {
                ok: false as const,
                status: 409,
                reason:
                  `Daily spending limit exceeded at commit time. ` +
                  `Daily limit: ₹${agent.dailyLimit}. ` +
                  `Spent today: ₹${spentToday}. ` +
                  `Requested: ₹${decision.amount}.`,
              };
            }
          }

          const updated =
            await tx.auditLog.updateMany({
              where: {
                id: decisionId,
                agentId,
                allowed: true,
                executed: false,
              },
              data: {
                executed: true,
                executedAt: new Date(),
              },
            });

          if (updated.count !== 1) {
            return {
              ok: false as const,
              status: 409,
              reason:
                "Decision could not be committed; it may already be committed",
            };
          }

          return {
            ok: true as const,
            decisionId,
            amount: decision.amount,
          };
        });

      if (!committed.ok) {
        return res.status(committed.status).json({
          success: false,
          reason: committed.reason,
        });
      }

      res.json({
        success: true,
        decisionId: committed.decisionId,
        amount: committed.amount,
        message: "Executed action committed successfully",
      });
    } catch (error) {
      console.error("Commit action error:", error);

      res.status(500).json({
        success: false,
        reason: "Failed to commit executed action",
      });
    }
  }
);

// ============================================================
// KILL SWITCH
// Protected: master API key required
// ============================================================

app.post(
  "/kill-switch/on",
  requireApiKey,
  async (_req, res) => {
    try {
      const config =
        await prisma.securityConfig.update({
          where: {
            id: 1,
          },

          data: {
            killSwitch: true,
          },
        });

      res.json({
        message:
          "Kill switch ENABLED",

        killSwitch:
          config.killSwitch,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to enable kill switch",
      });
    }
  }
);

app.post(
  "/kill-switch/off",
  requireApiKey,
  async (_req, res) => {
    try {
      const config =
        await prisma.securityConfig.update({
          where: {
            id: 1,
          },

          data: {
            killSwitch: false,
          },
        });

      res.json({
        message:
          "Kill switch DISABLED",

        killSwitch:
          config.killSwitch,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to disable kill switch",
      });
    }
  }
);

app.get(
  "/kill-switch",
  requireApiKey,
  async (_req, res) => {
    try {
      const config =
        await prisma.securityConfig.findUnique({
          where: {
            id: 1,
          },
        });

      res.json({
        killSwitch:
          config?.killSwitch ?? false,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to fetch kill switch status",
      });
    }
  }
);

// ============================================================
// GET AUDIT LOGS
// Protected: master API key required
// ============================================================

app.get(
  "/audit-logs",
  requireApiKey,
  async (_req, res) => {
    try {
      const logs =
        await prisma.auditLog.findMany({
          orderBy: {
            createdAt:
              "desc",
          },
        });

      res.json(logs);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to fetch audit logs",
      });
    }
  }
);

// ============================================================
// DASHBOARD - GET ALL AGENTS
// Protected: master API key required
// ============================================================

app.get(
  "/dashboard/agents",
  requireApiKey,
  async (_req, res) => {
    try {
      const agents =
        await prisma.agent.findMany({
          include: {
            permissions: true,
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      const now = new Date();

      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      const agentsWithSpending =
        await Promise.all(
          agents.map(async (agent) => {
            // No daily limit = unlimited
            if (
              agent.dailyLimit === null ||
              agent.dailyLimit === undefined
            ) {
              return {
                id: agent.id,

                name: agent.name,

                dailyLimit: null,

                spentToday: null,

                remainingToday: null,

                createdAt:
                  agent.createdAt,

                permissions:
                  agent.permissions,
              };
            }

            const spending =
              await prisma.auditLog.aggregate({
                where: {
                  agentId: agent.id,

                  allowed: true,

                  executed: true,

                  amount: {
                    not: null,
                  },

                  createdAt: {
                    gte: startOfDay,
                  },
                },

                _sum: {
                  amount: true,
                },
              });

            const spentToday =
              spending._sum.amount ??
              0;

            const remainingToday =
              Math.max(
                0,
                agent.dailyLimit -
                  spentToday
              );

            return {
              id: agent.id,

              name: agent.name,

              dailyLimit:
                agent.dailyLimit,

              spentToday,

              remainingToday,

              createdAt:
                agent.createdAt,

              permissions:
                agent.permissions,
            };
          })
        );

      res.json({
        agents:
          agentsWithSpending,
      });
    } catch (error) {
      console.error(
        "Dashboard agents error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load dashboard agents",
      });
    }
  }
);

// ============================================================
// DASHBOARD - SECURITY STATISTICS
// Protected: master API key required
// ============================================================

app.get(
  "/dashboard/stats",
  requireApiKey,
  async (_req, res) => {
    try {
      const now = new Date();

      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

      const totalAgents =
        await prisma.agent.count();

      const requestsToday =
        await prisma.auditLog.count({
          where: {
            createdAt: {
              gte: startOfDay,
            },
          },
        });

      const allowedToday =
        await prisma.auditLog.count({
          where: {
            createdAt: {
              gte: startOfDay,
            },

            allowed: true,
          },
        });

      const blockedToday =
        await prisma.auditLog.count({
          where: {
            createdAt: {
              gte: startOfDay,
            },

            allowed: false,
          },
        });

      res.json({
        totalAgents,

        requestsToday,

        allowedToday,

        blockedToday,
      });
    } catch (error) {
      console.error(
        "Dashboard stats error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load dashboard statistics",
      });
    }
  }
);

// ============================================================
// DASHBOARD - RECENT SECURITY EVENTS
// Protected: master API key required
// ============================================================

app.get(
  "/dashboard/events",
  requireApiKey,
  async (_req, res) => {
    try {
      const events =
        await prisma.auditLog.findMany({
          orderBy: {
            createdAt:
              "desc",
          },

          take: 20,
        });

      res.json({
        events,
      });
    } catch (error) {
      console.error(
        "Dashboard events error:",
        error
      );

      res.status(500).json({
        error:
          "Failed to load dashboard events",
      });
    }
  }
);

// ============================================================
// START SERVER
// ============================================================

if (!SECURITY_API_KEY) {
  console.error(
    "FATAL: SECURITY_API_KEY is not configured."
  );
  process.exit(1);
}

app.listen(
  PORT,
  () => {
    console.log(
      `Security API running at http://localhost:${PORT}`
    );
  }
);