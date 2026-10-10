# Security policy

## Supported versions

Only the latest release of the Veolia integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue, pull request or forum post for a
security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-veolia](https://github.com/prohand/gladys-veolia/security), then
**Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove e-mail addresses, passwords, tokens and
  meter numbers first).

You should get a first answer within 7 days. A fix is released as a new version
of the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes —
in particular anything that could leak the Veolia credentials or the access
token (logs, files, requests to another host).

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)),
and the Veolia services (eau.veolia.fr, its sign-in and backend), which belong
to Veolia.

## How the integration handles your credentials

- The e-mail and password are stored by Gladys in the integration
  configuration (the password as a `secret` field), not by the integration.
- The password is only sent to the Veolia sign-in service
  (`cognito-idp.eu-west-3.amazonaws.com`), over HTTPS, in a request body —
  never in a URL, never in the logs.
- The access token lives in memory only. The file the integration writes in
  `/data` holds reading dates, no credential.
- The integration only reads data: it never changes anything on the Veolia
  account.

## Good practices for users

- Use a unique password for your Veolia account.
- Treat the integration logs as personal data (consumption, meter number)
  before sharing them.
- Keep Gladys and the integration up to date.
