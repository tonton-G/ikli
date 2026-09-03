# ikli

A keyless link shortener. No accounts — each link gets a single edit key at creation time, which is the only way to modify or delete it. Stats stay public forever; losing the key freezes the destination but the redirect keeps working.

**Live:** `<YOUR_DEPLOYED_URL>`

## Why this exists

This is a small, deliberately-scoped AWS portfolio project focused on EC2 fleet management — Auto Scaling, immutable AMIs, and stateless application design — rather than application complexity. The link-shortener domain was picked specifically because it's simple enough that the infrastructure, not the CRUD logic, is the thing being demonstrated.

## Features

- Paste a URL, get a short link — no signup, no login
- Auto-generated edit key on creation (e.g. `tide-9042-plum`) — the only way back into a link
- Vanity slug editing, expiration, and optional password protection
- Public stats page at `ikli.to/<slug>+` — clicks, uniques, referrers, no auth required
- Custom QR code generation as PNG/SVG, independent of the slug — six module patterns (incl. fluid, diamond, star), four eye styles, solid/gradient colors, background incl. transparent, center emoji or uploaded logo (with automatic error-correction bump), and frames with editable label text

## Architecture

```
                         ┌─────────────┐
                         │  Route 53   │  (ikli.to)
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │ CloudFront   │──OAC──▶ S3 (React build,
                         └──────┬──────┘          Block Public Access on)
                                │  /api/* (HTTPS only, 80→443 redirect)
                    ┌ ─ ─ ─ ─ ─▼─ ─ ─ ─ ─ ┐  public subnets
                         │     ALB      │
                    └ ─ ─ ─ ─ ┬ ─ ─ ─ ─ ─┘
                       SG: 443 from ALB only
                    ┌ ─ ─ ─ ─ ┴ ─ ─ ─ ─ ─ ┐  private subnets, no public IPs
                    │   Auto Scaling Group   │  (2 AZs, min 2 / max 4)
                    │  ┌─────┐    ┌─────┐    │
                    │  │ EC2 │    │ EC2 │    │  ← Golden AMI (Packer)
                    │  └─────┘    └─────┘    │     Mixed: On-Demand + Spot
                    └ ─ ─ ─ ─ ┬ ─ ─ ─ ─ ─ ┘
                                │  via VPC Gateway Endpoint (no NAT)
                         ┌──────▼──────┐
                         │  DynamoDB   │  (slug, longUrl, clicks, key)
                         └─────────────┘

              CloudWatch — scaling alarms, dashboards
              SSM Session Manager — instance access, no bastion, no open 22
```

### AWS services

| Service                               | Role                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **EC2 + Auto Scaling Group**          | API tier, stateless, spans 2 AZs, scales on CloudWatch alarms                                                                      |
| **EC2 Image Builder / Packer**        | Bakes a golden AMI (app + runtime pre-installed) — no config-on-boot                                                               |
| **Application Load Balancer**         | Routes `/api/*` traffic to the ASG, health-checks instances                                                                        |
| **DynamoDB**                          | Single-table store (`slug`, `longUrl`, `clicks`, `editKeyHash`) — keeps the EC2 tier stateless so scaling in/out is safe           |
| **CloudWatch**                        | Scaling-policy alarms (CPU / request count), dashboards                                                                            |
| **Systems Manager (Session Manager)** | Instance access without a bastion host or open port 22                                                                             |
| **S3 + CloudFront**                   | Hosts the static React build; bucket has Block Public Access on, reachable only via CloudFront (Origin Access Control)             |
| **VPC Gateway Endpoint**              | Private route from the ASG to DynamoDB — no NAT Gateway, no public internet hop                                                    |
| **Route 53**                          | Custom domain (`ikli.to`)                                                                                                          |
| **IAM**                               | Instance role scoped to the single table ARN, actions limited to `GetItem`/`PutItem`/`UpdateItem` — no wildcard resource or action |

## Tech stack

**Frontend** — React 18, Vite, TypeScript, shadcn/ui (Radix primitives, restyled), Tailwind CSS v4, Caveat (display) + Geist Mono (data/UI)
**Backend** — Node.js + Express (TypeScript), health check at `/api/health`
**Storage** — `LinkStore` interface with a JSON-file implementation for local dev; the production implementation targets DynamoDB with the same contract
**Infra as code** — `<Terraform or CloudFormation — TBD>`

## Design decisions worth noting

- **No auth, key-based recovery instead.** Trades account-recovery UX for zero signup friction. A lost key is unrecoverable by design — there's no "forgot key" flow, because there's no account to recover into.
- **Slug and QR style are decoupled.** Restyling a QR code never changes the underlying slug, so a code already printed somewhere never breaks. The QR style is stored with the link and re-rendered from one SVG code path for preview, PNG, and SVG export.
- **Stateless compute, stateful store.** The API tier holds no session or link data locally — required for the ASG to scale in/out without losing data or breaking in-flight requests. Edit keys are stored as SHA-256 hashes, passwords as salted scrypt.
- **Immutable AMI over user-data bootstrapping.** New instances boot pre-configured rather than pulling code/config at startup — faster boot, and no drift between instances built at different times.

## Local development

```bash
git clone <YOUR_REPO_URL>
cd ikli
npm install
npm run dev
```

- Frontend on `http://localhost:5173` (Vite, proxies `/api/*` to the backend)
- API + redirects on `http://localhost:3001` — short links resolve at `http://localhost:3001/<slug>`
- Public stats at `http://localhost:5173/<slug>+`, editing at `/<slug>/edit`
- Dev data persists to `server/data/links.json` (gitignored)

```bash
npm test          # backend integration tests (node:test, real HTTP against the app)
npm run build     # typecheck + production builds for client and server
```

## Infrastructure notes

- ASG: min 2 / max 4 instances, mixed-instances policy (On-Demand base capacity + Spot for burst)
- Health checks: ALB target group, unhealthy instances replaced automatically
- No SSH — all instance access via SSM Session Manager

## Security

- **Network isolation** — ASG runs in private subnets with no public IPs; only the ALB sits in public subnets. Security groups are chained: ALB accepts 443 from the internet, EC2 accepts the app port only from the ALB's security group.
- **No NAT dependency** — DynamoDB access goes through a VPC Gateway Endpoint rather than a NAT Gateway, keeping the data path off the public internet at no extra cost.
- **Least-privilege IAM** — the EC2 instance role is scoped to the specific table ARN and only the actions the app calls; no wildcard resources or actions.
- **Encryption in transit** — HTTPS enforced end to end (ALB and CloudFront both redirect HTTP → HTTPS); ACM-issued certificates.
- **Encryption at rest** — DynamoDB's default encryption (AWS owned key), no additional setup required.
- **Static assets locked down** — S3 bucket has Block Public Access enabled; CloudFront reaches it via Origin Access Control, so the bucket has no public endpoint of its own.
- **No SSH surface** — all instance access is via SSM Session Manager; port 22 is never opened.
- **App-level** — edit keys never stored in plaintext (SHA-256), link passwords salted with scrypt, destination URLs restricted to http/https, and password-protected links never expose their destination through the public API.
- **No silent redirects** — every visit (link or QR scan) lands on an interstitial that spells out the full destination and requires the visitor to press Continue. There is no setting to turn it off, so an ikli link can't be used to hide a phishing target behind a short URL.

Explicitly out of scope for this project's size: WAF, GuardDuty, AWS Config, and a customer-managed KMS key. Reasonable additions for a production system, disproportionate for a portfolio timebox.

---

Part of a two-project AWS portfolio, alongside `<YOUR_TALAS_REPO_LINK>` (three-tier exam reviewer platform).
