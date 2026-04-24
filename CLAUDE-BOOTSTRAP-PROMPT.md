TODO
----

(This file includes the original instructions given to Claude Code during setup)

Objective
=========
Create a POC integration between the "Better Auth" nodejs library and the GOV.UK One Login service

Context
=======
The "Better Auth" library has recently added support for `private_key_jwt` authentication, which is the preferred authentication method when integrating services with GOV.UK One Login. I want to test that the Better Auth support works correctly with GOV.UK One login, by creating a local POC integration with the GOV.UK One Login simulator.

Resources
=========
- Better Auth PR for `private_key_jwt` support: https://github.com/better-auth/better-auth/pull/8836
- GOV.UK One Login Simulator: https://github.com/govuk-one-login/simulator
- GOV.UK One Login technical documentation: https://docs.sign-in.service.gov.uk

Rules
=====
- Use mise for tool management
- Use pnpm for nodejs package management
- Use pnpm 'minumumReleaseAge' to ensure node dependencies are at least 24 hours old
- Run the GOV.UK One Login simulator using docker
