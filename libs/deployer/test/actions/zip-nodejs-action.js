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
const diff = require('../helpers/diff')
const util = require('util')
require('../helpers/setup')(test)

const zipGold =
    {
        packages: [{
            qname: 'utils-zip',
            deployResult: {
                name: 'utils-zip',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.40',
                parameters: [],
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }],
        actions: [{
            qname: 'utils-zip/cat',
            location: 'openwhisk-deploy/libs/deployer/test/actions/fixtures/zip-nodejs-action/manifest.yaml',
            kind: 'nodejs:default',
            params: [],
            deployResult: {
                name: 'cat',
                publish: false,
                annotations: [{key: 'exec', value: 'nodejs:6'}],
                version: '0.0.40',
                exec: {kind: 'nodejs:6', binary: true},
                parameters: [],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'org_openwhisk-deployer-test-space/utils'
            }
        }]
    }


test('deploy-zip-nodejs-action', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/actions/fixtures/zip-nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest.yaml'
    })
    diff.deleteCode(result)
    diff.deepEqualModulo(t, zipGold, result)
})