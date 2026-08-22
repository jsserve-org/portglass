---
name: deploy-portglass
description: Deploy Portglass to production — push to main, wait for the GH Actions Docker build, pull the new image on sub2api-gpt1.ai.yhw.tw and recreate the container, then health-check. Use when the user says deploy, ship, release, push it live, update the server, or after landing changes they want running on prod.
---

# Deploy Portglass

Production = Docker on the remote box. Never touch Postgres or unrelated
containers; only the `portglass` service is ever pulled/recreated.

## Pipeline

1. **Push**: `git push origin main` (CI builds only from `main`).
2. **Build on GH**: note the run id, then wait:
   ```bash
   gh run watch $(gh run list --workflow=docker.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
   gh run list --workflow=docker.yml --limit 1   # expect: completed success
   ```
   Produces `ghcr.io/jsserve-org/portglass:latest` (+ `sha-<sha>`).
   If the run failed, fetch logs (`gh run view <id> --log-failed`) and fix
   before touching the server.
3. **SSH**: user is `howard` (NOT root — root has no authorized key), key is
   `~/.ssh-agents/id_ed25519` (note the plural directory). Always pass both
   explicitly; do not trust `~/.ssh/config`, whose entry says `User root` and
   will fail:
   ```bash
   SSH="ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $HOME/.ssh-agents/id_ed25519 howard@sub2api-gpt1.ai.yhw.tw"
   ```
4. **Pull + restart** (passwordless sudo works):
   ```bash
   $SSH 'cd ~/portglass && sudo docker compose -f docker-compose.prod.yml pull portglass && \
         sudo docker compose -f docker-compose.prod.yml up -d portglass'
   ```
5. **Verify** (all three, in one SSH call):
   ```bash
   $SSH 'sleep 5; \
     sudo docker ps --filter name=portglass-portglass --format "{{.Image}} | {{.Status}}"; \
     sudo docker logs portglass-portglass-1 2>&1 | tail -5; \
     curl -s http://localhost:51111/api/health'
   ```
   Expect: container `Up …` seconds, log line `Portglass ready on …` +
   `Drizzle migrations up to date`, and `{"ok":true}`.

## Rules

- Recreate ONLY the `portglass` service. Never `down`, never touch
  `portglass-postgres-1`, `sub2api-*`, `new-api`, etc. — other people's
  services share that box.
- Migrations run automatically on boot (custom `server.js`). If logs show a
  migration failure, roll forward with a fix commit — do not hand-edit the DB.
- Local pre-flight before pushing: `npx tsc --noEmit` and `npm run build`.
  (`npm run lint` is broken with this Next version; ignore it.)
- Report the deployed commit SHA and the health-check output when done.
