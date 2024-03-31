/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CronJob } from 'cron'
import ms from 'ms'
import Redis, { RedisOptions } from 'ioredis'
import Redlock from 'redlock'
import { getNotifier } from './notifiers'
import {
  Callback,
  CronJobConfig,
  IsEnabledCb,
  Logger,
  Notifier,
  Notify,
} from './types'

export type RedisClientOpts = RedisOptions

type RedisClientType = Redis

const run = async (opts: {
  jobId: string
  callback: Callback
  logger: Logger
  currentAttempt?: number
}) => {
  const { jobId, callback, logger, currentAttempt = 1 } = opts
  const startTime = new Date()

  logger.log(
    `Crony: ${new Date().toISOString()} cron-start:${jobId} (attempt #${currentAttempt})`
  )

  await callback()

  const durationInMs = Date.now() - startTime.getTime()
  logger.log(
    `Crony: ${new Date().toISOString()} cron-end:${jobId}, duration: ${durationInMs}ms`
  )
}

async function _wrapCallback(
  logger: Logger,
  jobId: string,
  callback?: Callback
) {
  if (!callback) {
    return
  }

  try {
    await callback()
  } catch (error) {
    logError(logger, `callback error for ${jobId}`, error as Error)
  }
}

async function runJobWithRetries(opts: {
  jobId: string
  callback: Callback
  logger: Logger
  maxAttempts: number
  currentAttempt?: number
  retryIntervalInSeconds?: number
}) {
  const { jobId, callback, logger, maxAttempts, retryIntervalInSeconds } = opts
  let currentAttempt = opts.currentAttempt || 0
  try {
    currentAttempt++
    await run({
      jobId,
      callback,
      logger,
      currentAttempt,
    })
  } catch (error) {
    logError(logger, `processing ${jobId}`, error as Error)

    if (Crony.notifyError) {
      Crony.notifyError(jobId, error as Error)
    }

    if (currentAttempt < maxAttempts) {
      logger.log(
        `Crony: ${new Date().toISOString()} setting up retry for job ${jobId}`
      )
      setTimeout(async () => {
        await _wrapCallback(
          logger,
          jobId,
          async () =>
            await runJobWithRetries({
              callback,
              jobId,
              logger,
              maxAttempts,
              currentAttempt,
              retryIntervalInSeconds,
            })
        )
      }, (retryIntervalInSeconds || 5) * 1000)
    }
  }
}

function isValidJobIds(jobs: CronJobConfig[]) {
  return !jobs.some((job) => !job.id || job.id.includes(' '))
}

function logInfo(logger: Logger, message: string) {
  logger.log(`Crony: ${new Date().toISOString()} ${message}`)
}

function logError(logger: Logger, event: string, error: Error) {
  logger.error(
    `Crony: ${new Date().toISOString()} error while ${event}: ${
      error.message
    }, ${error.stack}`
  )
}

export class Crony {
  private static logger: Logger = console
  private static redisOptions?: RedisClientOpts
  private static redisClient?: RedisClientType
  private static throwErrorOnRedlock?: boolean

  static notifyError?: Notify

  private static async initRedisClient(): Promise<RedisClientType> {
    if (Crony.redisClient) {
      return Crony.redisClient
    }

    const redisClient = new Redis(this.redisOptions!)
    const logger = Crony.logger

    try {
      await new Promise((res, rej) => {
        redisClient.on('error', (err) => {
          logError(
            logger,
            `Crony: ${new Date().toISOString()} - error with redis`,
            err
          )

          rej(err)

          redisClient.shutdown()
        })

        redisClient.on('connect', () => {
          logger.log(`Crony: ${new Date().toISOString()} connected to redis!`)
          res(null)
        })
      })

      Crony.redisClient = redisClient
      return redisClient
    } catch (error) {
      logError(logger, 'connecting to redis', error as Error)
      process.exit(1)
    }
  }

  static async initialize(opts: {
    jobs: CronJobConfig[]
    redisOptions?: RedisClientOpts
    logger: Logger
    isEnabledAsyncCb?: (jobId: string) => Promise<boolean>
    errorNotifierConfig?: Notifier
    throwErrorOnRedlock?: boolean
  }): Promise<void> {
    const {
      jobs,
      redisOptions,
      logger,
      isEnabledAsyncCb,
      errorNotifierConfig,
    } = opts

    if (!isValidJobIds(jobs)) {
      throw new Error('Job ID must be a string without spaces')
    }

    Crony.logger = logger
    Crony.logger.info = logger.info || logger.log

    Crony.notifyError = getNotifier(Crony.logger, errorNotifierConfig)

    Crony.throwErrorOnRedlock = opts.throwErrorOnRedlock || false

    if (redisOptions) {
      Crony.redisOptions = redisOptions
      await Crony.initRedisClient()
    }

    for (const { disabled, ...jobConfig } of jobs) {
      if (!disabled && jobConfig.cronTime) {
        logInfo(
          logger,
          `Initializing job: '${jobConfig.id}', interval: '${jobConfig.cronTime}'`
        )
        Crony.startCronJob({
          ...jobConfig,
          logger,
          isEnabledAsyncCb,
        })
      }
    }
  }

  static scheduleJob(opts: {
    jobName: string
    scheduleAt: string | Date
    callback: Callback
    maxAttempts?: number
    retryIntervalInSeconds?: number
  }): CronJob {
    const { jobName, scheduleAt, callback, retryIntervalInSeconds } = opts
    const maxAttempts =
      opts.maxAttempts && opts.maxAttempts > 0 ? opts.maxAttempts : 1

    const job = new CronJob(scheduleAt, () =>
      runJobWithRetries({
        jobId: jobName,
        callback,
        logger: Crony.logger,
        maxAttempts,
        retryIntervalInSeconds,
      })
    )
    Crony.logger.log(
      `Crony: ${new Date().toISOString()} scheduling job '${jobName}' at ${scheduleAt}`
    )
    job.start()
    return job
  }

  private static startJobWithoutRedis({
    cronTime,
    logger,
    isEnabledAsyncCb,
    id,
    jobRunner,
    timeZone,
    maxAttempts = 1,
    retryIntervalInSeconds = 5,
  }: CronJobConfig & {
    logger: Logger
    isEnabledAsyncCb?: IsEnabledCb
  }) {
    const job = new CronJob(
      cronTime!,
      async () => {
        try {
          if (isEnabledAsyncCb && !(await isEnabledAsyncCb(id))) {
            logger.log(
              `Crony: ${new Date().toISOString()} skipping ${id} - disabled from config`
            )
            return
          }
          await runJobWithRetries({
            jobId: id,
            callback: jobRunner,
            logger,
            maxAttempts,
            retryIntervalInSeconds,
          })
        } catch (error) {
          logError(logger, `processing ${id}`, error as Error)
        }
      },
      null, // onComplete
      true, // start
      timeZone
    )

    job.start()
  }

  private static startJobWithRedis({
    cronTime,
    logger,
    isEnabledAsyncCb,
    id,
    jobRunner,
    timeZone,
    redlockTtl,
    redlockOptions,
    maxAttempts = 1,
    retryIntervalInSeconds = 5,
  }: CronJobConfig & {
    logger: Logger
    isEnabledAsyncCb?: IsEnabledCb
  }) {
    const redlock = new Redlock([Crony.redisClient!], {
      ...(redlockOptions || {}),
      retryCount: redlockOptions?.retryCount || 1,
    })

    redlock.on('clientError', (err: any) => {
      logError(logger, `redlock redis error for cron[${id}]`, err)
    })

    const lockKey = `crony:redlock:${id}`
    const ttl = !redlockTtl
      ? ms('1m')
      : typeof redlockTtl === 'string'
      ? ms(redlockTtl)
      : redlockTtl

    const job = new CronJob(
      cronTime!,
      async () => {
        try {
          if (isEnabledAsyncCb && !(await isEnabledAsyncCb(id))) {
            logInfo(logger, `skipping ${id} - disabled from config`)
            return // exit if disabled
          }

          await redlock.using([lockKey], ttl, async (signal) => {
            if (signal.aborted) {
              throw signal.error
            }

            try {
              await runJobWithRetries({
                jobId: id,
                callback: jobRunner,
                logger,
                maxAttempts,
                retryIntervalInSeconds,
              })
            } catch (error) {
              logError(logger, `processing ${id}`, error as Error)
              return
            }
          })
        } catch (error) {
          logError(logger, `redlock failed for job ${id}`, error as Error)

          if (Crony.throwErrorOnRedlock) {
            throw error
          }
          return // exit
        }
      },
      null,
      true,
      timeZone
    )
    job.start()
  }

  private static startCronJob({
    id,
    jobRunner,
    redlockTtl,
    cronTime,
    isEnabledAsyncCb,
    redlockOptions,
    timeZone = 'Asia/Dhaka',
    logger = console as Logger,
    maxAttempts = 1,
    retryIntervalInSeconds = 5,
  }: CronJobConfig & {
    logger: Logger
    isEnabledAsyncCb?: IsEnabledCb
  }) {
    if (!cronTime) {
      return null
    }

    if (!Crony.redisClient) {
      this.startJobWithoutRedis({
        id,
        jobRunner,
        cronTime,
        isEnabledAsyncCb,
        timeZone,
        logger,
        maxAttempts,
        retryIntervalInSeconds,
      })
      return
    }

    this.startJobWithRedis({
      id,
      jobRunner,
      cronTime,
      isEnabledAsyncCb,
      timeZone,
      logger,
      maxAttempts,
      retryIntervalInSeconds,
      redlockTtl,
      redlockOptions,
    })
    return
  }
}
