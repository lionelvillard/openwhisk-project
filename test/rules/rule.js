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

const ruleGold =
    {
        triggers: [{
            triggerName: 'rules-trigger1',
            deployResult: {
                name: 'rules-trigger1',
                publish: false,
                annotations: [],
                version: '0.0.3',
                parameters: [],
                limits: {},
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }],
        rules: [{
            ruleName: 'rules-rule1',
            deployResult: {
                name: 'rules-rule1',
                publish: false,
                annotations: [],
                version: '0.0.2',
                status: 'active',
                action: {path: 'whisk.system/utils', name: 'echo'},
                namespace: 'org_openwhisk-deployer-test-space',
                trigger: {
                    path: 'org_openwhisk-deployer-test-space',
                    name: 'rules-trigger1'
                }
            }
        }]
    }

test('deploy-rule1', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/rules/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, ruleGold)
})
