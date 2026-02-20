# bsv-channels

**Trustless micropayment channels between AI agents using Bitcoin SV.** Lock funds in a 2-of-2 multisig, exchange unlimited off-chain payments (instant, free), settle final balances on-chain. Built for bot-to-bot commerce at scale.

> *Neither party can steal. Both must cooperate.* — The channel solves the "who goes first?" problem.

---

## Table of Contents

1. [Part of the BSV Agent Toolkit](#part-of-the-bsv-agent-toolkit)
2. [What Are Payment Channels?](#what-are-payment-channels)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Opening Your First Channel](#opening-your-first-channel)
7. [Making Payments](#making-payments)
8. [Closing Channels](#closing-channels)
9. [Direct Payments (BRC-105 Fallback)](#direct-payments-brc-105-fallback)
10. [OpenClaw Plugin Setup](#openclaw-plugin-setup)
11. [Agent Tool Reference](#agent-tool-reference)
12. [Architecture](#architecture)
13. [Troubleshooting](#troubleshooting)
14. [Security Considerations](#security-considerations)

---

## Part of the BSV Agent Toolkit

| Package | Purpose | When to Use |
|---------|---------|-------------|
| [bsv-wallet](https://github.com/galt-tr/bsv-wallet) | Money layer — balance, send, receive | Simple one-off payments |
| [bsv-p2p](https://github.com/galt-tr/bsv-p2p) | Network layer — discover peers, messaging | Finding and talking to other bots |
| **bsv-channels** (this) | Payment layer — trustless micropayments | High-frequency payments (streaming, pay-per-call) |

**The stack:**
1. **Connect** with `bsv-p2p` (discover who offers what)
2. **Fund** with `bsv-wallet` (get satoshis to spend)
3. **Pay** with `bsv-channels` (open channels, stream micropayments)

Use `bsv-channels` when you need to make **many small payments** to the same peer. For a single payment, just use `bsv-wallet send`.

---

## What Are Payment Channels?

Payment channels solve the **scalability** and **cost** problem of on-chain payments.

### The Problem

**On-chain payments are expensive:**
- Every payment = 1 blockchain transaction
- Transaction fees = ~50-200 sats per tx
- Block confirmation time = ~10 minutes

**Example:** Pay 10 sats for each API call, 1000 calls/day  
**Cost:** 1000 tx × 100 sats/tx = 100,000 sats in fees alone!

### The Solution: Payment Channels

**Open once, pay unlimited times, close once:**

```
┌────────────────────────────────────────┐
│  On-chain: Funding Transaction         │  ← 1 blockchain tx
│  Lock 10,000 sats in 2-of-2 multisig   │
└────────────────────────────────────────┘
            ▼
┌────────────────────────────────────────┐
│  Off-chain: Commitment Updates         │  ← Instant, free
│  Payment 1: Alice 9,990 | Bob    10    │
│  Payment 2: Alice 9,980 | Bob    20    │
│  Payment 3: Alice 9,970 | Bob    30    │
│  ...                                    │
│  Payment N: Alice 9,000 | Bob 1,000    │
└────────────────────────────────────────┘
            ▼
┌────────────────────────────────────────┐
│  On-chain: Settlement Transaction      │  ← 1 blockchain tx
│  Alice gets 9,000 sats                 │
│  Bob gets 1,000 sats                   │
└────────────────────────────────────────┘
```

**Total on-chain transactions: 2**  
**Total off-chain payments: Unlimited**

### How It Works

1. **Funding:** Both parties lock funds in a 2-of-2 multisig address
2. **Payments:** Each payment updates a commitment transaction:
   - "Alice gets X sats, Bob gets Y sats"
   - Both parties sign the new state
   - Old state is invalidated
3. **Settlement:** When done, broadcast the latest commitment to the blockchain
4. **Safety:** Neither party can cheat — the 2-of-2 multisig requires both signatures

---

## Prerequisites

**You must have both dependencies installed and configured:**

### 1. bsv-wallet

```bash
npm install bsv-wallet
bsv-wallet init
```

**Why:** Channels need BSV to fund the multisig. The wallet manages your satoshis.

**Verify:**
```bash
bsv-wallet balance
```

You should have at least 10,000 sats (+ fees).

### 2. bsv-p2p

```bash
npm install bsv-p2p
# Follow bsv-p2p setup guide to connect to relay
```

**Why:** Channel negotiation happens over P2P. You need to be connected to peers to open channels with them.

**Verify:**
```bash
# Plugin mode (in OpenClaw):
"What's my P2P status?"

# Daemon mode:
curl http://localhost:4002/status
```

You should see `"relayConnected": true` and at least 1 peer.

---

## Installation

```bash
# Install as a library
npm install bsv-channels
```

**For OpenClaw users:**

```bash
# Clone and install as plugin
git clone https://github.com/galt-tr/bsv-channels.git
cd bsv-channels && npm install && npm run build
openclaw plugins install -l ./extensions/bsv-channels
openclaw gateway restart
```

---

## Configuration

`bsv-channels` is a library, not a daemon. Configuration happens when you create a `ChannelManager` instance.

### Library Usage (TypeScript/JavaScript)

```typescript
import { ChannelManager } from 'bsv-channels'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Load wallet config
const walletConfig = JSON.parse(
  readFileSync(join(homedir(), '.bsv-wallet', 'config.json'), 'utf-8')
)

// Create channel manager
const channelManager = new ChannelManager({
  privateKey: walletConfig.privateKey,
  publicKey: walletConfig.publicKey,
  dbPath: join(homedir(), '.bsv-channels', 'channels.db'),
  
  // Optional config
  defaultLifetimeMs: 3600000,  // 1 hour
  minCapacity: 1000,            // Min 1,000 sats
  maxCapacity: 100_000_000,     // Max 1 BSV
  feeRate: 1,                   // 1 sat/byte
  
  // Broadcast function (uses wallet's blockchain service)
  broadcastTx: async (rawTx) => {
    // Your broadcast implementation
    // e.g., POST to WhatsOnChain API
    return txid
  }
})
```

### OpenClaw Plugin Config

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "bsv-channels": {
        "enabled": true,
        "config": {
          "defaultLifetimeMs": 3600000,
          "minCapacity": 1000,
          "maxCapacity": 100000000,
          "feeRate": 1
        }
      }
    }
  }
}
```

**Config options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultLifetimeMs` | number | `3600000` (1 hour) | Default channel lifetime |
| `minCapacity` | number | `1000` | Minimum channel capacity (sats) |
| `maxCapacity` | number | `100000000` | Maximum channel capacity (sats) |
| `feeRate` | number | `1` | Transaction fee rate (sats/byte) |

---

## Opening Your First Channel

### Prerequisites Check

Before opening a channel, verify:

1. **Wallet funded:**
   ```bash
   bsv-wallet balance
   ```
   You need at least 10,000 sats + fees (~500 sats).

2. **Peer connected:**
   ```bash
   # Find peers offering a service
   curl "http://localhost:4002/discover?service=code-review"
   ```
   Note the peer ID (starts with `12D3KooW...`).

3. **Peer's BSV public key:**
   
   The peer must advertise their BSV public key. This happens automatically via P2P service announcements.

### Step 1: Request Channel Open

**Library usage:**
```typescript
const channel = await channelManager.createChannel({
  peerId: '12D3KooWABC123...',              // Remote peer ID
  remotePubKey: '02abc123def456...',        // Their BSV public key
  amount: 10000,                             // Fund with 10,000 sats
  lifetimeMs: 3600000                        // 1 hour channel
})

console.log('Channel created:', channel.id)
console.log('Funding TXID:', channel.fundingTxId)
```

**OpenClaw agent:**
```
Open payment channel with peer 12D3KooWABC123... funding 10000 sats
```

**Expected response:**
```json
{
  "channelId": "ch_abc123",
  "state": "pending",
  "localBalance": 10000,
  "remoteBalance": 0,
  "fundingTxId": "1a2b3c4d5e6f...",
  "fundingOutputIndex": 0
}
```

### Step 2: Wait for Peer Acceptance

The remote peer must explicitly accept your channel request. If they have auto-accept enabled (for amounts below their threshold), this happens automatically.

**Check status:**
```typescript
const channel = channelManager.getChannel('ch_abc123')
console.log('State:', channel.state)
```

**While pending:**
```json
{
  "channelId": "ch_abc123",
  "state": "pending",
  "localBalance": 10000,
  "remoteBalance": 0
}
```

### Step 3: Funding Confirmation

Once the peer accepts, the funding transaction is broadcast to the blockchain.

**After 1 confirmation:**
```json
{
  "channelId": "ch_abc123",
  "state": "open",
  "localBalance": 10000,
  "remoteBalance": 0,
  "fundingTxId": "1a2b3c4d5e6f...",
  "confirmations": 1
}
```

**View funding transaction:**
```bash
https://whatsonchain.com/tx/1a2b3c4d5e6f...
```

**Expected:** 1 output with 2-of-2 multisig script, amount = 10,000 sats.

✅ **Channel open!** You can now make off-chain payments.

---

## Making Payments

Payments are **off-chain state updates**. No blockchain transaction until you close the channel.

### Send a Payment

**Library usage:**
```typescript
await channelManager.sendPayment('ch_abc123', 100)

console.log('New balance:', channelManager.getChannel('ch_abc123').localBalance)
// Output: New balance: 9900
```

**OpenClaw agent:**
```
Send 100 sats to peer via channel ch_abc123
```

**Expected response:**
```json
{
  "success": true,
  "channelId": "ch_abc123",
  "newLocalBalance": 9900,
  "newRemoteBalance": 100,
  "sequenceNumber": 1
}
```

**What happens:**
1. New commitment transaction created: "Alice 9,900 | Bob 100"
2. Both parties sign the new state
3. Old state (0/10000) is invalidated
4. Sequence number increments (prevents replay attacks)

### Make Multiple Payments

```typescript
// Payment 1: 100 sats
await channelManager.sendPayment('ch_abc123', 100)
// Balance: 9,900 | 100

// Payment 2: 50 sats
await channelManager.sendPayment('ch_abc123', 50)
// Balance: 9,850 | 150

// Payment 3: 200 sats
await channelManager.sendPayment('ch_abc123', 200)
// Balance: 9,650 | 350
```

**Key points:**
- Each payment updates the channel balance instantly
- No blockchain transactions (all off-chain)
- No fees
- Sequence number tracks the order

### Request a Paid Service

Combine discovery + payment + service delivery:

```typescript
const result = await channelManager.requestService({
  peerId: '12D3KooWABC123...',
  service: 'code-review',
  params: {
    repository: 'github.com/user/repo',
    branch: 'main'
  }
})

console.log('Service result:', result)
console.log('Paid:', result.paidSats, 'sats')
```

**Flow:**
1. **Quote:** Peer responds with price (e.g., 500 sats)
2. **Payment:** 500 sats sent via channel
3. **Service:** Peer delivers code review
4. **Response:** You receive the review results

---

## Closing Channels

Closing settles the final balances on-chain. There are two ways:

### Cooperative Close (Recommended)

Both parties agree on final balances and broadcast a settlement transaction.

**Library usage:**
```typescript
const closeTx = await channelManager.closeChannel('ch_abc123')

console.log('Close TXID:', closeTx.txid)
console.log('Final balances:')
console.log('  Local:', closeTx.localBalance)
console.log('  Remote:', closeTx.remoteBalance)
```

**OpenClaw agent:**
```
Close payment channel ch_abc123
```

**Expected response:**
```json
{
  "status": "closing",
  "closeTxId": "9z8y7x6w5v4u...",
  "finalBalances": {
    "local": 9650,
    "remote": 350
  }
}
```

**Settlement transaction:**
```bash
https://whatsonchain.com/tx/9z8y7x6w5v4u...
```

**Expected:** Transaction with 2 outputs:
- Output 0: 9,650 sats to your address
- Output 1: 350 sats to peer's address

**After 1 confirmation:**

Your wallet balance increases by 9,650 sats (minus ~50 sat fee).

---

### Force Close (Unilateral)

If the peer is unresponsive, you can force-close by broadcasting the latest commitment transaction.

⚠️ **Warning:** Force close has a timelock delay. Your funds are locked until the `nLockTime` expires.

**Library usage:**
```typescript
const forceCloseTx = await channelManager.forceCloseChannel('ch_abc123')

console.log('Force close TXID:', forceCloseTx.txid)
console.log('Funds available after:', new Date(forceCloseTx.nLockTime))
```

**OpenClaw agent:**
```
Force close payment channel ch_abc123
```

**Expected response:**
```json
{
  "status": "force_closing",
  "commitmentTxId": "8w7v6u5t4r3q...",
  "nLockTime": "2026-02-20T18:00:00Z",
  "message": "Funds will be available after nLockTime expires"
}
```

**Timelock period:** Default is 1 hour from last channel activity.

**Why the delay?**
- Gives the other party time to dispute if you broadcast an old state
- Prevents cheating (broadcasting an earlier commitment where you had more balance)

**When to use force close:**
- Peer is offline for extended period
- Peer refuses to cooperate
- Emergency: need to recover funds immediately (willing to wait for timelock)

---

## Direct Payments (BRC-105 Fallback)

For peers **without open channels**, `bsv-channels` provides a direct payment protocol.

### When to Use

- **First interaction** with a peer (no channel yet)
- **Small one-off payments** (not worth opening a channel)
- **Peer doesn't support channels** (direct payments are mandatory)

### How It Works

**Flow:**
1. **REQUEST** — "I want this service"
2. **QUOTE** — "It costs X sats, pay to this address"
3. **ACCEPT** — "OK, I'll pay"
4. **PAYMENT** — Send BEEF transaction with proof
5. **RESPONSE** — Service delivered after payment verified

### Example: Request a Paid Service

**Library usage:**
```typescript
import { DirectPaymentHandler } from 'bsv-channels'

const directPayment = new DirectPaymentHandler({
  bsvIdentityKey: walletConfig.privateKey,
  quoteValidityMs: 300000  // 5 minutes
})

// Request service
const result = await directPayment.requestService({
  peerId: '12D3KooWABC123...',
  service: 'image-analysis',
  params: {
    imageUrl: 'https://example.com/image.png'
  }
})

console.log('Result:', result)
console.log('Paid:', result.paidSats, 'sats')
console.log('TXID:', result.txid)
```

**OpenClaw agent:**
```
Request image-analysis from peer 12D3KooWABC123... for image at https://example.com/image.png
```

**Expected response:**
```json
{
  "success": true,
  "result": {
    "objects": ["cat", "table", "window"],
    "text": "No text detected",
    "faces": 1
  },
  "paidSats": 50,
  "txid": "a1b2c3d4e5f6..."
}
```

### BEEF Transactions

Direct payments use **BEEF** (Background Evaluation Extended Format) for SPV:

- **Atomic:** Payment and proof in one message
- **SPV-validated:** Merkle proof included
- **Efficient:** Compact binary format

**No need to wait for confirmations** — the BEEF proof allows instant validation.

---

## OpenClaw Plugin Setup

The `bsv-channels` plugin gives agents native channel management tools.

### Installation

```bash
cd ~/projects/bsv-channels
openclaw plugins install -l ./extensions/bsv-channels
openclaw gateway restart
```

### Configuration

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "bsv-wallet": {
        "enabled": true
      },
      "bsv-p2p": {
        "enabled": true
      },
      "bsv-channels": {
        "enabled": true,
        "config": {
          "defaultLifetimeMs": 3600000,
          "minCapacity": 1000,
          "maxCapacity": 100000000
        }
      }
    }
  }
}
```

**Dependencies:** Both `bsv-wallet` and `bsv-p2p` plugins must be enabled.

### Verify Plugin Loaded

In your OpenClaw agent chat:

```
List all payment channels
```

If you see an error like "channel_list tool not found", the plugin isn't loaded. Check:

1. Plugin is listed: `openclaw plugins list | grep bsv-channels`
2. Config has all three plugins enabled
3. Gateway was restarted after plugin install
4. Logs: `openclaw gateway logs | grep channels`

---

## Agent Tool Reference

When the OpenClaw plugin is active, agents have access to these tools:

### `channel_open`

**Description:** Open a payment channel with a peer.

**Parameters:**
- `peerId` (string, required) — Target peer ID
- `amount` (number, required) — Funding amount in satoshis
- `lifetimeMs` (number, optional) — Channel lifetime (default: 1 hour)

**Returns:**
```json
{
  "channelId": "ch_abc123",
  "state": "pending",
  "localBalance": 10000,
  "remoteBalance": 0,
  "fundingTxId": "1a2b3c4d..."
}
```

**Example usage:**
```
Open payment channel with peer 12D3KooWABC123... funding 10000 sats
```

---

### `channel_pay`

**Description:** Make an off-chain payment through a channel.

**Parameters:**
- `channelId` (string, required) — Channel ID
- `amount` (number, required) — Payment amount in satoshis

**Returns:**
```json
{
  "success": true,
  "channelId": "ch_abc123",
  "newLocalBalance": 9900,
  "newRemoteBalance": 100,
  "sequenceNumber": 1
}
```

**Example usage:**
```
Send 100 sats via channel ch_abc123
```

---

### `channel_close`

**Description:** Cooperatively close a payment channel.

**Parameters:**
- `channelId` (string, required) — Channel ID

**Returns:**
```json
{
  "status": "closing",
  "closeTxId": "9z8y7x6w...",
  "finalBalances": {
    "local": 9900,
    "remote": 100
  }
}
```

**Example usage:**
```
Close payment channel ch_abc123
```

---

### `channel_list`

**Description:** List all open payment channels with balances.

**Parameters:** None

**Returns:**
```json
{
  "channels": [
    {
      "channelId": "ch_abc123",
      "peerId": "12D3KooWABC123...",
      "state": "open",
      "localBalance": 9900,
      "remoteBalance": 100,
      "sequenceNumber": 1,
      "fundingTxId": "1a2b3c4d..."
    },
    {
      "channelId": "ch_def456",
      "peerId": "12D3KooWDEF456...",
      "state": "open",
      "localBalance": 5000,
      "remoteBalance": 5000,
      "sequenceNumber": 42
    }
  ],
  "total": 2
}
```

**Example usage:**
```
List all my payment channels
Show me my open channels
```

---

### `channel_request`

**Description:** Request a paid service from a peer (auto-discovers channel or uses direct payment).

**Parameters:**
- `peerId` (string, required) — Target peer ID
- `service` (string, required) — Service name (e.g., "code-review", "image-analysis")
- `params` (object, required) — Service-specific parameters

**Returns:**
```json
{
  "success": true,
  "result": { /* service-specific result */ },
  "paidSats": 100,
  "method": "channel"  // or "direct"
}
```

**Example usage:**
```
Request code-review from peer 12D3KooWABC123... for repository github.com/user/repo
Request image-analysis from peer 12D3KooWDEF456... for image at https://example.com/img.png
```

---

## Architecture

### Payment Channel Lifecycle

```
┌──────────────┐
│   PENDING    │ ← Channel created, waiting for peer acceptance
└──────┬───────┘
       │ Peer accepts
       ▼
┌──────────────┐
│     OPEN     │ ← Funding tx confirmed, ready for payments
└──────┬───────┘
       │ Payments flow (off-chain updates)
       │
       ├─── Cooperative close ───┐
       │                          ▼
       │                   ┌──────────────┐
       │                   │   CLOSING    │
       │                   └──────┬───────┘
       │                          │ Settlement tx confirms
       │                          ▼
       │                   ┌──────────────┐
       │                   │    CLOSED    │
       │                   └──────────────┘
       │
       └─── Force close ─────┐
                             ▼
                      ┌──────────────┐
                      │   DISPUTED   │ ← nLockTime countdown
                      └──────┬───────┘
                             │ Timelock expires
                             ▼
                      ┌──────────────┐
                      │    CLOSED    │
                      └──────────────┘
```

### 2-of-2 Multisig

**Funding transaction:**
```
Input:  Your wallet UTXO (10,000 sats)
Output: 2-of-2 multisig (requires both signatures to spend)
        Script: OP_2 <YourPubKey> <TheirPubKey> OP_2 OP_CHECKMULTISIG
```

**Commitment transaction (off-chain):**
```
Input:  Funding UTXO (references the multisig)
Outputs:
  - Your balance (signed by you)
  - Their balance (signed by them)
Sequence: nSequenceNumber (increments with each payment)
```

**Settlement transaction (on-chain):**
```
Input:  Funding UTXO (with both signatures)
Outputs:
  - Final balance to your address
  - Final balance to their address
```

### nSequence Ordering

Each payment increments the `nSequence` field:

- Payment 1: nSequence = 1
- Payment 2: nSequence = 2
- Payment 3: nSequence = 3

**Why:** Prevents replay attacks. If Alice tries to broadcast an old state (where she had more balance), Bob can prove there's a newer state with a higher nSequence.

### Dispute Resolution

If one party broadcasts an old commitment:

1. **Timelock:** The old commitment has an `nLockTime` (e.g., 1 hour from now)
2. **Dispute window:** The other party has until `nLockTime` to submit proof of a newer state
3. **Penalty:** If cheating is proven, the cheater loses their entire balance

**Implementation:** `DisputeMonitor` watches the blockchain for channel-related transactions and auto-disputes if an old state is broadcast.

---

## Troubleshooting

### Problem: "Channel creation failed: insufficient balance"

**Cause:** Your wallet doesn't have enough satoshis to fund the channel.

**Fix:**
1. Check balance: `bsv-wallet balance`
2. Fund wallet: Send BSV from a faucet or exchange
3. Sync: `bsv-wallet sync`
4. Try again with a smaller amount

---

### Problem: "Channel stuck in pending"

**Symptoms:** Channel state is "pending" for more than 5 minutes.

**Causes:**
1. Peer rejected the request (too much/too little capacity)
2. Peer is offline
3. Network partition

**Fix:**
1. Check peer is online:
   ```bash
   curl "http://localhost:4002/discover?peerId=TARGET_PEER_ID"
   ```
2. Check channel details:
   ```typescript
   const channel = channelManager.getChannel('ch_abc123')
   console.log('State:', channel.state)
   console.log('Remote peer:', channel.remotePeerId)
   ```
3. If peer is offline, cancel and retry later:
   ```typescript
   await channelManager.cancelChannel('ch_abc123')
   ```

---

### Problem: "Payment failed: insufficient channel balance"

**Cause:** You're trying to send more satoshis than your current balance in the channel.

**Fix:**
1. Check channel balance:
   ```typescript
   const channel = channelManager.getChannel('ch_abc123')
   console.log('Your balance:', channel.localBalance)
   ```
2. Either:
   - Send a smaller amount
   - Receive payments first (increase your balance)
   - Close and reopen with more funds

---

### Problem: "Close failed: peer unresponsive"

**Cause:** Cooperative close requires both parties. If peer is offline, it fails.

**Fix:**

Use force close instead:
```typescript
await channelManager.forceCloseChannel('ch_abc123')
```

⚠️ Your funds will be locked until the nLockTime expires (default: 1 hour).

---

### Problem: "Direct payment: BEEF validation failed"

**Cause:** The BEEF transaction proof is invalid (bad merkle proof, tx not confirmed, etc.).

**Fix:**
1. Wait for transaction confirmation (at least 1 block)
2. Retry with a fresh BEEF proof
3. Check blockchain explorer to verify the tx exists:
   ```bash
   https://whatsonchain.com/tx/YOUR_TXID
   ```

---

## Security Considerations

### Private Key Protection

**Your channel private key = your wallet private key.**

- ⚠️ If compromised, an attacker can spend all your funds in open channels
- ✅ Store keys securely (encrypted, OS keychain, hardware wallet)
- ✅ Never commit keys to git
- ✅ Use separate keys for testing vs. production

### Channel Lifetime

**Short lifetimes = better security:**

- Default: 1 hour
- For high-value channels: Use shorter lifetimes (15-30 minutes)
- For long-running services: Refresh channels regularly

**Why:** Limits exposure if a key is compromised during an active channel.

### Dispute Monitoring

**Always run a dispute monitor:**

```typescript
import { DisputeMonitor } from 'bsv-channels'

const monitor = new DisputeMonitor({
  channels: channelManager,
  checkIntervalMs: 60000  // Check every minute
})

monitor.on('dispute_detected', async (channel) => {
  console.warn('Dispute detected for channel:', channel.id)
  // Automatically submits proof of latest state
})
```

**What it does:**
- Watches blockchain for channel-related transactions
- Detects if a peer broadcasts an old commitment
- Auto-disputes by submitting proof of newer state

### Force Close Risks

**Downsides:**
- Funds locked for timelock period
- Peer might dispute (if you broadcast an old state)
- Higher fees (commitment tx is larger than settlement tx)

**When to use:**
- Peer is offline for extended period
- Emergency recovery
- Peer is malicious (refusing to cooperate)

**Mitigation:**
- Always use cooperative close first
- Keep channels short-lived
- Monitor for disputes

### Direct Payment SPV

**BEEF transactions must be validated:**

1. Merkle proof is correct
2. Transaction is confirmed (at least 1 block)
3. Output goes to the correct address
4. Amount matches the quote

**Never trust BEEF without validation.** The `DirectPaymentHandler` does this automatically.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Areas needing help:**
- HTLC (Hashed Timelock Contracts) for atomic swaps
- Watchtowers (delegated dispute monitoring)
- Multi-hop routing (Lightning-style)
- Cross-chain channels (BSV ↔ BTC, BSV ↔ ETH)

---

## License

MIT — See [LICENSE](LICENSE) for details.

---

## Links

- **GitHub:** [github.com/galt-tr/bsv-channels](https://github.com/galt-tr/bsv-channels)
- **Wallet:** [github.com/galt-tr/bsv-wallet](https://github.com/galt-tr/bsv-wallet)
- **P2P:** [github.com/galt-tr/bsv-p2p](https://github.com/galt-tr/bsv-p2p)
- **OpenClaw:** [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
- **Discord:** [discord.com/invite/clawd](https://discord.com/invite/clawd)

---

**Build the bot economy.** 🤖💰
