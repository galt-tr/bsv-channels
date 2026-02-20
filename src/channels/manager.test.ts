/**
 * Unit tests for Channel Manager and state machine
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { ChannelManager } from './manager.js'
import { Channel, ChannelState } from './types.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ChannelManager', () => {
  let manager: ChannelManager
  let privKey: PrivateKey
  let pubKey: string
  let testDbPath: string

  beforeEach(() => {
    // Create temporary database for testing
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-test-'))
    testDbPath = path.join(tmpDir, 'test-channels.db')

    privKey = PrivateKey.fromRandom()
    pubKey = privKey.toPublicKey().toString()

    manager = new ChannelManager({
      privateKey: privKey.toString(),
      publicKey: pubKey,
      dbPath: testDbPath,
      minCapacity: 1000,
      maxCapacity: 100000,
      broadcastTx: vi.fn(async (rawTx: string) => 'mock-txid-' + rawTx.substring(0, 8))
    })
  })

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
      // Also remove -shm and -wal files (SQLite WAL mode)
      const shmPath = testDbPath + '-shm'
      const walPath = testDbPath + '-wal'
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
      
      const dir = path.dirname(testDbPath)
      if (fs.existsSync(dir)) {
        fs.rmdirSync(dir)
      }
    }
  })

  describe('Initialization', () => {
    it('should initialize with correct config', () => {
      expect(manager).toBeDefined()
    })

    it('should load existing channels from database', () => {
      const manager2 = new ChannelManager({
        privateKey: privKey.toString(),
        publicKey: pubKey,
        dbPath: testDbPath
      })
      expect(manager2).toBeDefined()
    })
  })

  describe('Channel Creation', () => {
    const remotePubKey = PrivateKey.fromRandom().toPublicKey().toString()

    it('should create a new channel in pending state', async () => {
      const channel = await manager.createChannel('remote-peer-123', remotePubKey, 10000)
      
      expect(channel.id).toBeDefined()
      expect(channel.state).toBe('pending')
      expect(channel.capacity).toBe(10000)
      expect(channel.localBalance).toBe(10000)
      expect(channel.remoteBalance).toBe(0)
      expect(channel.sequenceNumber).toBe(0)
    })

    it('should reject channel below minimum capacity', async () => {
      await expect(
        manager.createChannel('remote-peer-123', remotePubKey, 500) // Below 1000 min
      ).rejects.toThrow(/capacity/i)
    })

    it('should reject channel above maximum capacity', async () => {
      await expect(
        manager.createChannel('remote-peer-123', remotePubKey, 200000) // Above 100000 max
      ).rejects.toThrow(/capacity/i)
    })

    it('should generate unique channel IDs', async () => {
      const channel1 = await manager.createChannel('peer-1', remotePubKey, 5000)
      const channel2 = await manager.createChannel('peer-2', remotePubKey, 5000)
      
      expect(channel1.id).not.toBe(channel2.id)
    })
  })

  describe('Channel State Transitions', () => {
    let channelId: string
    const remotePubKey = PrivateKey.fromRandom().toPublicKey().toString()

    beforeEach(async () => {
      const channel = await manager.createChannel('test-peer', remotePubKey, 10000)
      channelId = channel.id
    })

    it('should transition from pending to open when funded', async () => {
      manager.setFundingTx(channelId, 'funding-tx-123', 0)
      manager.openChannel(channelId)
      
      const channel = manager.getChannel(channelId)
      expect(channel?.state).toBe('open')
      expect(channel?.fundingTxId).toBe('funding-tx-123')
      expect(channel?.fundingOutputIndex).toBe(0)
    })

    it('should transition from open to closing on cooperative close', async () => {
      manager.setFundingTx(channelId, 'funding-tx-123', 0)
      manager.openChannel(channelId)
      await manager.closeChannel(channelId)
      
      const channel = manager.getChannel(channelId)
      expect(channel?.state).toBe('closing')
    })

    it('should reject invalid state transitions', async () => {
      // Try to open a pending channel twice
      manager.openChannel(channelId)
      expect(() => manager.openChannel(channelId)).toThrow(/state/i)
    })
  })

  describe('Payment Processing', () => {
    let channelId: string
    const remotePubKey = PrivateKey.fromRandom().toPublicKey().toString()

    beforeEach(async () => {
      const channel = await manager.createChannel('test-peer', remotePubKey, 10000)
      channelId = channel.id
      manager.setFundingTx(channelId, 'funding-tx-123', 0)
      manager.openChannel(channelId)
    })

    it('should create outgoing payment with correct balances', async () => {
      const payment = await manager.createPayment(channelId, 1000)
      
      expect(payment.amount).toBe(1000)
      expect(payment.newSequenceNumber).toBe(1)
      expect(payment.newLocalBalance).toBe(9000)
      expect(payment.newRemoteBalance).toBe(1000)
      expect(payment.signature).toBeDefined()
      
      const channel = manager.getChannel(channelId)
      expect(channel?.localBalance).toBe(9000)
      expect(channel?.remoteBalance).toBe(1000)
      expect(channel?.sequenceNumber).toBe(1)
    })

    it('should process incoming payment and update balances', async () => {
      // Simulate receiving a payment from remote peer
      const incomingPayment = {
        channelId,
        amount: 500,
        newSequenceNumber: 1,
        newLocalBalance: 9500,  // Remote's perspective
        newRemoteBalance: 500,   // Our perspective
        signature: 'mock-signature',
        timestamp: Date.now()
      }
      
      await manager.processPayment(incomingPayment)
      
      const channel = manager.getChannel(channelId)
      expect(channel?.localBalance).toBe(500)  // Swapped from remote perspective
      expect(channel?.remoteBalance).toBe(9500)
      expect(channel?.sequenceNumber).toBe(1)
    })

    it('should reject payment exceeding local balance', async () => {
      await expect(
        manager.createPayment(channelId, 15000) // More than 10000 available
      ).rejects.toThrow(/insufficient/i)
    })

    it('should enforce sequence number ordering', async () => {
      await manager.createPayment(channelId, 1000) // seq=1
      
      // Try to process payment with old sequence number
      const stalePayment = {
        channelId,
        amount: 500,
        newSequenceNumber: 0, // Old sequence!
        newLocalBalance: 9500,
        newRemoteBalance: 500,
        signature: 'mock-sig',
        timestamp: Date.now()
      }
      
      await expect(
        manager.processPayment(stalePayment)
      ).rejects.toThrow(/sequence/i)
    })

    it('should increment sequence number on each payment', async () => {
      await manager.createPayment(channelId, 100)
      expect(manager.getChannel(channelId)?.sequenceNumber).toBe(1)
      
      await manager.createPayment(channelId, 200)
      expect(manager.getChannel(channelId)?.sequenceNumber).toBe(2)
      
      await manager.createPayment(channelId, 300)
      expect(manager.getChannel(channelId)?.sequenceNumber).toBe(3)
    })

    it('should only allow payments on open channels', async () => {
      await manager.closeChannel(channelId)
      
      await expect(
        manager.createPayment(channelId, 100)
      ).rejects.toThrow(/state/i)
    })

    it('should reject payments where balances do not sum to capacity', async () => {
      const badPayment = {
        channelId,
        amount: 1000,
        newSequenceNumber: 1,
        newLocalBalance: 5000,
        newRemoteBalance: 6000, // 5000 + 6000 = 11000 > 10000 capacity!
        signature: 'mock-sig',
        timestamp: Date.now()
      }
      
      await expect(
        manager.processPayment(badPayment)
      ).rejects.toThrow(/capacity/i)
    })
  })

  describe('Persistence', () => {
    const remotePubKey = PrivateKey.fromRandom().toPublicKey().toString()

    it('should persist channels to database', async () => {
      const channel = await manager.createChannel('test-peer', remotePubKey, 10000)
      manager.setFundingTx(channel.id, 'funding-tx', 0)
      manager.openChannel(channel.id)
      
      // Create new manager instance with same DB
      const manager2 = new ChannelManager({
        privateKey: privKey.toString(),
        publicKey: pubKey,
        dbPath: testDbPath
      })
      
      const loadedChannel = manager2.getChannel(channel.id)
      expect(loadedChannel).toBeDefined()
      expect(loadedChannel?.id).toBe(channel.id)
      expect(loadedChannel?.capacity).toBe(10000)
      expect(loadedChannel?.state).toBe('open')
    })

    it('should persist payment records', async () => {
      const channel = await manager.createChannel('test-peer', remotePubKey, 10000)
      manager.setFundingTx(channel.id, 'funding-tx', 0)
      manager.openChannel(channel.id)
      
      await manager.createPayment(channel.id, 1000)
      await manager.createPayment(channel.id, 500)
      
      const payments = manager.getPaymentHistory(channel.id)
      expect(payments.length).toBeGreaterThanOrEqual(2)
      
      const sentPayments = payments.filter(p => p.direction === 'sent')
      expect(sentPayments[0].amount).toBe(1000)
      expect(sentPayments[1].amount).toBe(500)
    })
  })
})
