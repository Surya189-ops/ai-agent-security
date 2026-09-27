import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getApiKey(envName: string) {
  return (
    process.env[envName] ??
    `agent_${crypto.randomBytes(32).toString("hex")}`
  );
}

async function main() {
  const refundBotApiKey = getApiKey("REFUND_BOT_API_KEY");
  const supportBotApiKey = getApiKey("SUPPORT_BOT_API_KEY");
  const readonlyBotApiKey = getApiKey("READONLY_BOT_API_KEY");

  await prisma.agent.upsert({
    where: { id: "refund-bot" },
    update: {
      apiKey: refundBotApiKey,
      dailyLimit: 50000,
    },
    create: {
      id: "refund-bot",
      name: "Refund Bot",
      apiKey: refundBotApiKey,
      dailyLimit: 50000,
      permissions: {
        create: [
          {
            action: "read_customers",
            allowed: true,
          },
          {
            action: "send_email",
            allowed: true,
          },
          {
            action: "refund",
            allowed: true,
            maxAmount: 15000,
          },
        ],
      },
    },
  });

  await prisma.agent.upsert({
    where: { id: "support-bot" },
    update: {
      apiKey: supportBotApiKey,
    },
    create: {
      id: "support-bot",
      name: "Support Bot",
      apiKey: supportBotApiKey,
      permissions: {
        create: [
          {
            action: "read_customers",
            allowed: true,
          },
          {
            action: "send_email",
            allowed: true,
          },
          {
            action: "refund",
            allowed: false,
            maxAmount: 0,
          },
        ],
      },
    },
  });

  await prisma.agent.upsert({
    where: { id: "readonly-bot" },
    update: {
      apiKey: readonlyBotApiKey,
    },
    create: {
      id: "readonly-bot",
      name: "Readonly Bot",
      apiKey: readonlyBotApiKey,
      permissions: {
        create: [
          {
            action: "read_customers",
            allowed: true,
          },
          {
            action: "send_email",
            allowed: false,
            maxAmount: 0,
          },
          {
            action: "refund",
            allowed: false,
            maxAmount: 0,
          },
        ],
      },
    },
  });

  await prisma.securityConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      killSwitch: false,
    },
  });

  console.log("Agents seeded successfully.");
  console.log("Security config seeded successfully.");

  if (!process.env.REFUND_BOT_API_KEY) {
    console.log("Generated REFUND_BOT_API_KEY:", refundBotApiKey);
  }

  if (!process.env.SUPPORT_BOT_API_KEY) {
    console.log("Generated SUPPORT_BOT_API_KEY:", supportBotApiKey);
  }

  if (!process.env.READONLY_BOT_API_KEY) {
    console.log("Generated READONLY_BOT_API_KEY:", readonlyBotApiKey);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });