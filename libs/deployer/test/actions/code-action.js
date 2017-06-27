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

const code1Gold = {
    packages: [{
        qname: 'code-action1',
        deployResult: {
            name: 'code-action1',
            binding: {},
            publish: false,
            annotations: [],
            version: '0.0.8',
            parameters: [],
            namespace: 'org_openwhisk-deployer-test-space'
        }
    }],
    actions: [{
        qname: 'code-action1/echo1',
        location: '',
        kind: 'nodejs:default',
        params: [],
        deployResult: {
            name: 'echo1',
            publish: false,
            annotations: [{key: 'exec', value: 'nodejs:6'}],
            version: '0.0.1',
            exec: {
                kind: 'nodejs:6',
                code: 'function main(params) { console.log(params)\nreturn params || {}\n }',
                binary: false
            },
            parameters: [],
            limits: {timeout: 60000, memory: 256, logs: 10},
            namespace: 'org_openwhisk-deployer-test-space'
        }
    }]
}

test('code-action1', async t => {
    const ow = t.context.bx.ow
    const result = await deployer.deploy(ow, {
        basePath: 'test/actions/fixtures/code-action',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force: true
    })

    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, code1Gold)

    const echo = await ow.actions.invoke({
        actionName: 'code-action1/echo1',
        params: {lines: ['first', 'second']},
        blocking: true
    })
    t.deepEqual(echo.response.result, {lines: ['first', 'second']})
    t.pass()
})
