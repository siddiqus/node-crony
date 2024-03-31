export interface Logger {
  info?(...args: any): void
  debug(...args: any): void
  warn(...args: any): void
  error(...args: any): void
  log(...args: any): void
}

export type CronJobParameters = import('cron').CronJobParams

export type RedlockOptions = import('redlock').Settings

export type Callback = () => void | Promise<void>

export type IsEnabledCb = (jobId: string) => Promise<boolean>

export type CronJobConfig = {
  /**
   * Human readable unique identifier
   */
  id: string
  jobRunner: Callback
  redlockTtl?: string | number // should be greater than the time it takes to complete the function
  redlockOptions?: RedlockOptions
  /**
   * **Format**: `second minute hour day month weekday`
   *
   * **Syntax**:
   *
   *   `*` -	any value
   *
   *   `,` - value list separator
   *
   *   `-` - range of values
   *
   *   `/` - step values
   *
   * **Examples** _(doesn't show the `second` part)_: https://crontab.guru/examples.html
   */
  cronTime: CronJobParameters['cronTime']
  timeZone?: CronJobParameters['timeZone']
  disabled?: boolean
  /**
   * Number of retry attempts, if no value is provided then only one attempt is made
   * e.g. `maxAttempts = 2` will attempt a total of 2 times
   */
  maxAttempts?: number
  retryIntervalInSeconds?: number
}

export interface Notify {
  (jobId: string, error: Error): Promise<void>
}

export interface SlackErrorNotifier {
  transport: 'slack'
  webhookUrl: string
  channelName: string
  headers?: Record<string, any>
  messageConstructor?: (jobId: string, error: Error) => string
}

export type Notifier = SlackErrorNotifier
