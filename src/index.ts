// Main exports for bsv-channels package — Payment channels only

export { ChannelManager } from './channels/manager.js'
export { ChannelStorage } from './channels/storage.js'
export { DisputeMonitor } from './channels/dispute-monitor.js'

// Types
export * from './channels/types.js'
export * from './transactions/types.js'

// Transaction builders (from transactions/)
export * from './transactions/index.js'

// Don't re-export from channels/transactions.js to avoid duplicates
// Users can import directly: import { createFundingTransaction } from 'bsv-channels/channels/transactions'
