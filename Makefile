# Local install into every Raycast app present (Raycast and/or Raycast Beta). See README "Install".

.PHONY: install uninstall restart-raycast

# install: install dependencies if needed, then build and register the extension with each Raycast app
install: node_modules
	scripts/raycast-local.sh install

# uninstall: remove the build from every Raycast extensions folder and restart the running apps
uninstall:
	scripts/raycast-local.sh uninstall
	@scripts/raycast-local.sh restart

# restart-raycast: quit and reopen each running Raycast app so it re-indexes local extensions
restart-raycast:
	@scripts/raycast-local.sh restart

# Reinstalls only when the lockfile changed since the last install.
node_modules: pnpm-lock.yaml
	pnpm install --frozen-lockfile
	@touch node_modules
