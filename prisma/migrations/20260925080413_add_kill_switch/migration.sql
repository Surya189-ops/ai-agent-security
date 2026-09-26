-- CreateTable
CREATE TABLE "SecurityConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
