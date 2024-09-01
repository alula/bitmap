# 1 billion checkboxes

https://bitmap.alula.me/

## Dev setup

Client:

```bash
cd client
cp .env.example .env
pnpm install
pnpm dev
```

Server:

```bash
cd server
cp config.example.toml config.toml
cargo run
```

## Release build

Client:

```bash
cd client
pnpm build
# Static site is in `dist/client` directory
```

Server:

```bash
cd server
cargo build --release
# Compiled binary is `target/release/checkboxes-server`
```


