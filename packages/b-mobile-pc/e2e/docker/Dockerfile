# The libraries Electron needs on a Linux box with no desktop: GTK, NSS, audio, a virtual display.
# Built by e2e/run.sh. On the dev VM the build needs the squid proxy: run.sh passes http(s)_proxy
# through as build args and builds with --network host.
FROM ubuntu:24.04
ARG http_proxy
ARG https_proxy
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      xvfb xauth libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libxss1 libxtst6 libdrm2 \
      libxkbcommon0 libatk-bridge2.0-0t64 libcups2t64 fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*
