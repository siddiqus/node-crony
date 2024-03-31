import type { Logger, Notifier, Notify } from '../types'
import { getSlackNotifier } from './slack'

export function getNotifier(
  logger: Logger,
  notifierConfig?: Notifier
): Notify | undefined {
  if (!notifierConfig) {
    return
  }

  if (notifierConfig.transport === 'slack') {
    return getSlackNotifier({
      channelName: notifierConfig.channelName,
      logger,
      messageConstructor: notifierConfig.messageConstructor,
      webhookUrl: notifierConfig.webhookUrl,
    })
  }

  logger.log(`Crony: could not register notifier - transport not supported`)

  return
}
