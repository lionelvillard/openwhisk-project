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

const sequenceGold =
    {
        packages: [{
            qname: 'sequence-test1',
            deployResult: {
                name: 'sequence-test1',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.6',
                parameters: [],
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }],
        actions: [],
        sequences: [{
            qname: 'sequence-test1/mysequence',
            location: '',
            kind: 'sequence',
            params: [],
            deployResult: {
                name: 'mysequence',
                publish: false,
                annotations: [{key: 'exec', value: 'sequence'}],
                version: '0.0.1',
                exec: {
                    kind: 'sequence',
                    components: ['/whisk.system/utils/echo', '/whisk.system/utils/cat']
                },
                parameters: [{
                    key: '_actions',
                    value: ['/whisk.system/utils/echo', '/whisk.system/utils/cat']
                }],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'org_openwhisk-deployer-test-space/sequence-test1'
            }
        }]
    }

test('deploy-sequence1', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/sequences/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force: true
    })
    diff.deepEqualModulo(t, result, sequenceGold)
})

const sequenceNoSugarGold = {
    packages: [{
        qname: 'sequence-test2',
        deployResult: {
            name: 'sequence-test2',
            binding: {},
            publish: false,
            annotations: [],
            version: '0.0.4',
            parameters: [],
            namespace: 'org_openwhisk-deployer-test-space'
        }
    }],
    actions: [{
        qname: 'mysequence1',
        location: '',
        kind: 'sequence',
        params: [],
        deployResult: {
            name: 'mysequence1',
            publish: false,
            annotations: [{key: 'exec', value: 'sequence'}],
            version: '0.0.3',
            exec: {
                kind: 'sequence',
                components: ['/whisk.system/utils/echo', '/whisk.system/utils/cat']
            },
            parameters: [{
                key: '_actions',
                value: ['/whisk.system/utils/echo', '/whisk.system/utils/cat']
            }],
            limits: {timeout: 60000, memory: 256, logs: 10},
            namespace: 'org_openwhisk-deployer-test-space'
        }
    }]
}

test('sequence-nosugar', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/sequences/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-nosugar.yaml',
        force: true
    })
    // console.log(util.inspect(result, {depth: null}))

    diff.deepEqualModulo(t, result, sequenceNoSugarGold)
})
