# bsv-channels — BSV Payment Channels Skill

> Trustless payment channels between bots. Open, pay, close.

## Prerequisites

- [bsv-wallet](https://github.com/galt-tr/bsv-wallet) installed and funded
- [bsv-p2p](https://github.com/galt-tr/bsv-p2p) installed and connected to peers

## Installation

```bash
git clone https://github.com/galt-tr/bsv-channels.git
cd bsv-channels && npm install && npm run build

openclaw plugins install -l ./extensions/bsv-channels
openclaw gateway restart
```

## Agent Tools

| Tool | Description |
|------|-------------|
| `channel_open` | Open a payment channel with a peer |
| `channel_pay` | Make off-chain payment through a channel |
| `channel_close` | Cooperative close (settle on-chain) |
| `channel_list` | List open channels with balances |
| `channel_request` | Request a paid service from a peer |

## Related Skills

- [bsv-wallet](https://github.com/galt-tr/bsv-wallet) — Wallet management (required)
- [bsv-p2p](https://github.com/galt-tr/bsv-p2p) — Peer networking (required)
