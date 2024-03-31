import Axios from 'axios'
import { Logger, Notify } from '../types'

/**
 * implementation of new webhook apis format for sending data as message attachment
 * doc: https://api.slack.com/incoming-webhooks
 * doc: https://api.slack.com/docs/message-attachments
 * Request body:
 * {
 *   "channel": "#name",
 *   "text": "Suitable text description",
 *   "attachments": [
 *       {
 *           "text": "Suitable text description",
 *           "title": "Ticket #1943: Can't reset my password",
 *           "title_link": "https://groove.hq/path/to/ticket/1943",
 *           "color": "#7CD197"
 *       }
 *   ]
 * }
 * @param {object} postBody - slack request body
 * @param {string} postBody.channel - channel name, e.g #general
 * @param {string} postBody.text - message text
 * @param {array} [postBody.attachments] - array of attachment objects (don't misunderstand it as file attachment)
 * @param {string} [postBody.attachments.title] - title of the attachment
 * @param {string} [postBody.attachments.text] - text of the attachment
 * @param {string} [postBody.attachments.title_link] - valid url to link the title
 * @param {string} [postBody.attachments.color] - color of the left border e.g #FFF
 *
 */
async function postToWebHook(
  postBody: {
    channel: string
    text: string
    attachments?: {
      text: string
      title: string
      title_link?: string
      color?: string
    }[]
  },
  channelUrl: string
) {
  return await Axios({
    method: 'post',
    url: channelUrl,
    data: postBody,
    headers: { 'Content-Type': 'application/json' },
  })
}

const sendSlackNotification = async (opts: {
  error: Error
  jobId: string
  logger: Logger
  webhookUrl: string
  channelName: string
  messageConstructor?: (jobId: string, error: Error) => string
}): Promise<void> => {
  const {
    error,
    jobId,
    logger,
    webhookUrl,
    channelName,
    messageConstructor,
  } = opts
  try {
    const messageText = messageConstructor
      ? messageConstructor(jobId, error)
      : `<!channel> Error in cron ${jobId}. Check 'Crony: error while processing ${jobId}' in logs`

    await postToWebHook(
      {
        channel: channelName,
        text: messageText,
        attachments: [
          {
            text: `${error.message}`,
            title: `Cron ${jobId} Failed`,
            color: '#de2618',
          },
        ],
      },
      webhookUrl
    )
  } catch (error) {
    logger.error(
      `Crony: ${new Date()} error while sending slack notification`,
      error
    )
  }
}

export const getSlackNotifier = (opts: {
  channelName: string
  logger: Logger
  webhookUrl: string
  messageConstructor?: (jobId: string, error: Error) => string
}): Notify => {
  const { channelName, logger, webhookUrl, messageConstructor } = opts
  return async (jobId: string, error: Error) => {
    return await sendSlackNotification({
      channelName,
      error,
      jobId,
      logger,
      webhookUrl,
      messageConstructor,
    })
  }
}
