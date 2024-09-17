FROM mcr.microsoft.com/devcontainers/base:debian

# Install python
RUN apt-get update \
    && apt-get install -y python3 python3-pip python-is-python3

# Install deno
ENV DENO_INSTALL=/deno
RUN mkdir -p /deno \
    && curl -fsSL https://deno.land/install.sh | sh \
    && chown -R vscode /deno

ENV PATH=${DENO_INSTALL}/bin:${PATH} \
    DENO_DIR=${DENO_INSTALL}/.cache/deno