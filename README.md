# Crony - Scheduled jobs

Features:

- Fault tolerant - exceptions handled
- Easily initialize cron jobs in a declarative format
- Redis based redlock for ensuring one-time execution per cron across distributed nodes
- Easily produce a scheduled one-time job on the fly
- Built-in retry mechanism on failure

## Installation

```sh
# using yarn:
yarn add @siddiqus/crony

# using npm:
npm install --save @siddiqus/crony
```

## Scheduled Jobs

1. Declare a `jobs` file for cron jobs

```typescript
// e.g. jobs/index.ts
import { initialize, CronJobConfig } from '@siddiqus/crony'
import { someService } from './services/some-service'

export const jobs: CronJobConfig[] = [
  {
    disabled: true,
    id: 'basic-job-id',
    jobRunner: async () => {
      console.log(`this won't run because it's disabled`)
    },
    cronTime: '*/2 * * * * *', // Once every 2 seconds
    redlockTtl: '1s',
  },
  {
    id: 'some-other-job-id',
    jobRunner: someService.someJob,
    cronTime: '00 00 06 * * *', // Everyday at 06:00
    redlockTtl: '2m',
  },
]
```

2. Initialize the job with a redis client and the jobs array

```typescript
// e.g. server.ts
import { Crony } from '@siddiqus/crony'
import { jobs } from './jobs'

async function run() {
  await Crony.initialize({
    jobs,
    redisOptions: {
      host: '127.0.0.1',
      port: 6379,
      auth_pass: '',
      db: 1,
    },
    logger: console,
  })
}
```

## Cron Job Configuration

- Each job in the job configs list has a 'disabled' boolean that can be set by the user

```typescript
// example disabling a single job with an expression
export const jobs: CronJobConfig[] = [
  {
    disabled: canBeSome === expression, // this one
    id: 'basic-job-id',
    jobRunner: async () => {
      console.log("this won't run because it's disabled")
    },
    cronTime: '*/2 * * * * *', // Once every 2 seconds
    redlockTtl: '1s',
  },
]
```

- There is a `isEnabledAsyncCb` callback parameter for the `initialize` function. This can be a generic implementation to check some db or data store for cron enabled or not. The following example shows checking if cron is enabled from a database model. (if cron config is not in db, then by default it is enabled)

```typescript
import { Crony } from '@siddiqus/crony'

Crony.initialize(opts: {
  jobs, // some jobs
  redisOptions, // redis credentials
  logger: console,
  isEnabledAsyncCb: async (jobId: string) => {
    const cronConfig = await CronConfigModel.findById(jobId);
    return cronConfig ? cronConfig.isEnabled : true
  }
})
```

- The cronTime is optional, so if it is not declared, the cron job will not run.

## Scheduled one-time job

You can also schedule a single job to run at a specific time. Here's an example

#### Per job config

```typescript
import { Crony } from '@siddiqus/crony'

Crony.scheduleJob({
  jobName: 'hello-world',
  scheduleAt: new Date('2022-03-01 10:45:00'),
  callback: () => {
    // some stuff
    console.log('running this job at 2022-03-01 10:45:00')
  },
  maxAttempts: 3, // will attempt 3 times total if failed
})
```

## Notes

- Redis is optional, but should be required if app is deployed using multiple instances

## License

Licensed under the UNLICENSED License. Check the [LICENSE](./LICENSE) file for details.
