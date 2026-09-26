import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.agent.upsert({
    where: { id: "refund-bot" },
    update: {},
    create: {
      id: "refund-bot",
      name: "Refund Bot",
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
            maxAmount: 5000,
          },
        ],
      },
    },
  });

  await prisma.agent.upsert({
    where: { id: "support-bot" },
    update: {},
    create: {
      id: "support-bot",
      name: "Support Bot",
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
    update: {},
    create: {
      id: "readonly-bot",
      name: "Readonly Bot",
      permissions: {
        create: [
          {
            action: "read_customers",
            allowed: true,
          },
          {
            action: "send_email",
            allowed: false,
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

  console.log("Agents seeded successfully.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });