# AI Agent Security Architecture

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

## Core Principle

> The AI agent requests. The security layer decides.

The security layer independently enforces authentication, permissions, transaction limits, rate limits, spending limits, and emergency controls before an AI agent can perform a protected action.
