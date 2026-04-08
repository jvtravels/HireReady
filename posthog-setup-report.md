<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the HireStepX project. A shared `posthog-node` client was created in `api/_posthog.ts` for all Vercel serverless API routes. Seven server-side events were instrumented across five critical API routes covering the full payment lifecycle, subscription management, and account deletion. Exception capture was also added to all error handlers so crashes in these routes are automatically tracked. Environment variables for both the server-side (`POSTHOG_API_KEY`, `POSTHOG_HOST`) and client-side (`VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`) SDKs were written to `.env`.

| Event | Description | File |
|---|---|---|
| `order_created` | User initiates a payment order for a subscription plan (Razorpay order created server-side) | `api/create-order.ts` |
| `payment_verified` | Payment successfully verified and subscription activated after Razorpay payment | `api/verify-payment.ts` |
| `payment_failed` | Payment verification failed (signature mismatch or amount mismatch) | `api/verify-payment.ts` |
| `webhook_payment_activated` | Razorpay webhook confirmed payment and activated subscription (safety net path) | `api/razorpay-webhook.ts` |
| `subscription_cancelled` | User cancelled their subscription (cancel_at_period_end set to true) | `api/cancel-subscription.ts` |
| `subscription_reactivated` | User reversed their cancellation (cancel_at_period_end set back to false) | `api/reactivate-subscription.ts` |
| `account_deleted` | User deleted their account and all associated data | `api/delete-account.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://us.posthog.com/project/370211/dashboard/1433109
- **Payment conversion funnel** (signup → order → payment): https://us.posthog.com/project/370211/insights/hsXq9s4a
- **Interview session completion funnel** (session_start → session_complete): https://us.posthog.com/project/370211/insights/KgY4l2SX
- **Daily paying users** (payment_verified + webhook activations): https://us.posthog.com/project/370211/insights/bAi2Oylp
- **Subscription cancellations vs reactivations:** https://us.posthog.com/project/370211/insights/SjTd26cI
- **Account deletions:** https://us.posthog.com/project/370211/insights/j7oRxtzR

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
