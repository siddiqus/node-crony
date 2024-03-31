import { Crony } from './client'
import { CronJobConfig } from './types'

export const jobs: CronJobConfig[] = [
  {
    // disabled: canBeSome === expression,
    id: 'basic-job-id',
    jobRunner: async () => {
      await new Promise((res) => setTimeout(res, 2000))
    },
    cronTime: '*/5 * * * * *', // Once every 2 seconds
    redlockTtl: '1s',
  },
]

async function run() {
  await Crony.initialize({
    jobs,
    redisOptions: {
      host: '127.0.0.1',
      port: 6379,
      db: 1,
    },
    logger: console,
  })
}

run()
  .then(() => {
    // process.exit(0)
  })
  .catch((err) => {
    console.log('error', err)
    process.exit(1)
  })
