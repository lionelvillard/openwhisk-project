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

const nodejsActionGold =
    {
        packages: [{
            qname: 'utils',
            deployResult: {
                name: 'utils',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.0',
                parameters: [],
                namespace: 'dummy_openwhisk-deployer-test-space'
            }
        }],
        actions: [{
            qname: 'utils/cat',
            kind: 'nodejs:default',
            location: 'fixtures/nodejs-action/manifest.yaml',
            params: [],
            deployResult: {
                name: 'cat',
                publish: false,
                annotations: [{key: 'exec', value: 'nodejs:6'}],
                version: '0.0.0',
                exec: {
                    kind: 'nodejs:6',
                    code: '/**\n * Equivalent to unix cat command.\n * Return all the lines in an array. All other fields in the input message are stripped.\n * @param lines An array of strings.\n */\nfunction main(msg) {\n    var lines = msg.lines || [];\n    var retn = {lines: lines, payload: lines.join("\\n")};\n    console.log(\'cat: returning \' + JSON.stringify(retn));\n    return retn;\n}\n',
                    binary: false
                },
                parameters: [],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'dummy_openwhisk-deployer-test-space/utils'
            }
        }]
    }


test('deploy-nodejs-action', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/actions/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force:true
    })
    diff.deepEqualModulo(t, result, nodejsActionGold)
})

const nodejsparamActionGold =
    {
        packages: [{
            qname: 'utils-with-param',
            deployResult: {
                name: 'utils-with-param',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.4',
                parameters: [],
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }],
        actions: [{
            qname: 'utils-with-param/cat-with-param',
            location: 'openwhisk-deploy/libs/deployer/test/actions/fixtures/nodejs-action/manifest-params.yaml',
            kind: 'nodejs:default',
            params: [{key: 'mykey', value: 'myvalue'}],
            deployResult: {
                name: 'cat-with-param',
                publish: false,
                annotations: [{key: 'exec', value: 'nodejs:6'}],
                version: '0.0.4',
                exec: {
                    kind: 'nodejs:6',
                    code: '/**\n * Equivalent to unix cat command.\n * Return all the lines in an array. All other fields in the input message are stripped.\n * @param lines An array of strings.\n */\nfunction main(msg) {\n    var lines = msg.lines || [];\n    var retn = {lines: lines, payload: lines.join("\\n")};\n    console.log(\'cat: returning \' + JSON.stringify(retn));\n    return retn;\n}\n',
                    binary: false
                },
                parameters: [{key: 'mykey', value: 'myvalue'}],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'org_openwhisk-deployer-test-space/utils-with-param'
            }
        }]
    }

test('deploy-nodejs-action-params', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/actions/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest-params.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, nodejsparamActionGold)
})


const nodejsannoActionGold =
    {
        packages: [{
            qname: 'utils-with-annotation',
            deployResult: {
                name: 'utils-with-annotation',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.4',
                parameters: [],
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }],
        actions: [{
            qname: 'utils-with-annotation/cat-with-annotation',
            location: 'openwhisk-deploy/libs/deployer/test/actions/fixtures/nodejs-action/manifest-annotation.yaml',
            kind: 'nodejs:default',
            params: [],
            deployResult: {
                name: 'cat-with-annotation',
                publish: false,
                annotations: [{key: 'myannokey', value: 'myannovalue'}, {key: 'exec', value: 'nodejs:6'}],
                version: '0.0.4',
                exec: {
                    kind: 'nodejs:6',
                    code: '/**\n * Equivalent to unix cat command.\n * Return all the lines in an array. All other fields in the input message are stripped.\n * @param lines An array of strings.\n */\nfunction main(msg) {\n    var lines = msg.lines || [];\n    var retn = {lines: lines, payload: lines.join("\\n")};\n    console.log(\'cat: returning \' + JSON.stringify(retn));\n    return retn;\n}\n',
                    binary: false
                },
                parameters: [],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'org_openwhisk-deployer-test-space/utils-with-annotation'
            }
        }]
    }


test('deploy-nodejs-action-annotation', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/actions/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest-annotations.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, nodejsannoActionGold)

})