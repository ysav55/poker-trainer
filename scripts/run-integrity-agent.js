#!/usr/bin/env node

/**
 * Invokes the Integration Integrity Agent (Managed Agent) against staging.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node scripts/run-integrity-agent.js [environment_id]
 *
 * Find your environment_id in Claude Console → Managed Agents → Environments.
 *
 * The agent will open the staging app in a browser, log in with the
 * provided credentials, and run integration checks.
 */

const Anthropic = require("@anthropic-ai/sdk");
const readline = require("readline");

const AGENT_ID = "agent_011CZvDNzQYMtxBHoGSYZPag";
const ENVIRONMENT_ID = "env_01EUb7gccGJgePxHPb8rLr1d";
const STAGING_URL = "https://poker-trainer-staging.fly.dev";

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }


  const name = await prompt("Player name: ");
  const password = await prompt("Player password: ");

  if (!name || !password) {
    console.error("Error: name and password are required.");
    process.exit(1);
  }

  const client = new Anthropic();

  console.log("\nCreating session with Integration Integrity Agent...");

  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENVIRONMENT_ID,
    title: `Integration check — ${new Date().toISOString().slice(0, 10)}`,
  });

  console.log(`Session created: ${session.id}`);
  console.log("Streaming agent responses...\n");
  console.log("─".repeat(60));

  const stream = await client.beta.sessions.events.stream(session.id);

  await client.beta.sessions.events.send(session.id, {
    events: [
      {
        type: "user.message",
        content: [
          {
            type: "text",
            text: [
              `Staging environment URL: ${STAGING_URL}`,
              `Login name: ${name}`,
              `Login password: ${password}`,
              "",
              "Please run the full integration integrity check.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "agent.message") {
      const text = (event.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (text) process.stdout.write(text);
    } else if (event.type === "agent.tool_use") {
      console.log(`\n[Tool: ${event.name}]`);
    } else if (event.type === "session.status_idle") {
      console.log("\n" + "─".repeat(60));
      console.log("Agent finished.");
      break;
    }
  }

  console.log(`\nSession ID: ${session.id}`);
  console.log(
    "View full session in Claude Console: https://console.anthropic.com"
  );
}

main().catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
