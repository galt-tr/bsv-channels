/**
 * Integration tests for full channel lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { ChannelManager } from './manager.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Channel Lifecycle Integration', () => {
  let aliceManager: ChannelManager
  let bobManager: ChannelManager
  let alicePrivKey: PrivateKey
  let bobPrivKey: PrivateKey
  let aliceDbPath: string
  let bobDbPath: string

  beforeEach(() => {
    // Create two peers: Alice and Bob
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-integration-'))
    aliceDbPath = path.join(tmpDir, 'alice.db')
    bobDbPath = path.join(tmpDir, 'bob.db')

    alicePrivKey = PrivateKey.fromRandom()
    bobPrivKey = PrivateKey.fromRandom()

    const mockBroadcast = vi.fn(async (rawTx: string) => {
      return 'mock-txid-' + Math.random().toString(36).substring(7)
    })

    aliceManager = new ChannelManager({
      privateKey: alicePrivKey.toString(),
      publicKey: alicePrivKey.toPublicKey().toString(),
      dbPath: aliceDbPath,
      broadcastTx: mockBroadcast
    })

    bobManager = new ChannelManager({
      privateKey: bobPrivKey.toString(),
      publicKey: bobPrivKey.toPublicKey().toString(),
      dbPath: bobDbPath,
      broadcastTx: mockBroadcast
    })
  })

  afterEach(() => {
    // Cleanup test databases
    for (const dbPath of [aliceDbPath, bobDbPath]) {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
        // Also remove -shm and -wal files (SQLite WAL mode)
        const shmPath = dbPath + '-shm'
        const walPath = dbPath + '-wal'
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
      }
    }
    // Clean up temp directory
    const tmpDir = path.dirname(aliceDbPath)
    if (fs.existsSync(tmpDir)) {
      fs.rmdirSync(tmpDir)
    }
  })

  it('should complete full cooperative channel lifecycle', async () => {
    // 1. Alice initiates channel with Bob
    const aliceChannel = await aliceManager.createChannel(
      'bob-peer-id',
      bobPrivKey.toPublicKey().toString(),
      20000
    )
    expect(aliceChannel.state).toBe('pending')

    // 2. Bob accepts channel (responder side)
    const bobChannel = await bobManager.acceptChannel(
      aliceChannel.id,
      'bob-peer-id',
      'alice-peer-id',
      alicePrivKey.toPublicKey().toString(),
      20000,
      aliceChannel.nLockTime
    )
    expect(bobChannel.state).toBe('pending')
    expect(bobChannel.id).toBe(aliceChannel.id)

    // 3. Both mark channel as funded and open
    aliceManager.setFundingTx(aliceChannel.id, 'funding-tx-123', 0)
    aliceManager.openChannel(aliceChannel.id)
    bobManager.setFundingTx(bobChannel.id, 'funding-tx-123', 0)
    bobManager.openChannel(bobChannel.id)

    expect(aliceManager.getChannel(aliceChannel.id)?.state).toBe('open')
    expect(bobManager.getChannel(bobChannel.id)?.state).toBe('open')

    // 4. Alice sends payment to Bob
    const payment1 = await aliceManager.createPayment(aliceChannel.id, 5000)
    await bobManager.processPayment(payment1)

    let aliceChan = aliceManager.getChannel(aliceChannel.id)!
    let bobChan = bobManager.getChannel(bobChannel.id)!
    
    expect(aliceChan.localBalance).toBe(15000)
    expect(aliceChan.remoteBalance).toBe(5000)
    expect(aliceChan.sequenceNumber).toBe(1)
    expect(bobChan.localBalance).toBe(5000) // Swapped from Alice's perspective
    expect(bobChan.remoteBalance).toBe(15000)

    // 5. Bob sends payment back to Alice
    const payment2 = await bobManager.createPayment(bobChannel.id, 2000)
    await aliceManager.processPayment(payment2)

    aliceChan = aliceManager.getChannel(aliceChannel.id)!
    bobChan = bobManager.getChannel(bobChannel.id)!
    
    expect(bobChan.localBalance).toBe(3000)
    expect(bobChan.remoteBalance).toBe(17000)
    expect(aliceChan.localBalance).toBe(17000)
    expect(aliceChan.remoteBalance).toBe(3000)
    expect(bobChan.sequenceNumber).toBe(2)

    // 6. Cooperative close
    await aliceManager.closeChannel(aliceChannel.id)
    await bobManager.closeChannel(bobChannel.id)

    expect(aliceManager.getChannel(aliceChannel.id)?.state).toBe('closing')
    expect(bobManager.getChannel(bobChannel.id)?.state).toBe('closing')
  })

  it('should handle insufficient funds correctly', async () => {
    const aliceChannel = await aliceManager.createChannel(
      'bob-peer-id',
      bobPrivKey.toPublicKey().toString(),
      5000 // Small channel
    )
    aliceManager.setFundingTx(aliceChannel.id, 'funding-tx', 0)
    aliceManager.openChannel(aliceChannel.id)

    // Try to send more than available
    await expect(
      aliceManager.createPayment(aliceChannel.id, 6000)
    ).rejects.toThrow(/insufficient/i)

    // Channel should still be open and unchanged
    const chan = aliceManager.getChannel(aliceChannel.id)!
    expect(chan.state).toBe('open')
    expect(chan.localBalance).toBe(5000)
    expect(chan.sequenceNumber).toBe(0)
  })

  it('should handle stale state correctly', async () => {
    const aliceChannel = await aliceManager.createChannel(
      'bob-peer-id',
      bobPrivKey.toPublicKey().toString(),
      10000
    )
    const bobChannel = await bobManager.acceptChannel(
      aliceChannel.id,
      'bob-peer-id',
      'alice-peer-id',
      alicePrivKey.toPublicKey().toString(),
      10000,
      aliceChannel.nLockTime
    )

    aliceManager.setFundingTx(aliceChannel.id, 'funding-tx', 0)
    aliceManager.openChannel(aliceChannel.id)
    bobManager.setFundingTx(bobChannel.id, 'funding-tx', 0)
    bobManager.openChannel(bobChannel.id)

    // Alice sends payment (seq=1)
    const payment1 = await aliceManager.createPayment(aliceChannel.id, 2000)
    await bobManager.processPayment(payment1)

    // Alice sends another payment (seq=2)
    const payment2 = await aliceManager.createPayment(aliceChannel.id, 1000)
    await bobManager.processPayment(payment2)

    // Bob tries to process a stale payment (seq=1)
    const stalePayment = { ...payment1 }
    await expect(
      bobManager.processPayment(stalePayment)
    ).rejects.toThrow(/sequence/i)
  })

  it('should track payment history', async () => {
    const aliceChannel = await aliceManager.createChannel(
      'bob-peer-id',
      bobPrivKey.toPublicKey().toString(),
      20000
    )
    aliceManager.setFundingTx(aliceChannel.id, 'funding-tx', 0)
    aliceManager.openChannel(aliceChannel.id)

    // Send multiple payments
    await aliceManager.createPayment(aliceChannel.id, 1000)
    await aliceManager.createPayment(aliceChannel.id, 2000)
    await aliceManager.createPayment(aliceChannel.id, 500)

    const payments = aliceManager.getPaymentHistory(aliceChannel.id)
    const sentPayments = payments.filter(p => p.direction === 'sent')
    
    expect(sentPayments.length).toBeGreaterThanOrEqual(3)
    expect(sentPayments[0].amount).toBe(1000)
    expect(sentPayments[1].amount).toBe(2000)
    expect(sentPayments[2].amount).toBe(500)
    expect(sentPayments[0].direction).toBe('sent')
    expect(sentPayments[0].sequence).toBe(1)
    expect(sentPayments[2].sequence).toBe(3)
  })

  it('should survive manager restart', async () => {
    // Create channel and send payment
    const aliceChannel = await aliceManager.createChannel(
      'bob-peer-id',
      bobPrivKey.toPublicKey().toString(),
      10000
    )
    aliceManager.setFundingTx(aliceChannel.id, 'funding-tx', 0)
    aliceManager.openChannel(aliceChannel.id)
    await aliceManager.createPayment(aliceChannel.id, 3000)

    // Create new manager instance (simulates restart)
    const aliceManager2 = new ChannelManager({
      privateKey: alicePrivKey.toString(),
      publicKey: alicePrivKey.toPublicKey().toString(),
      dbPath: aliceDbPath
    })

    // Verify state persisted
    const reloadedChannel = aliceManager2.getChannel(aliceChannel.id)!
    expect(reloadedChannel.state).toBe('open')
    expect(reloadedChannel.localBalance).toBe(7000)
    expect(reloadedChannel.remoteBalance).toBe(3000)
    expect(reloadedChannel.sequenceNumber).toBe(1)

    // Verify can continue operating
    await aliceManager2.createPayment(aliceChannel.id, 1000)
    expect(aliceManager2.getChannel(aliceChannel.id)?.sequenceNumber).toBe(2)
  })
})
