# The canary-net oracle. This is OUR OWN trusted code, not the untrusted
# target -- it doesn't need the target's lockdown (seccomp, read-only fs,
# dropped caps). Its only job is to log inbound requests reliably.

FROM node:22-slim
WORKDIR /app
COPY listener.ts dns-rebind.ts .
CMD ["node", "listener.ts"]
