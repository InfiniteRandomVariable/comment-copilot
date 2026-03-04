# Hard Isolation Checklist

This project must stay independent from SwapSafe.

## Source and delivery

- Separate repository and branch protections.
- Separate CI/CD pipelines and deploy credentials.

## Cloud and runtime

- Separate cloud account/project.
- Separate network boundary, compute, databases, and caches.
- No shared service discovery or internal DNS records.

## Security

- Separate secret manager namespace.
- Separate KMS keys and rotation policy.
- No shared API keys or webhook secrets.

## Identity

- Separate Clerk project.
- Separate TikTok/Instagram OAuth app credentials.

## Observability

- Separate logging, metrics, tracing, and alert channels.
- Independent incident runbooks and on-call ownership.
