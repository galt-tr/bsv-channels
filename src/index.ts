// Main exports for bsv-channels package — Payment channels only

export { ChannelManager } from './channels/manager.js'
export { createMultisigScript, verifyMultisigSignature } from './channels/multisig.js'
export { ChannelStorage } from './channels/storage.js'
export { closeChannel } from './channels/close.js'
export { forceCloseChannel } from './channels/force-close.js'
export { DisputeMonitor } from './channels/dispute-monitor.js'

export type {
  Channel,
  ChannelState,
  ChannelConfig,
  PendingPayment
} from './channels/types.js'

export type {
  FundingTx,
  CommitmentTx,
  CloseTx,
  RefundTx
} from './transactions/types.js'

// Transaction builders
export * from './transactions/index.js'

// Direct payment fallback
export * from './payments/direct-payment.js'
