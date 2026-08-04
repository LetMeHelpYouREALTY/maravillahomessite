# Next.js SaaS Starter

This is a starter template for building a SaaS application using **Next.js** with support for authentication, Stripe integration for payments, and a dashboard for logged-in users.

**Demo: [https://next-saas-start.vercel.app/](https://next-saas-start.vercel.app/)**

## Features

- Marketing landing page (`/`) with animated Terminal element
- Pricing page (`/pricing`) which connects to Stripe Checkout
- Dashboard pages with CRUD operations on users/teams
- Basic RBAC with Owner and Member roles
- Subscription management with Stripe Customer Portal
- Email/password authentication with JWTs stored to cookies
- Global middleware to protect logged-in routes
- Local middleware to protect Server Actions or validate Zod schemas
- Activity logging system for any user events

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/)
- **Database**: [Postgres](https://www.postgresql.org/)
- **ORM**: [Drizzle](https://orm.drizzle.team/)
- **Payments**: [Stripe](https://stripe.com/)
- **UI Library**: [shadcn/ui](https://ui.shadcn.com/)

## Getting Started

```bash
git clone https://github.com/nextjs/saas-starter
cd saas-starter
pnpm install
```

## Running Locally

[Install](https://docs.stripe.com/stripe-cli) and log in to your Stripe account:

```bash
stripe login
```

Use the included setup script to create your `.env` file:

```bash
pnpm db:setup
```

Run the database migrations and seed the database with a default user and team:

```bash
pnpm db:migrate
pnpm db:seed
```

This will create the following user and team:

- User: `test@test.com`
- Password: `admin123`

You can also create new users through the `/sign-up` route.

Finally, run the Next.js development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the app in action.

You can listen for Stripe webhooks locally through their CLI to handle subscription change events:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Testing Payments

To test Stripe payments, use the following test card details:

- Card Number: `4242 4242 4242 4242`
- Expiration: Any future date
- CVC: Any 3-digit number

## CallAction API

Server-side proxy routes for the [CallAction](https://callaction.co) v2 API. The
account API token stays on the server; the browser talks only to these routes,
and every one of them requires a signed-in session.

Set `CALLACTION_API_TOKEN` in your `.env` (see `.env.example` for the optional
overrides: base URL, auth style, and request timeout).

| Route | Upstream | Query parameters |
| --- | --- | --- |
| `GET /api/callaction/contacts` | `GET /v2/contacts` | `page`, `per_page`, `channel_id`, `source_id`, `search` |
| `GET /api/callaction/contacts?start_date=&end_date=` | `GET /v2/contacts` | as above, date-bounded |
| `GET /api/callaction/contacts/{contactId}/activity` | `GET /v2/contacts/{contactId}/activity` | `page`, `per_page`, `type`, `start_date`, `end_date` |
| `GET /api/callaction/channels` | `GET /v2/channels` | `page`, `per_page` |
| `GET /api/callaction/sources` | `GET /v2/sources` | `page`, `per_page` |

`start_date`/`end_date` accept ISO-8601 dates or date-times and may also be
written as `from`/`to`. They are all-or-nothing: sending one without the other,
or a range that runs backwards, returns `400`.

Every route responds with a normalized `{ "data": [...], "meta": {...} }`
envelope regardless of whether CallAction returned a bare array or a wrapped
object:

```bash
curl --cookie "session=..." \
  "http://localhost:3000/api/callaction/contacts?start_date=2026-01-01&end_date=2026-01-31&per_page=50"
```

To call the API from your own server code, skip the routes and use the client
directly:

```ts
import { listContacts } from '@/lib/callaction/client';

const { data, meta } = await listContacts({ start_date: '2026-01-01', end_date: '2026-01-31' });
```

The client retries `429` and `5xx` responses twice with backoff (honouring
`Retry-After`) and throws `CallActionApiError` for anything else.

## Going to Production

When you're ready to deploy your SaaS application to production, follow these steps:

### Set up a production Stripe webhook

1. Go to the Stripe Dashboard and create a new webhook for your production environment.
2. Set the endpoint URL to your production API route (e.g., `https://yourdomain.com/api/stripe/webhook`).
3. Select the events you want to listen for (e.g., `checkout.session.completed`, `customer.subscription.updated`).

### Deploy to Vercel

1. Push your code to a GitHub repository.
2. Connect your repository to [Vercel](https://vercel.com/) and deploy it.
3. Follow the Vercel deployment process, which will guide you through setting up your project.

### Add environment variables

In your Vercel project settings (or during deployment), add all the necessary environment variables. Make sure to update the values for the production environment, including:

1. `BASE_URL`: Set this to your production domain.
2. `STRIPE_SECRET_KEY`: Use your Stripe secret key for the production environment.
3. `STRIPE_WEBHOOK_SECRET`: Use the webhook secret from the production webhook you created in step 1.
4. `POSTGRES_URL`: Set this to your production database URL.
5. `AUTH_SECRET`: Set this to a random string. `openssl rand -base64 32` will generate one.
6. `CALLACTION_API_TOKEN`: Your CallAction account API token.

## Other Templates

While this template is intentionally minimal and to be used as a learning resource, there are other paid versions in the community which are more full-featured:

- https://achromatic.dev
- https://shipfa.st
- https://makerkit.dev
- https://zerotoshipped.com
- https://turbostarter.dev
