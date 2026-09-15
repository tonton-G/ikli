# ikli

A keyless link shortener. No accounts — each link gets a single edit key at creation time, which is the only way to modify or delete it. Stats stay public forever; losing the key freezes the destination but the redirect keeps working.

**Live:** ikli.fyi

## Why this exists

This is a small, deliberately-scoped AWS portfolio project focused on EC2 fleet management — Auto Scaling, immutable AMIs, and stateless application design — rather than application complexity. The link-shortener domain was picked specifically because it's simple enough that the infrastructure, not the CRUD logic, is the thing being demonstrated.

## Features

- Paste a URL, get a short link — no signup, no login
- Auto-generated edit key on creation (e.g. `tide-9042-plum`) — the only way back into a link
- Vanity slug editing — rename a link after the fact without reissuing it
- Public stats page at `ikli.fyi/<slug>+` — clicks, uniques, referrers, no auth required
- Custom QR code generation as PNG/SVG, independent of the slug — six module patterns (incl. fluid, diamond, star), four eye styles, solid/gradient colors, background incl. transparent, center emoji or uploaded logo (with automatic error-correction bump), and frames with editable label text

## Architecture

```
                           ┌──────────────┐
                           │   Route 53   │  ikli.fyi — A alias at the apex
                           └──────┬───────┘
                                  │
                           ┌──────▼───────┐
                           │  CloudFront  │──/assets/*──OAC──▶  S3
                           └──────┬───────┘                     (Block Public
                                  │  default behavior            Access on)
                                  │  (everything else)
    public subnets     ┌ ─ ─ ─ ─ ─▼─ ─ ─ ─ ─ ┐
    10.0.0.0/24   1a        │     ALB     │       SG: 443 from the CloudFront
    10.0.1.0/24   1b   └ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ┘    managed prefix list only
                                  │  HTTP :3000
    private subnets    ┌ ─ ─ ─ ─ ─┴─ ─ ─ ─ ─ ─ ─ ┐   SG: :3000 from the ALB's
    10.0.10.0/24  1a   │    Auto Scaling Group   │   SG only. No public IPs,
    10.0.11.0/24  1b   │   ┌─────┐     ┌─────┐   │   no NAT, no default route.
                       │   │ EC2 │     │ EC2 │   │   ← Golden AMI (Packer)
                       │   └─────┘     └─────┘   │      Mixed: On-Demand + Spot
                       └ ─ ─ ─ ─ ─┬─ ─ ─ ─ ─ ─ ─ ┘
                                  │  VPC Gateway Endpoint (free, no NAT)
                           ┌──────▼───────┐
                           │   DynamoDB   │  on-demand, TTL on `expiresAt`
                           └──────────────┘

         CloudWatch — target-tracking scaling, alarms, dashboards
         SSM Session Manager — instance access, no bastion, no open 22
```

**Express owns all routing behind the default behavior.** A bare slug returns `302`; SPA routes (`/<slug>/edit`, `/<slug>+`) return `index.html`; `/api/*` returns JSON. CloudFront cannot distinguish `/<slug>` from an SPA route by path pattern, so that decision has to happen in application code — which is why the SPA shell is served by the origin and only hashed build assets sit behind `/assets/*`. The frontend calls the API with relative paths, so it is same-origin and behaves identically on the CloudFront domain and the custom domain.

### AWS services

| Service                               | Role                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EC2 + Auto Scaling Group**          | API tier, stateless, spans 2 AZs, min 2 / max 4, target-tracking scaling, ELB health checks                                                                                              |
| **Packer**                            | Bakes a golden AMI (app + runtime pre-installed) — no config-on-boot                                                                                                                     |
| **Application Load Balancer**         | Terminates TLS, forwards all paths to the ASG, health-checks targets at `/api/health`                                                                                                   |
| **DynamoDB**                          | One table, exact-key access only: link records by slug, per-visitor markers by `v#<slug>#<hash>` with a TTL. No sort key, no GSI. Keeps the EC2 tier stateless so scaling in/out is safe |
| **CloudWatch**                        | Scaling-policy alarms, dashboards                                                                                                                                                        |
| **Systems Manager (Session Manager)** | Instance access without a bastion host or open port 22                                                                                                                                   |
| **S3 + CloudFront**                   | Hosts hashed build assets; bucket has Block Public Access on, reachable only via CloudFront (Origin Access Control)                                                                      |
| **VPC Gateway Endpoint**              | Private route from the ASG to DynamoDB — no NAT Gateway, no public internet hop, no hourly charge                                                                                        |
| **ACM**                               | Certificates in two regions: us-east-1 for CloudFront, ap-southeast-1 for the ALB. Each service only reads certificates from its own region                                              |
| **Route 53**                          | Custom domain (`ikli.fyi`)                                                                                                                                                               |
| **IAM**                               | Instance role scoped to the single table ARN, actions limited to those the app calls — no wildcard resource or action                                                                    |

## Tech stack

**Frontend** — React 18, Vite, TypeScript, shadcn/ui (Radix primitives, restyled), Tailwind CSS v4, Caveat (display) + Geist Mono (data/UI)
**Backend** — Node.js + Express (TypeScript), health check at `/api/health`
**Storage** — one `LinkStore` interface with two implementations: a JSON file for local dev and tests, DynamoDB for production. Selected at startup by `DYNAMODB_TABLE`; the server refuses to boot on the file store when `NODE_ENV=production`
**Infra as code** — Terraform

## Infrastructure

All AWS resources are managed by Terraform except the two noted below. Nothing is console-clicked into existence outside of Terraform state.

**Network.** A single VPC at `10.0.0.0/16` with DNS support and DNS hostnames both enabled — the latter is a functional prerequisite for VPC interface endpoints to resolve to private addresses, not a nicety. Four subnets across two AZs in `ap-southeast-1`. The third octet encodes tier (0–9 public, 10–19 private), with a gap left for a third tier. Availability zones are declared explicitly rather than derived from `data.aws_availability_zones`, because the CIDR-to-AZ mapping is an architectural decision and deriving it from list order would let it shift silently.

Two route tables. The public table carries a default route to the internet gateway; the private table carries no default route at all, which is what makes "no outbound internet" a property of the network rather than a claim. Both private subnets are associated explicitly rather than left to fall through to the VPC's main route table, so their isolation can't be changed by a route added somewhere else.

**Security groups** are chained by group reference, never by CIDR. A rule that names another security group is evaluated by identity at packet time, so it keeps holding as the ASG launches, terminates and replaces instances — no address is ever enumerated. Egress is scoped rather than left open: the app tier may reach the interface endpoints on 443 and DynamoDB's managed prefix list on 443, and nothing else. Rules are declared as standalone resources rather than inline blocks, because inline rules are exhaustive and cannot express two groups that reference each other.

**State** stays local. A remote backend with S3 and DynamoDB locking is the right answer for a team; for a short-lived solo project it is ceremony, and the tradeoff is stated here rather than papered over.

**Deliberately outside Terraform:** the Route 53 hosted zone and the AWS Budget. Both are account-scoped guardrails that must survive `terraform destroy`. A cost alarm destroyed during teardown disappears exactly when it matters, and a recreated hosted zone is assigned a different nameserver set, forcing a registrar update and a fresh propagation wait on every cycle. The zone is referenced as a `data` source.

**Cost shape.** The only fixed hourly costs in the build are the ALB and, when enabled, the SSM interface endpoints — three of them (`ssm`, `ssmmessages`, `ec2messages`), billed per AZ. They sit behind an `enable_ssm_endpoints` variable that defaults to off. Everything else is either free (VPC, subnets, route tables, security groups, gateway endpoint, ACM, IAM) or usage-priced (DynamoDB on demand, CloudFront, Route 53 queries).

**Teardown is part of the design.** `terraform destroy` does not remove Packer-built AMIs or their backing EBS snapshots, and deregistering an AMI does not delete its snapshot — both bill until deleted by hand. They are on the teardown checklist alongside a `terraform plan` review confirming nothing touches the hosted zone.

## Design decisions worth noting

- **No auth, key-based recovery instead.** Trades account-recovery UX for zero signup friction. A lost key is unrecoverable by design — there's no "forgot key" flow, because there's no account to recover into.
- **Slug and QR style are decoupled.** Restyling a QR code never changes the underlying slug, so a code already printed somewhere never breaks. The QR style is stored with the link and re-rendered from one SVG code path for preview, PNG, and SVG export.
- **Short URLs are minted from configuration, not from the request.** The base URL comes from a `BASE_URL` environment variable injected at launch, not derived from the `Host` header or `window.location.origin`. A QR code is a durable artifact — someone may print it — so a code minted while the app was reached on the CloudFront domain must not encode a hostname that dies at teardown.
- **Stateless compute, stateful store.** The API tier holds no session or link data locally — required for the ASG to scale in/out without losing data or breaking in-flight requests. Edit keys are stored as SHA-256 hashes, never in plaintext.
- **Immutable AMI over user-data bootstrapping.** New instances boot pre-configured rather than pulling code and config at startup — faster boot, and no drift between instances built at different times. With no NAT Gateway this is not merely preferable but required: a private instance cannot install anything. The Packer builder runs in a public subnet with a public IP, so the bake reaches the internet through the IGW at no charge and the resulting AMI boots privately with nothing left to download.
- **An empty route table is a security control.** The private subnets have no path to `0.0.0.0/0`. Everything the fleet needs is reached through endpoints: DynamoDB via a free gateway endpoint, SSM via interface endpoints when enabled. A NAT Gateway would have cost more per hour than the compute it served and would have quietly given every instance outbound internet access.
- **DynamoDB, not RDS.** Access is a single-item lookup by partition key plus a counter increment. It is also structurally required — the EC2 tier has to be stateless for the Auto Scaling story to hold at all.
- **The link record has a fixed maximum size.** Redirects are unauthenticated, and two of the stats fields are derived from request headers a visitor controls (`Referer`, `User-Agent`). Left unbounded, either one lets anyone grow a record until DynamoDB's 400 KB item limit refuses every further write to it, including the owner's edits: the link is bricked and the edit key can't help, because repairing is also a write. So the referrer map is capped at 50 distinct hosts, enforced with a `size()` condition on the update so racing instances can't overshoot it, with everything past the cap folded into one `(other)` bucket; and uniques is a plain integer, bumped only when a conditional put of a per-visitor marker succeeds. Markers live in the same table under a key no slug can produce and expire after 30 days, so "unique" means unique within a rolling month. The per-day map is the one field that still grows, by one small key per day from the server's clock, which a visitor can't influence.
- **Single table by necessity, not fashion.** Every access is a get, put, update or delete on a key the app already holds. There is no query, so there is no sort key and no secondary index to design or pay for. The partition key is a namespaced string — `v#` is reserved for visitor markers and unreachable from the API, which validates slugs at the boundary. The rate-limit counters that would close the remaining cost vector fit the same shape.
- **Stats are best-effort; the redirect is not.** The counter write happens before the redirect but its failure is logged and swallowed. A throttled table, a transient error or a full record costs one data point, never the link.
- **The health check touches nothing.** `/api/health` returns a static 200 without reading DynamoDB. A health check that depends on the data layer turns a throttled table into an empty target group: every instance reports unhealthy at once and the ASG terminates the entire fleet.

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
- To run the API against a real table locally, export `DYNAMODB_TABLE=<TABLE_NAME>` and `AWS_REGION=<REGION>`. The SDK resolves region from the environment; on EC2 that comes from instance metadata, but locally an unset region surfaces as a misleading credentials error

```bash
npm test          # backend integration tests (node:test, real HTTP against the app)
npm run build     # typecheck + production builds for client and server
```

### Deploying the infrastructure

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # fill in account ID and your /32
terraform init
terraform plan
terraform apply
```

The provider pins `allowed_account_ids`, so a plan fails before touching anything if credentials resolve to the wrong account. `my_ip_cidr` scopes ALB ingress to a single workstation address during the build; residential addresses rotate, and a stale value presents as a hanging connection rather than a clean refusal.

## Security

- **Network isolation** — the ASG runs in private subnets with no public IPs and no default route. Only the ALB sits in public subnets. Security groups are chained by group reference: the ALB accepts 443 from the CloudFront managed prefix list, and instances accept the app port only from the ALB's security group. Restricting the ALB to CloudFront's prefix list closes origin bypass — the load balancer has no reachable address outside the CDN.
- **No NAT dependency** — DynamoDB access goes through a VPC Gateway Endpoint rather than a NAT Gateway, keeping the data path off the public internet at no extra cost.
- **Least-privilege IAM** — the EC2 instance role is scoped to the specific table ARN and only the actions the app calls; no wildcard resources or actions.
- **Encryption in transit** — TLS terminates at CloudFront and again at the ALB, both redirecting HTTP to HTTPS, with ACM-issued certificates. The final hop from ALB to instance is plain HTTP inside private subnets with no internet path, reachable only from the ALB's security group. Re-encrypting that hop would mean managing certificates on ephemeral instances for a segment that never leaves the VPC.
- **Encryption at rest** — DynamoDB's default AWS-owned key. The `server_side_encryption` block is deliberately omitted rather than set to `enabled = true`, which would switch the table to an AWS-managed KMS key and add KMS request charges to every read and write for no change in protection.
- **Static assets locked down** — the S3 bucket has Block Public Access enabled; CloudFront reaches it via Origin Access Control, so the bucket has no public endpoint of its own.
- **No SSH surface** — all instance access is via SSM Session Manager; port 22 is never opened, and no key pair is attached to the launch template.
- **App-level** — edit keys are never stored in plaintext (SHA-256) and are compared in constant time. Destination URLs are restricted to `http`/`https`, so a stored destination can never be a `javascript:` or `data:` URI, and private IP ranges, localhost and the instance metadata endpoint are rejected. Slugs are validated at the API boundary so non-link keys in the table are unreachable from it.
- **No write amplification from the redirect path** — see _The link record has a fixed maximum size_ above. Header-derived stats fields are capped in key space, not just in request rate, so no volume of anonymous traffic can make a link unwritable.

Explicitly out of scope for this project's size: WAF, GuardDuty, AWS Config, a customer-managed KMS key, and a remote Terraform backend. Reasonable additions for a production system, disproportionate for a portfolio timebox.

**Known limitations, chosen rather than overlooked.** Slug rename reads the record and then moves it in a transaction; a visit that lands in that window increments the old item and is deleted with it, so the counter can regress by a few under load. Renames are rare and owner-initiated, and closing this needs optimistic concurrency on a path nobody races, so it is documented instead. Visitor markers are keyed by slug, so for 30 days after a rename returning visitors count as new again, and markers for a deleted link linger until the TTL sweeps them. The per-visitor marker design also turns the old bricking attack into a cost attack: many unique `User-Agent` values mean many cheap marker writes. Per-IP rate limiting, not yet built, is the mitigation for that; during the demo window the ALB is unreachable outside CloudFront, which bounds the exposure but is not the control.

**No interstitial warning page.** Every URL shortener can hide a destination, and a warning page doesn't close that gap: the visitor it targets clicks through, and anyone wanting a silent redirect uses a different service. The mitigations that actually work are conditional — warn only on URLs a reputation service like Safe Browsing or VirusTotal has flagged — or reactive: abuse reports plus takedown, which is how the large shorteners handle it. The first is a real third-party dependency rather than a checkbox, and is out of scope here. The second needs a way to disable a slug, which a keyless, admin-less model has no product surface for; takedown would be an operator action against the table. A universal warning page would have looked like a control without being one, so there isn't one.

