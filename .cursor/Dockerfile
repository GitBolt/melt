# Cloud Agent base image for Melt: Node 24 (project requires >=24.13.0) plus
# Foundry (anvil/forge) for the local chain. Repository dependencies and the
# Playwright browser are installed in the environment `install` step, not here,
# so they track the checked-out lockfile.
FROM node:24-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git curl ca-certificates python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

# Foundry provides anvil (local Ethereum) and forge (contract tests).
# Copy into /usr/local/bin so both root and ubuntu sessions can run them.
RUN curl -L https://foundry.paradigm.xyz | bash \
    && /root/.foundry/bin/foundryup \
    && install -m 0755 /root/.foundry/bin/anvil /root/.foundry/bin/forge /root/.foundry/bin/cast /usr/local/bin/
ENV PATH="/usr/local/bin:/root/.foundry/bin:${PATH}"
