# Sanchalix Documentation

Sanchalix is a multi-school School Management System for K-12 schools, built with Next.js (App Router, TypeScript), MongoDB/Mongoose, the AWS Cloudscape Design System and Reicon icons. These documents define what we build, for whom, how it looks and behaves, and how it is engineered. **UX is the top priority**, and every decision traces back to a real user.

> This folder is referred to as `/docs` throughout. On disk it is `Docs/`, which is the same path on Windows and macOS default file systems.

## Start here

| If you are… | Read in this order |
|---|---|
| New to the project | [01 Vision](01-product-vision.md) → [02 Personas and roles](02-personas-and-roles.md) → [22 Glossary](22-glossary.md) → [07 Information architecture](07-information-architecture.md) |
| A product manager | 01 → 02 → [03 PRD](03-prd.md) → [04 Journeys](04-user-journeys.md) → [05 Roadmap](05-roadmap.md) |
| A designer | [06 UX principles](06-ux-principles.md) → 07 → [08 Design system](08-design-system.md) → [09 Iconography](09-iconography.md) → [10 Screen specs](10-screen-specs.md) → [11 Accessibility](11-accessibility.md) → [12 Microcopy](12-content-and-microcopy.md) |
| An engineer | [../CLAUDE.md](../CLAUDE.md) → [13 Architecture](13-architecture.md) → [14 Data model](14-data-model.md) → [15 API spec](15-api-spec.md) → [16 Security](16-auth-and-security.md) → [17 Coding standards](17-coding-standards.md) → [18 Testing](18-testing-strategy.md) |
| On-call / DevOps | [20 DevOps](20-devops-and-deployment.md) → [19 Performance](19-performance-and-scalability.md) → [21 Integrations](21-notifications-and-integrations.md) → 16 |
| An AI assistant (Claude) | [../CLAUDE.md](../CLAUDE.md) first, always |

## Index

### Product
| Doc | What it answers |
|---|---|
| [01-product-vision.md](01-product-vision.md) | Why Sanchalix exists; goals, success metrics, non-goals, key assumptions |
| [02-personas-and-roles.md](02-personas-and-roles.md) | Who the 9 roles are; scopes; the full RBAC permission matrix |
| [03-prd.md](03-prd.md) | Every module's features (MoSCoW + release), user stories and acceptance criteria |
| [04-user-journeys.md](04-user-journeys.md) | End-to-end flows across roles (admission → first day, attendance, exams, fees, PTM…) |
| [05-roadmap.md](05-roadmap.md) | MVP → v1 → v2 scope, milestones, exit criteria, risks |

### UX and design
| Doc | What it answers |
|---|---|
| [06-ux-principles.md](06-ux-principles.md) | The principles, heuristics and rules for making UX decisions; the four-states rule |
| [07-information-architecture.md](07-information-architecture.md) | Sitemap, navigation per role, URL structure, search, deep links |
| [08-design-system.md](08-design-system.md) | Which Cloudscape component to use for what; tokens, theming, dark mode, density, do's and don'ts |
| [09-iconography.md](09-iconography.md) | Reicon rules, the complete icon map, Cloudscape `iconSvg`/`svg` integration, accessibility |
| [10-screen-specs.md](10-screen-specs.md) | Every key screen: components, icons, states, validation, microcopy |
| [11-accessibility.md](11-accessibility.md) | WCAG 2.2 AA mapping, keyboard, screen readers, contrast, testing |
| [12-content-and-microcopy.md](12-content-and-microcopy.md) | Voice, terminology, formats, error messages, templates, Hindi notes |

### Engineering
| Doc | What it answers |
|---|---|
| [13-architecture.md](13-architecture.md) | System and container architecture, folder structure, rendering, state, jobs |
| [14-data-model.md](14-data-model.md) | Every MongoDB collection: fields, validation, indexes, relationships, lifecycle |
| [15-api-spec.md](15-api-spec.md) | Every Server Action and Route Handler: permission, input, output, errors |
| [16-auth-and-security.md](16-auth-and-security.md) | Authentication, RBAC enforcement, encryption, OWASP Top 10, DPDP privacy |
| [17-coding-standards.md](17-coding-standards.md) | TypeScript, naming, structure, comments, error handling, lint rules |
| [18-testing-strategy.md](18-testing-strategy.md) | Test layers, must-test areas, coverage, E2E journeys, CI gates |
| [19-performance-and-scalability.md](19-performance-and-scalability.md) | Budgets, pagination, queries, indexes, caching, multi-tenancy, scaling |
| [20-devops-and-deployment.md](20-devops-and-deployment.md) | Environments, CI/CD, env vars, monitoring, backups, incidents |
| [21-notifications-and-integrations.md](21-notifications-and-integrations.md) | Notification pipeline and channels, payment gateways, webhooks, devices |

### Project
| Doc | What it answers |
|---|---|
| [22-glossary.md](22-glossary.md) | The canonical meaning and code name of every term |
| [23-decision-log.md](23-decision-log.md) | ADRs: what we decided, why, and what we rejected |

## Sources of truth

When documents overlap, one document owns each topic, and the others link to it.

| Topic | Owner |
|---|---|
| Terms and names | [22-glossary.md](22-glossary.md) |
| Roles, scopes and permissions | [02-personas-and-roles.md](02-personas-and-roles.md) |
| Entities, fields and indexes | [14-data-model.md](14-data-model.md) |
| Icon for each concept | [09-iconography.md](09-iconography.md) (mirrored by `src/components/icons.tsx`) |
| Words shown to users | [12-content-and-microcopy.md](12-content-and-microcopy.md) |
| Feature scope and release | [03-prd.md](03-prd.md) + [05-roadmap.md](05-roadmap.md) |
| Why a decision was made | [23-decision-log.md](23-decision-log.md) |

## Conventions

- Diagrams are Mermaid, embedded in Markdown.
- Role keys (`school_admin`), permission strings (`fees.payment.create`), icon keys (`collectPayment`) and entity names (`Enrollment`) are written in code style and used identically everywhere.
- Features are tagged with a release: **MVP**, **v1** or **v2**.
- Documents are updated **in the same pull request** as the behaviour change they describe. A PR that changes behaviour without updating the relevant doc isn't done.
- New decisions with trade-offs get an ADR in [23-decision-log.md](23-decision-log.md).
