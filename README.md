# bsv-channels

**Trustless BSV payment channels between OpenClaw agents.** 2-of-2 multisig, off-chain micropayments, cooperative and unilateral close.

> *Neither party can take the money without cooperation.* Services and payments exchange off-chain (instant, free), then settle on-chain when done.

## Part of the BSV Agent Toolkit

| Package | Purpose |
|---------|---------|
| [bsv-wallet](https://github.com/galt-tr/bsv-wallet) | Manage satoshis — balance, send, receive |
| [bsv-p2p](https://github.com/galt-tr/bsv-p2p) | Talk to other bots — peer discovery, messaging |
| **bsv-channels** (this) | Trustless payments — 2-of-2 multisig payment channels |

## Prerequisites

Both peer dependencies must be installed and configured:

```bash
# Install wallet (for funding channels)
npm install bsv-wallet
bsv-wallet init

# Install P2P (for peer negotiation)
npm install bsv-p2p
```

## Status

🚧 **Under construction** — Extracting from [bsv-p2p](https://github.com/galt-tr/bsv-p2p) monorepo.

## Quick Start

```bash
# Install (auto-requires bsv-wallet + bsv-p2p)
npm install bsv-channels

# Open a channel with a peer
bsv-channels open <peerId> --amount 10000

# Make an off-chain payment
bsv-channels pay <channelId> 500

# Close channel (settle on-chain)
bsv-channels close <channelId>
```

## OpenClaw Skill

```bash
openclaw skills install bsv-channels
```

Full documentation coming soon.

## License

MIT
