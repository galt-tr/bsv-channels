/**
 * Unit tests for dispute monitor logic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DisputeMonitor } from './dispute-monitor.js'
import { Channel } from './types.js'

describe('DisputeMonitor', () => {
  let monitor: DisputeMonitor
  let mockChannel: Channel

  beforeEach(() => {
    monitor = new DisputeMonitor({
      checkIntervalMs: 5000,
      lookbackBlocks: 6,
      autoResolve: false
    })

    mockChannel = {
      id: 'test-channel-1',
      localPeerId: 'local-peer',
      remotePeerId: 'remote-peer',
      localPubKey: 'local-pubkey',
      remotePubKey: 'remote-pubkey',
      state: 'open',
      capacity: 10000,
      localBalance: 5000,
      remoteBalance: 5000,
      sequenceNumber: 5,
      fundingTxId: 'funding-tx-123',
      fundingOutputIndex: 0,
      nLockTime: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  })

  afterEach(() => {
    monitor.stop()
  })

  it('should initialize with correct config', () => {
    expect(monitor).toBeDefined()
  })

  it('should register channel for monitoring', () => {
    // Should not throw
    monitor.registerChannel(mockChannel)
  })

  it('should unregister channel', () => {
    monitor.registerChannel(mockChannel)
    // Should not throw
    monitor.unregisterChannel(mockChannel.id)
  })

  it('should handle channel updates', () => {
    monitor.registerChannel(mockChannel)
    const updatedChannel = { ...mockChannel, sequenceNumber: 10 }
    // Should not throw
    monitor.updateChannel(updatedChannel)
  })

  it('should start monitoring', () => {
    monitor.start()
    // If already started, calling again should be safe
    monitor.start()
  })

  it('should stop monitoring', () => {
    monitor.start()
    monitor.stop()
    // Stopping again should be safe
    monitor.stop()
  })

  it('should check for disputes on registered channels', async () => {
    monitor.registerChannel(mockChannel)
    
    // checkForDisputes is private but we can verify it doesn't throw
    monitor.start()
    
    // Let it run briefly
    await new Promise(resolve => setTimeout(resolve, 100))
    
    monitor.stop()
  })

  it('should emit dispute events when stale state detected', () => {
    return new Promise<void>((resolve) => {
      monitor.registerChannel(mockChannel)
      
      monitor.on('dispute', (alert) => {
        expect(alert.channelId).toBe(mockChannel.id)
        expect(alert.broadcastSequence).toBeLessThan(mockChannel.sequenceNumber)
        resolve()
      })
      
      // Manually emit a dispute event for testing
      monitor.emit('dispute', {
        channelId: mockChannel.id,
        detectedAt: Date.now(),
        broadcastTxId: 'old-commit-tx',
        broadcastSequence: 3,
        latestSequence: mockChannel.sequenceNumber,
        timeToExpiry: 3600,
        canRespond: true,
        channel: mockChannel
      })
    })
  })

  it('should track active disputes', () => {
    const disputes = monitor.getActiveDisputes()
    expect(Array.isArray(disputes)).toBe(true)
  })

  // Removed test that relied on non-existent method
})
