import "dotenv/config";

async function main() {
  const response = await fetch(
    "http://localhost:3000/kill-switch",
    {
      headers: {
        "x-api-key": process.env.SECURITY_API_KEY!,
      },
    }
  );

  console.log("Status:", response.status);
  console.log(await response.text());
}

main().catch(console.error);