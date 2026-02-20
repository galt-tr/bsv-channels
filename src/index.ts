// Main exports for bsv-channels package — Payment channels only

export { ChannelManager } from './channels/manager.js'
export { ChannelStorage } from './channels/storage.js'
export { DisputeMonitor } from './channels/dispute-monitor.js'

// Multisig utilities
export {
  createMultisigLockingScript,
  createSighashPreimage,
  signInput,
  createMultisigUnlockingScript,
  createMultisigUnlockTemplate,
  signCommitment,
  verifySignature,
  createFundingTransaction,
  createCommitmentTransaction
} from './channels/multisig.js'

// Cooperative close
export {
  createCloseRequest,
  signCloseRequest,
  broadcastClose
} from './channels/close.js'

export type { CloseRequest, CloseAccept } from './channels/close.js'

// Force close (unilateral)
export {
  isNLockTimeExpired,
  isPeerUnresponsive,
  getNLockTimeExpiry,
  getTimeUntilExpiry,
  broadcastCommitmentTx,
  findChannelsNeedingForceClose,
  getForceCloseStats,
  DEFAULT_FORCE_CLOSE_CONFIG
} from './channels/force-close.js'

export type { ForceCloseConfig, ForceCloseResult } from './channels/force-close.js'

// Channel types
export type {
  Channel,
  ChannelState,
  ChannelConfig,
  PendingPayment,
  ChannelOpenRequest,
  ChannelOpenResponse,
  ChannelPayment,
  ChannelCloseRequest,
  CommitmentTransaction
} from './channels/types.js'

// Transaction types
export type {
  FundingTx,
  CommitmentTx,
  CloseTx,
  RefundTx,
  TransactionTemplate
} from './transactions/types.js'

// Transaction builders
export * from './transactions/index.js'

// Direct payment fallback
export * from './payments/direct-payment.js'
