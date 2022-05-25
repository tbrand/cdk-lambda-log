import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export class ExampleStack1 extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new lambda.NodejsFunction(this, 'Test1_1', {
      handler: 'handler',
      entry: path.join(__dirname, 'lambda', 'test1_1.js'),
    });
  }
}

export class ExampleStack2 extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    new lambda.NodejsFunction(this, 'Test2_1', {
      handler: 'handler',
      entry: path.join(__dirname, 'lambda', 'test2_1.js'),
    });

    new lambda.NodejsFunction(this, 'Test2_2', {
      handler: 'handler',
      entry: path.join(__dirname, 'lambda', 'test2_2.js'),
    });
  }
}

const app = new cdk.App();

new ExampleStack1(app, 'ExampleStack1');
new ExampleStack2(app, 'ExampleStack2');
