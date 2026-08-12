# Repository instructions

Follow the workspace Governance workflow and the global rules in
`../governance/STACK.md`.

- Never commit `.env`, Discord credentials or AI-provider API keys.
- Use `npm run dev`, `npm test` and `npm run build` as the standard local
  commands.
- Production deploy changes require a Governance task/run, Infrastructure
  declaration, reviewed dry run, explicit apply approval, health check and
  rollback evidence.
- Lumi Bot production runs as `lumi-bot.service` from `/opt/lumi-bot`; Nginx is
  the only public HTTP entrypoint.
