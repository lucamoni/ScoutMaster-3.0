# ScoutMaster security configuration

## Required environment variables

The following variables must be configured only on the server/deployment platform:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`: comma-separated email addresses allowed to perform administrative operations
- `GEMINI_API_KEY` and/or `GROQ_API_KEY` when AI features are enabled

Never expose `SUPABASE_SERVICE_ROLE_KEY` through a variable prefixed with
`NEXT_PUBLIC_`.

## Application roles

Privileged API routes read the role from Supabase Auth `app_metadata.role`.
Supported roles are:

- `admin`: full privileged access;
- `tesoriere`: financial audit and event payment synchronization;
- `capo`: event payment synchronization.

An email listed in `ADMIN_EMAILS` is treated as an administrator. This provides
a safe bootstrap path while roles are configured in Supabase.

Roles must be written to `app_metadata` from a trusted server or the Supabase
dashboard. Do not store authorization roles in `user_metadata`, because users
can edit that field.

## Public repository incident response

The `.antigravity_backup` directory is ignored for future commits, but files
already committed remain in Git history. Before processing real personal data:

1. make the repository private while remediation is in progress;
2. inspect the committed backup locally for secrets and personal data;
3. rotate Supabase, Gemini, Groq and Google credentials that may have appeared;
4. remove the directory from all history with `git filter-repo`;
5. force-push the cleaned history only after coordinating with all collaborators.

Deleting the directory in a normal commit is not sufficient to remove historical
copies.

## Personal data and AI

OCR and chatbot features can transmit content to external AI providers. Deployers
must document the legal basis, retention policy and provider agreements before
using these features with minors' personal or medical data. Prefer redaction and
data minimization, and provide a way to disable AI processing.

## Database policies

Enable Row Level Security on every table containing personal or financial data.
Service-role clients may only be created in server-only modules and must always
be preceded by application-level authorization.
