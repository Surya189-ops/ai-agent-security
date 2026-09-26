import { prisma } from "./src/prisma";

async function main() {
  const existing = await prisma.securityConfig.findUnique({
    where: {
      id: 1,
    },
  });

  if (existing) {
    console.log("Security config already exists");
    return;
  }

  await prisma.securityConfig.create({
    data: {
      id: 1,
      killSwitch: false,
    },
  });

  console.log("Security config created");
  console.log("Kill switch: OFF");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
