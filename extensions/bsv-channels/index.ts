/**
 * BSV Payment Channels Native OpenClaw Plugin
 *
 * Runs ChannelManager inside the gateway process as a background service.
 * Provides 5 agent tools for payment channel operations.
 */

import { ChannelManager } from '../../src/channels/manager.js'
import { Wallet } from 'bsv-wallet'
import { homedir } from 'os'
import { join } from 'path'

interface ChannelsConfig {
  walletPath?: string
  p2pAddress?: string
  maxChannelCapacity?: number
  minChannelCapacity?: number
}

export default function register(api: any) {
  let channelManager: ChannelManager | null = null
  let wallet: Wallet | null = null
  let isShuttingDown = false

  // Start service
  async function startService() {
    try {
      const cfg: ChannelsConfig = api.config.plugins?.entries?.['bsv-channels']?.config || {}
      const walletPath = cfg.walletPath || join(homedir(), '.openclaw', 'wallet')

      api.logger.info('[BSV Channels] Starting channel manager...')

      // Load wallet
      const walletConfigPath = join(walletPath, 'wallet-config.json')
      wallet = new Wallet(walletConfigPath)

      // Initialize channel manager
      channelManager = new ChannelManager({
        wallet,
        dbPath: join(walletPath, 'channels.db'),
        p2pAddress: cfg.p2pAddress,
        maxChannelCapacity: cfg.maxChannelCapacity || 100000,
        minChannelCapacity: cfg.minChannelCapacity || 1000
      } as any)

      await channelManager.start()

      api.logger.info('[BSV Channels] Channel manager started successfully')

      // Handle incoming channel events
      channelManager.on('channel:opened', (channel: any) => {
        api.logger.info(`[BSV Channels] Channel opened: ${channel.id}`)
        api.runtime.system.enqueueSystemEvent({
          message: `Channel opened with ${channel.peerId}: ${channel.capacity} sats capacity`,
          contextKey: `channel-opened-${channel.id}-${Date.now()}`
        })
      })

      channelManager.on('channel:payment', (payment: any) => {
        api.logger.debug(`[BSV Channels] Payment received: ${payment.amount} sats`)
      })

      channelManager.on('channel:closed', (channel: any) => {
        api.logger.info(`[BSV Channels] Channel closed: ${channel.id}`)
      })

    } catch (err: any) {
      api.logger.error('[BSV Channels] Failed to start:', err.message)
      throw err
    }
  }

  // Stop service
  async function stopService() {
    if (isShuttingDown) return
    isShuttingDown = true

    try {
      api.logger.info('[BSV Channels] Stopping channel manager...')
      if (channelManager) {
        await channelManager.stop()
        channelManager = null
      }
      wallet = null
      api.logger.info('[BSV Channels] Stopped')
    } catch (err: any) {
      api.logger.error('[BSV Channels] Error stopping:', err.message)
    }
  }

  // Register background service
  api.registerService({
    start: startService,
    stop: stopService,
    status: () => ({
      running: channelManager !== null && !isShuttingDown
    })
  })

  // Tool 1: channel_open - Open a payment channel
  api.registerTool({
    name: 'channel_open',
    description: 'Open a payment channel with another peer. Requires an on-chain funding transaction.',
    parameters: {
      type: 'object',
      properties: {
        peerId: {
          type: 'string',
          description: 'Peer ID to open channel with (libp2p peer ID)'
        },
        capacity: {
          type: 'number',
          description: 'Channel capacity in satoshis (minimum 1000, typical 10000-100000)'
        },
        peerPublicKey: {
          type: 'string',
          description: 'Peer BSV public key (hex) for 2-of-2 multisig'
        }
      },
      required: ['peerId', 'capacity', 'peerPublicKey']
    },
    handler: async (params: any) => {
      try {
        if (!channelManager) {
          return { error: 'Channel manager not running' }
        }

        const { peerId, capacity, peerPublicKey } = params

        api.logger.info(`[BSV Channels] Opening channel with ${peerId}: ${capacity} sats`)

        const channel = await channelManager.openChannel({
          peerId,
          capacity,
          peerPublicKey
        })

        return {
          success: true,
          channelId: channel.id,
          fundingTxid: channel.fundingTxid,
          capacity: channel.capacity,
          message: `Channel opened successfully. Funding txid: ${channel.fundingTxid}`
        }
      } catch (err: any) {
        api.logger.error('[BSV Channels] channel_open error:', err.message)
        return { error: err.message }
      }
    }
  })

  // Tool 2: channel_pay - Make a payment through a channel
  api.registerTool({
    name: 'channel_pay',
    description: 'Send a payment through an open payment channel (off-chain, instant, low fee)',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Channel ID to send payment through'
        },
        amount: {
          type: 'number',
          description: 'Payment amount in satoshis'
        },
        memo: {
          type: 'string',
          description: 'Optional payment memo/description'
        }
      },
      required: ['channelId', 'amount']
    },
    handler: async (params: any) => {
      try {
        if (!channelManager) {
          return { error: 'Channel manager not running' }
        }

        const { channelId, amount, memo } = params

        api.logger.info(`[BSV Channels] Sending ${amount} sats through channel ${channelId}`)

        const payment = await channelManager.sendPayment({
          channelId,
          amount,
          memo
        })

        return {
          success: true,
          paymentId: payment.id,
          amount: payment.amount,
          newBalance: payment.newBalance,
          message: `Payment sent successfully. New balance: ${payment.newBalance} sats`
        }
      } catch (err: any) {
        api.logger.error('[BSV Channels] channel_pay error:', err.message)
        return { error: err.message }
      }
    }
  })

  // Tool 3: channel_close - Close a payment channel
  api.registerTool({
    name: 'channel_close',
    description: 'Close a payment channel and settle final balances on-chain. Can be cooperative or force-close.',
    parameters: {
      type: 'object',
      properties: {
        channelId: {
          type: 'string',
          description: 'Channel ID to close'
        },
        force: {
          type: 'boolean',
          description: 'Force close without peer cooperation (uses latest commitment tx)',
          default: false
        }
      },
      required: ['channelId']
    },
    handler: async (params: any) => {
      try {
        if (!channelManager) {
          return { error: 'Channel manager not running' }
        }

        const { channelId, force } = params

        api.logger.info(`[BSV Channels] Closing channel ${channelId} (force: ${force || false})`)

        const result = await channelManager.closeChannel({
          channelId,
          force: force || false
        })

        return {
          success: true,
          closeTxid: result.txid,
          finalBalance: result.finalBalance,
          closeType: force ? 'force' : 'cooperative',
          message: `Channel closed. Settlement txid: ${result.txid}`
        }
      } catch (err: any) {
        api.logger.error('[BSV Channels] channel_close error:', err.message)
        return { error: err.message }
      }
    }
  })

  // Tool 4: channel_list - List all channels
  api.registerTool({
    name: 'channel_list',
    description: 'List all payment channels (active, pending, closed)',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: pending, active, closing, closed',
          enum: ['pending', 'active', 'closing', 'closed']
        }
      }
    },
    handler: async (params: any) => {
      try {
        if (!channelManager) {
          return { error: 'Channel manager not running' }
        }

        const { status } = params

        const channels = await channelManager.listChannels({ status })

        return {
          success: true,
          count: channels.length,
          channels: channels.map((ch: any) => ({
            id: ch.id,
            peerId: ch.peerId,
            status: ch.status,
            capacity: ch.capacity,
            myBalance: ch.myBalance,
            peerBalance: ch.peerBalance,
            fundingTxid: ch.fundingTxid,
            openedAt: ch.openedAt,
            closedAt: ch.closedAt
          }))
        }
      } catch (err: any) {
        api.logger.error('[BSV Channels] channel_list error:', err.message)
        return { error: err.message }
      }
    }
  })

  // Tool 5: channel_request - Request a paid service from a peer
  api.registerTool({
    name: 'channel_request',
    description: 'Request a paid service from a peer through a payment channel. Gets quote, sends payment, receives service.',
    parameters: {
      type: 'object',
      properties: {
        peerId: {
          type: 'string',
          description: 'Peer ID offering the service'
        },
        service: {
          type: 'string',
          description: 'Service name (e.g. "generate-poem", "translate-text")'
        },
        params: {
          type: 'object',
          description: 'Service-specific parameters'
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price willing to pay in satoshis'
        }
      },
      required: ['peerId', 'service']
    },
    handler: async (params: any) => {
      try {
        if (!channelManager) {
          return { error: 'Channel manager not running' }
        }

        const { peerId, service, params: serviceParams, maxPrice } = params

        api.logger.info(`[BSV Channels] Requesting service ${service} from ${peerId}`)

        const result = await channelManager.requestService({
          peerId,
          service,
          params: serviceParams,
          maxPrice
        })

        return {
          success: true,
          service,
          pricePaid: result.pricePaid,
          response: result.response,
          message: `Service completed. Paid ${result.pricePaid} sats.`
        }
      } catch (err: any) {
        api.logger.error('[BSV Channels] channel_request error:', err.message)
        return { error: err.message }
      }
    }
  })

  api.logger.info('[BSV Channels] Plugin registered with 5 tools')
}
