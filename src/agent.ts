import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type AIAction = {
  action: string;
  amount?: number;
};

type SecurityAction = {
  type: string;
  amount?: number;
};

type SecurityResult = {
  agentId: string;
  action: SecurityAction;
  allowed: boolean;
  reason: string;
  decisionId?: number;
};

async function askAI(): Promise<AIAction> {
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    input: `
You are a customer support AI agent.

A customer wants a refund of ₹3,000.

Decide what action you want to perform.

Respond ONLY with JSON.
Do not use markdown or code fences.

Format:
{
  "action": "refund",
  "amount": 50000
}
`,
  });

  let output = response.output_text.trim();

  output = output
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(output);
}

async function checkWithSecurityService(
  action: SecurityAction
): Promise<SecurityResult> {
  const agentApiKey =
    process.env.REFUND_BOT_API_KEY;

  if (!agentApiKey) {
    throw new Error(
      "REFUND_BOT_API_KEY is not configured"
    );
  }

  const response = await fetch(
    "http://localhost:3000/check-permission",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": agentApiKey,
      },
      body: JSON.stringify({
        agentId: "refund-bot",
        action,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Security service returned HTTP ${response.status}`
    );
  }

  return response.json() as Promise<SecurityResult>;
}

async function commitExecutedAction(
  decisionId: number
) {
  const agentApiKey =
    process.env.REFUND_BOT_API_KEY;

  if (!agentApiKey) {
    throw new Error(
      "REFUND_BOT_API_KEY is not configured"
    );
  }

  const response = await fetch(
    "http://localhost:3000/commit-action",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": agentApiKey,
      },
      body: JSON.stringify({
        agentId: "refund-bot",
        decisionId,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.reason ??
        `Commit service returned HTTP ${response.status}`
    );
  }

  return result;
}

async function fakeRefund(amount: number) {
  console.log(
    `💰 Fake refund executed: ₹${amount}`
  );
}

async function runAgent() {
  console.log("🤖 AI Agent starting...\n");

  const aiAction = await askAI();

  console.log("AI requested:", aiAction);

  const securityAction: SecurityAction = {
    type: aiAction.action,
    amount: aiAction.amount,
  };

  const securityResult =
    await checkWithSecurityService(
      securityAction
    );

  console.log("\n🛡️ Security Service:");
  console.log(securityResult);

  if (!securityResult.allowed) {
    console.log("\n❌ ACTION BLOCKED");
    console.log(
      `Reason: ${securityResult.reason}`
    );
    return;
  }

  if (
    aiAction.action === "refund" &&
    aiAction.amount !== undefined
  ) {
    console.log("\n✅ Action approved");

    // The security check only authorizes the action.
    // Spending is recorded only after the downstream action succeeds.
    await fakeRefund(aiAction.amount);

    if (securityResult.decisionId === undefined) {
      throw new Error(
        "Security service did not return a decisionId"
      );
    }

    const commitResult =
      await commitExecutedAction(
        securityResult.decisionId
      );

    console.log("\n📒 Execution committed:");
    console.log(commitResult);
    return;
  }

  console.log(
    "\n⚠️ Action approved, but this demo agent has no execution handler for it."
  );
}

runAgent().catch((error) => {
  console.error("\n🚨 Agent error:");
  console.error(error.message);
});
