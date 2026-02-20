/**
 * Unit tests for 2-of-2 multisig operations
 */

import { describe, it, expect } from 'vitest'
import { PrivateKey, PublicKey, Transaction, LockingScript, UnlockingScript, P2PKH, Hash } from '@bsv/sdk'
import {
  createMultisigLockingScript,
  createSighashPreimage,
  signInput,
  createMultisigUnlockingScript,
  verifySignature
} from './multisig.js'

const { hash160 } = Hash

describe('Multisig Construction', () => {
  const privKey1 = PrivateKey.fromRandom()
  const privKey2 = PrivateKey.fromRandom()
  const pubKey1 = privKey1.toPublicKey()
  const pubKey2 = privKey2.toPublicKey()

  it('should create a valid 2-of-2 multisig locking script', () => {
    const lockingScript = createMultisigLockingScript(pubKey1, pubKey2)
    expect(lockingScript).toBeInstanceOf(LockingScript)
    
    // Script format: OP_2 <pubkey1> <pubkey2> OP_2 OP_CHECKMULTISIG
    const chunks = lockingScript.chunks
    expect(chunks[0].op).toBe(0x52) // OP_2
    expect(chunks[3].op).toBe(0x52) // OP_2
    expect(chunks[4].op).toBe(0xae) // OP_CHECKMULTISIG
  })

  it('should accept public keys in either order', () => {
    const script1 = createMultisigLockingScript(pubKey1, pubKey2)
    const script2 = createMultisigLockingScript(pubKey2, pubKey1)
    
    expect(script1).toBeInstanceOf(LockingScript)
    expect(script2).toBeInstanceOf(LockingScript)
    expect(script1.toHex()).not.toBe(script2.toHex()) // Different order = different script
  })

  it('should produce deterministic output for same keys', () => {
    const script1 = createMultisigLockingScript(pubKey1, pubKey2)
    const script2 = createMultisigLockingScript(pubKey1, pubKey2)
    
    expect(script1.toHex()).toBe(script2.toHex())
  })
})

describe('Multisig Signing', () => {
  const privKey1 = PrivateKey.fromRandom()
  const privKey2 = PrivateKey.fromRandom()
  const pubKey1 = privKey1.toPublicKey()
  const pubKey2 = privKey2.toPublicKey()

  const fundingPrivKey = PrivateKey.fromRandom()
  const fundingPubKey = fundingPrivKey.toPublicKey()

  it('should create valid sighash preimage', () => {
    // Create a simple funding transaction
    const p2pkh = new P2PKH()
    const fundingTx = new Transaction()
    fundingTx.addOutput({
      satoshis: 10000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    // Create spending transaction
    const spendingTx = new Transaction()
    spendingTx.addInput({
      sourceTransaction: fundingTx,
      sourceOutputIndex: 0,
      sequence: 0xfffffffe
    })
    spendingTx.addOutput({
      satoshis: 9000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    const lockingScript = p2pkh.lock(hash160(fundingPubKey.encode(true)))
    const preimage = createSighashPreimage(spendingTx, 0, lockingScript, 10000)
    
    expect(preimage).toBeDefined()
    expect(Array.isArray(preimage)).toBe(true)
    expect(preimage.length).toBeGreaterThan(0)
  })

  it('should sign input with private key', () => {
    const p2pkh = new P2PKH()
    const fundingTx = new Transaction()
    fundingTx.addOutput({
      satoshis: 10000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    const spendingTx = new Transaction()
    spendingTx.addInput({
      sourceTransaction: fundingTx,
      sourceOutputIndex: 0,
      sequence: 0xfffffffe
    })
    spendingTx.addOutput({
      satoshis: 9000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    const lockingScript = p2pkh.lock(hash160(fundingPubKey.encode(true)))
    const signature = signInput(spendingTx, 0, fundingPrivKey, lockingScript, 10000)
    
    expect(Array.isArray(signature)).toBe(true)
    expect(signature.length).toBeGreaterThan(0)
    expect(signature[signature.length - 1]).toBe(0x41) // SIGHASH_ALL | SIGHASH_FORKID
  })

  it('should create 2-of-2 unlocking script with both signatures', () => {
    const sig1 = [0x01, 0x02, 0x03, 0x41]
    const sig2 = [0x04, 0x05, 0x06, 0x41]

    const unlockingScript = createMultisigUnlockingScript(sig1, sig2)
    expect(unlockingScript).toBeInstanceOf(UnlockingScript)
    
    // Script format: OP_0 <sig1> <sig2>
    const chunks = unlockingScript.chunks
    expect(chunks[0].op).toBe(0x00) // OP_0 (OP_CHECKMULTISIG bug workaround)
    expect(chunks[1].data).toBeDefined()
    expect(chunks[2].data).toBeDefined()
  })
})

describe('Multisig Verification', () => {
  const privKey1 = PrivateKey.fromRandom()
  const privKey2 = PrivateKey.fromRandom()
  const pubKey1 = privKey1.toPublicKey()
  const pubKey2 = privKey2.toPublicKey()

  it('should verify valid signature', () => {
    const p2pkh = new P2PKH()
    const fundingPrivKey = PrivateKey.fromRandom()
    const fundingPubKey = fundingPrivKey.toPublicKey()
    
    const fundingTx = new Transaction()
    fundingTx.addOutput({
      satoshis: 10000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    const lockingScript = createMultisigLockingScript(pubKey1, pubKey2)
    
    const spendingTx = new Transaction()
    spendingTx.addInput({
      sourceTransaction: fundingTx,
      sourceOutputIndex: 0,
      sequence: 0xfffffffe
    })
    spendingTx.addOutput({
      satoshis: 9000,
      lockingScript: lockingScript
    })

    const sig1 = signInput(spendingTx, 0, privKey1, lockingScript, 10000)

    const isValid = verifySignature(
      spendingTx,
      0,
      pubKey1,
      sig1,
      lockingScript,
      10000
    )

    expect(isValid).toBe(true)
  })

  it('should reject invalid signature', () => {
    const p2pkh = new P2PKH()
    const fundingPrivKey = PrivateKey.fromRandom()
    const fundingPubKey = fundingPrivKey.toPublicKey()
    
    const fundingTx = new Transaction()
    fundingTx.addOutput({
      satoshis: 10000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    const lockingScript = createMultisigLockingScript(pubKey1, pubKey2)
    
    const spendingTx = new Transaction()
    spendingTx.addInput({
      sourceTransaction: fundingTx,
      sourceOutputIndex: 0,
      sequence: 0xfffffffe
    })
    spendingTx.addOutput({
      satoshis: 9000,
      lockingScript: lockingScript
    })

    const wrongPrivKey = PrivateKey.fromRandom()
    const badSig = signInput(spendingTx, 0, wrongPrivKey, lockingScript, 10000) // Wrong key!

    const isValid = verifySignature(
      spendingTx,
      0,
      pubKey1,
      badSig,
      lockingScript,
      10000
    )

    expect(isValid).toBe(false)
  })

  it('should create complete 2-of-2 unlocking script', () => {
    const p2pkh = new P2PKH()
    const fundingPrivKey = PrivateKey.fromRandom()
    const fundingPubKey = fundingPrivKey.toPublicKey()
    
    const fundingTx = new Transaction()
    fundingTx.addOutput({
      satoshis: 10000,
      lockingScript: p2pkh.lock(hash160(fundingPubKey.encode(true)))
    })

    const lockingScript = createMultisigLockingScript(pubKey1, pubKey2)
    
    const spendingTx = new Transaction()
    spendingTx.addInput({
      sourceTransaction: fundingTx,
      sourceOutputIndex: 0,
      sequence: 0xfffffffe
    })
    spendingTx.addOutput({
      satoshis: 9000,
      lockingScript: lockingScript
    })

    const sig1 = signInput(spendingTx, 0, privKey1, lockingScript, 10000)
    const sig2 = signInput(spendingTx, 0, privKey2, lockingScript, 10000)

    // Create unlocking script with both signatures
    const unlockingScript = createMultisigUnlockingScript(sig1, sig2)
    expect(unlockingScript).toBeInstanceOf(UnlockingScript)
    
    // Verify both signatures individually
    expect(verifySignature(spendingTx, 0, pubKey1, sig1, lockingScript, 10000)).toBe(true)
    expect(verifySignature(spendingTx, 0, pubKey2, sig2, lockingScript, 10000)).toBe(true)
  })
})
