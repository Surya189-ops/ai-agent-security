import { prisma } from "./prisma";

async function main() {
  const count = await prisma.agent.count();
  console.log("Agent count:", count);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });