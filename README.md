# AI Agent Security & Permission Manager

A security and policy-control layer for autonomous AI agents.

## Overview

AI agents can make decisions and interact with real-world tools and APIs. This project adds an independent security layer between the AI agent and those actions.

```text
AI Agent
   ↓
Security Layer
   ↓
Authentication
   ↓
Permission & Policy Checks
   ↓
Rate / Spending Limits
   ↓
Allow or Block
   ↓
Tool / API
   ↓
Real-World Action
```

The security layer makes the final authorization decision instead of trusting the AI model alone.

## Core Principle

> The AI agent requests. The security layer decides.

The AI model does not directly control the security policies. Policies are enforced independently by the security service.

## Features

* Agent-specific API authentication
* Granular action permissions
* Per-action monetary limits
* Daily spending limits
* Rate limiting
* Global emergency kill switch
* Security audit logs
* Execution tracking
* Authorization → execution → commit workflow
* Agent management dashboard
* Security statistics dashboard
* Recent security event monitoring

## Authorization & Execution Flow

```text
1. AI Agent requests an action
2. Security layer authenticates the agent
3. Security layer evaluates the requested action
4. Policy engine returns allow/block decision
5. Allowed request receives a decision ID
6. Agent performs the actual action
7. Agent commits the execution
8. Security layer records the execution
9. Executed transactions contribute to spending limits
```

## Architecture

```text
                         ┌─────────────────────┐
                         │      AI Agent       │
                         │                     │
                         │ Refund / Email /    │
                         │ Customer Actions    │
                         └──────────┬──────────┘
                                    │
                                    │ Action Request
                                    ▼
                 ┌──────────────────────────────────┐
                 │       AI SECURITY LAYER          │
                 │                                  │
                 │  ┌────────────────────────────┐  │
                 │  │ Agent Authentication       │  │
                 │  └─────────────┬──────────────┘  │
                 │                ▼                 │
                 │  ┌────────────────────────────┐  │
                 │  │ Permission & Policy Engine │  │
                 │  └─────────────┬──────────────┘  │
                 │                ▼                 │
                 │  ┌────────────────────────────┐  │
                 │  │ Security Controls          │  │
                 │  │                            │  │
                 │  │ • Rate Limits              │  │
                 │  │ • Per-Action Limits        │  │
                 │  │ • Daily Spending Limits    │  │
                 │  │ • Kill Switch              │  │
                 │  └─────────────┬──────────────┘  │
                 └────────────────┼─────────────────┘
                                  │
                         ┌────────┴────────┐
                         │                 │
                      BLOCK             ALLOW
                         │                 │
                         ▼                 ▼
                   ┌──────────┐    ┌─────────────────┐
                   │  DENIED  │    │   Decision ID   │
                   │  Action  │    │                 │
                   └──────────┘    └────────┬────────┘
                                            │
                                            ▼
                                  ┌──────────────────┐
                                  │     Tool / API   │
                                  │                  │
                                  │ Payment / Email  │
                                  │ Database / SaaS  │
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ Real-World Action│
                                  └────────┬─────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ Execution Commit │
                                  │                  │
                                  │ Audit Log        │
                                  │ Spending Update  │
                                  └──────────────────┘
```

See [architecture.md](architecture.md) for the detailed architecture.

## Example

A refund agent requests:

```text
Refund: ₹50,000
```

If its configured maximum refund is ₹15,000:

```text
REQUEST
   ↓
Security Layer
   ↓
₹50,000 > ₹15,000
   ↓
BLOCKED
```

A permitted ₹3,000 refund can proceed:

```text
REQUEST
   ↓
Security Layer
   ↓
₹3,000 <= ₹15,000
   ↓
ALLOWED
   ↓
Action Executed
   ↓
Execution Committed
   ↓
Audit Log + Spending Updated
```

## Security Controls

### Authentication

Requests require valid security credentials.

### Agent Permissions

Each AI agent can have independent permissions for actions such as:

```text
read_customers
send_email
refund
```

### Monetary Limits

Individual actions can have maximum transaction amounts.

### Daily Spending Limits

Agents can have a maximum amount they are allowed to execute per day.

### Rate Limiting

Agents are limited to a defined number of requests per minute.

### Kill Switch

A global emergency control can immediately disable agent actions.

### Audit Logging

Security decisions and executed actions are recorded for monitoring and investigation.

### Execution Tracking

Authorization and execution are tracked separately. Only successfully committed executions contribute to spending calculations.

## Dashboard

The dashboard provides visibility into:

* Agents
* Permissions
* Spending
* Remaining limits
* Security events
* Kill switch status
* Policy configuration

## Tech Stack

* TypeScript
* Node.js
* Express
* Prisma
* SQLite
* OpenAI API
* HTML / CSS / JavaScript

## Project Structure

```text
ai-agent-security/
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
│
├── public/
│   └── index.html
│
├── src/
│   ├── index.ts
│   ├── agent.ts
│   ├── prisma.ts
│   └── db-test.ts
│
├── architecture.md
├── .gitignore
├── package.json
└── tsconfig.json
```

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key
SECURITY_API_KEY=your_master_security_api_key
DATABASE_URL="file:./dev.db"
```

Never commit `.env` or API keys to GitHub.

### 3. Generate Prisma client

```bash
npx prisma generate
```

### 4. Start the server

```bash
npm run dev
```

The dashboard will be available at:

```text
http://localhost:3000
```

## Current Status

This is an MVP demonstrating the core authorization and execution-control architecture for AI agents.

The current implementation is intended for development, experimentation, demonstrations, and further security hardening.

## Roadmap

* [ ] Developer SDK
* [ ] Public API documentation
* [ ] PostgreSQL production database
* [ ] Distributed rate limiting
* [ ] API key hashing and rotation
* [ ] Key revocation
* [ ] Automated security test suite
* [ ] HTTPS / production deployment
* [ ] Monitoring and alerting
* [ ] Multi-tenant organizations
* [ ] Webhook-based integrations
* [ ] Additional AI-agent tool integrations

## Security Disclaimer

This project is an MVP and has not been independently audited.

Do not use it to authorize high-value real-world transactions without appropriate security review and additional production hardening.

## License

MIT
