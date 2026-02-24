# BSV Payment Channels OpenClaw Plugin

Native OpenClaw plugin for BSV payment channels. Enables agents to open trustless micropayment channels, send off-chain payments, and request paid services from other agents.

## Features

- **Off-chain payments**: Send satoshis instantly with near-zero fees
- **Trustless**: 2-of-2 multisig, dispute resolution via latest commitment tx
- **Agent-to-agent services**: Pay peers for AI services (poems, translations, etc.)
- **Native integration**: Runs inside the gateway process, no separate daemon

## Installation

```bash
openclaw plugins install -l ./extensions/bsv-channels
```

## Configuration

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "bsv-channels": {
        "enabled": true,
        "config": {
          "walletPath": "~/.openclaw/wallet",
          "maxChannelCapacity": 100000,
          "minChannelCapacity": 1000
        }
      }
    }
  }
}
```

## Tools

### `channel_open`

Open a payment channel with another peer.

```
/channel_open peerId=12D3K... capacity=10000 peerPublicKey=02abc...
```

**Parameters:**
- `peerId` (string, required): Peer ID to open channel with
- `capacity` (number, required): Channel capacity in satoshis
- `peerPublicKey` (string, required): Peer's BSV public key for multisig

**Returns:**
```json
{
  "success": true,
  "channelId": "ch_abc123",
  "fundingTxid": "def456...",
  "capacity": 10000
}
```

### `channel_pay`

Send a payment through an open channel (off-chain, instant).

```
/channel_pay channelId=ch_abc123 amount=100 memo="Payment for service"
```

**Parameters:**
- `channelId` (string, required): Channel ID
- `amount` (number, required): Amount in satoshis
- `memo` (string, optional): Payment description

**Returns:**
```json
{
  "success": true,
  "paymentId": "pay_xyz",
  "amount": 100,
  "newBalance": 9900
}
```

### `channel_close`

Close a channel and settle final balances on-chain.

```
/channel_close channelId=ch_abc123 force=false
```

**Parameters:**
- `channelId` (string, required): Channel ID to close
- `force` (boolean, optional): Force-close without peer cooperation

**Returns:**
```json
{
  "success": true,
  "closeTxid": "abc123...",
  "finalBalance": 9900,
  "closeType": "cooperative"
}
```

### `channel_list`

List all payment channels.

```
/channel_list status=active
```

**Parameters:**
- `status` (string, optional): Filter by status (pending, active, closing, closed)

**Returns:**
```json
{
  "success": true,
  "count": 2,
  "channels": [
    {
      "id": "ch_abc123",
      "peerId": "12D3K...",
      "status": "active",
      "capacity": 10000,
      "myBalance": 9900,
      "peerBalance": 100
    }
  ]
}
```

### `channel_request`

Request a paid service from a peer.

```
/channel_request peerId=12D3K... service=generate-poem maxPrice=500
```

**Parameters:**
- `peerId` (string, required): Peer offering the service
- `service` (string, required): Service name
- `params` (object, optional): Service-specific parameters
- `maxPrice` (number, optional): Max price in satoshis

**Returns:**
```json
{
  "success": true,
  "service": "generate-poem",
  "pricePaid": 100,
  "response": "Roses are red..."
}
```

## Dependencies

- `bsv-wallet`: Wallet for funding channels
- `bsv-channels`: Channel protocol implementation

## See Also

- [bsv-wallet](../../README.md) - Wallet setup
- [bsv-p2p](../../../bsv-p2p/README.md) - P2P networking
- [Channel Architecture](../../docs/ARCHITECTURE.md)
