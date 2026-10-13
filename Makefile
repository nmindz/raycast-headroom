# Local install into every Raycast app present (Raycast and/or Raycast Beta). See README "Install".

# Absolute directory of this Makefile: targets work from any cwd (`make -f`, `make -C`, another shell location).
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
LOCAL := "$(ROOT)/scripts/raycast-local.sh"

.PHONY: install uninstall restart-raycast

# install: install dependencies if needed, then build and register the extension with each Raycast app
install: $(ROOT)/node_modules
	$(LOCAL) install

# uninstall: remove the build from every Raycast extensions folder and restart the running apps
uninstall:
	$(LOCAL) uninstall
	@$(LOCAL) restart

# restart-raycast: quit and reopen each running Raycast app so it re-indexes local extensions
restart-raycast:
	@$(LOCAL) restart

# Reinstalls only when the lockfile changed since the last install.
$(ROOT)/node_modules: $(ROOT)/pnpm-lock.yaml
	pnpm --dir "$(ROOT)" install --frozen-lockfile
	@touch "$(ROOT)/node_modules"
