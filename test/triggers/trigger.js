/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const test = require('ava')
const deployer = require('../../deployer')
const util = require('util')
const diff = require('../helpers/diff')

require('../helpers/setup')(test)

const simpleTriggerGold =
    {
        triggers: [{
            triggerName: 'simple-trigger',
            deployResult: {
                name: 'simple-trigger',
                publish: false,
                annotations: [],
                version: '0.0.0',
                parameters: [],
                limits: {},
                namespace: '_'
            }
        }]
    }

test('deploy-trigger1', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/triggers/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, simpleTriggerGold)
})

const alarmTriggerGold =
    {
        triggers: [{
            triggerName: 'alarm-trigger',
            deployResult: {
                name: 'alarm-trigger',
                publish: false,
                annotations: [],
                version: '0.0.0',
                parameters: [],
                limits: {},
                namespace: '_'
            },
            feed: '/whisk.system/alarms/alarm',
            feedParams: {
                cron: '0 9 8 * *',
                trigger_payload: 'trigger_payload',
                lifecycleEvent: 'CREATE',
                triggerName: 'alarm-trigger',
                authKey: '[hidden]'
            }
        }]
    }

test('deploy-alarm-trigger', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/triggers/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-feed.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, alarmTriggerGold)
})
