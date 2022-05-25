import { prompt } from 'enquirer'
import { spawnSync } from 'child_process'
import * as AWS from 'aws-sdk'
import {
  GetLogEventsRequest,
  GetLogEventsResponse,
} from 'aws-sdk/clients/cloudwatchlogs'
import kleur from 'kleur'
import { parse } from 'ts-command-line-args'

process.env.AWS_SDK_LOAD_CONFIG = '1'

const cloudWatchLogs = new AWS.CloudWatchLogs()
const cloudFormation = new AWS.CloudFormation()

const sleep = async (msec: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, msec)
  })
}

const execCommand = (command: string, args: string[]): string => {
  const res = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (res.status !== 0) {
    const error = res.stderr.toString()
    throw new Error(error)
  }

  return res.stdout.toString()
}

const select = async (
  name: string,
  message: string,
  choices: string[]
): Promise<any> => {
  if (choices.length === 1) {
    return choices[0]
  }

  return prompt({
    type: 'autocomplete',
    name,
    message,
    choices,
    initial: 0,
  })
}

const fetchLatestLogStreamName = async (
  logGroupName: string
): Promise<string> => {
  try {
    const logStreams = await cloudWatchLogs
      .describeLogStreams({
        logGroupName,
        descending: true,
        limit: 1,
        orderBy: 'LastEventTime',
      })
      .promise()

    if (!logStreams.logStreams) {
      throw new Error('Log stream not found')
    }

    if (logStreams.logStreams.length === 0) {
      throw new Error('Log stream not found (length is 0)')
    }

    if (!logStreams.logStreams[0].logStreamName) {
      throw new Error('Log stream name not found')
    }

    return logStreams.logStreams[0].logStreamName
  } catch (e) {
    if (e instanceof Error && e.name === 'ResourceNotFoundException') {
      console.log("The log group doesn't exist. Sleep for a while...")
      await sleep(10000)
      return fetchLatestLogStreamName(logGroupName)
    } else {
      throw e
    }
  }
}

type SelectedStack = {
  Stack: string
}

type SelectedFunc = {
  Lambda: string
}

interface CommandLineArgs {
  'stack-name'?: string
  'function-name'?: string
  help?: boolean
}

;(async () => {
  const args = parse<CommandLineArgs>(
    {
      'stack-name': {
        type: String,
        optional: true,
        alias: 's',
        description: 'Stack name (Optional)',
      },
      'function-name': {
        type: String,
        optional: true,
        alias: 'f',
        description: 'Lambda function name (Optional)',
      },
      help: {
        type: Boolean,
        optional: true,
        alias: 'h',
        description: 'Show help',
      },
    },
    {
      helpArg: 'help',
      headerContentSections: [
        { header: 'cdk-logs', content: 'Streaming lambda logs for cdk' },
      ],
    }
  )

  let stackName: string
  let functionName: string

  if (args['function-name']) {
    functionName = args['function-name']
  } else {
    if (args['stack-name']) {
      stackName = args['stack-name']
    } else {
      console.log(kleur.yellow('Loading stacks...'))

      const stacks = execCommand('npx', ['cdk', 'ls'])
        .split('\n')
        .filter((s) => s.length > 0)

      if (stacks.length === 0) {
        throw new Error('No stack found')
      }

      const selectedStack: SelectedStack = await select(
        'Stack',
        'Select a stack',
        stacks
      )

      stackName = selectedStack.Stack
    }

    console.log(kleur.yellow('Loading Lambda functions...'))

    const resources = await cloudFormation
      .describeStackResources({ StackName: stackName })
      .promise()
    const funcs = resources.StackResources?.filter(
      (r) => r.ResourceType === 'AWS::Lambda::Function'
    )

    if (!funcs) {
      throw new Error('No lambda functions found')
    }

    if (funcs.length === 0) {
      throw new Error('No lambda functions found (length is 0)')
    }

    const func: SelectedFunc = await select(
      'Lambda',
      'Select a Lambda function',
      funcs.map((f) => f.PhysicalResourceId!)
    )

    functionName = func.Lambda
  }

  const logGroupName = `/aws/lambda/${functionName}`

  if (!args['function-name']) {
    console.log()
    console.log(
      'Next time, you can skip the loading time by executing the following command'
    )
    console.log()
    console.log(kleur.green('```'))
    console.log(
      kleur.green(`npx cdk-lambda-log --function-name ${functionName}`)
    )
    console.log(kleur.green('```'))
    console.log()
  }

  console.log(`Start streaming on ${kleur.cyan().bold(logGroupName)}`)

  let logStreamName = await fetchLatestLogStreamName(logGroupName)
  let nextToken = undefined
  let count = 0

  console.log(kleur.yellow(`New log stream found ${logStreamName}`))

  while (true) {
    const params: GetLogEventsRequest = {
      logGroupName,
      logStreamName,
      nextToken,
    }

    const events: GetLogEventsResponse = await cloudWatchLogs
      .getLogEvents(params)
      .promise()

    if (events.events) {
      events.events.forEach((event) => {
        const timestamp = kleur.green(new Date(event.timestamp!).toISOString())
        console.log(timestamp, event.message?.trim())
      })
    }

    nextToken = events.nextForwardToken

    await sleep(1000)

    count += 1

    if (count % 5 == 0) {
      const latestLogStreamName = await fetchLatestLogStreamName(logGroupName)

      if (latestLogStreamName !== logStreamName) {
        console.log(kleur.yellow(`Switch Log stream to ${latestLogStreamName}`))
        logStreamName = latestLogStreamName
        nextToken = undefined
      }
    }
  }
})()
