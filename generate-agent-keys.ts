import "dotenv/config";
import crypto from "crypto";
import { prisma } from "./src/prisma";

async function main() {
  const agents = await prisma.agent.findMany();

  for (const agent of agents) {
    if (agent.apiKey) {
      console.log(`${agent.id}: already has an API key`);
      continue;
    }

    const apiKey = `agent_${crypto.randomBytes(32).toString("hex")}`;

    await prisma.agent.update({
      where: { id: agent.id },
      data: { apiKey },
    });

    console.log(`${agent.id}: API key generated`);
    console.log(`KEY=${apiKey}\n`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });