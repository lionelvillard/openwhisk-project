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

const sequenceUnorderedGold = {
    packages: [{
        qname: 'sequence-test3',
        deployResult: {
            name: 'sequence-test3',
            binding: {},
            publish: false,
            annotations: [],
            version: '0.0.5',
            parameters: [],
            namespace: 'org_openwhisk-deployer-test-space'
        }
    },
        {
            qname: 'sequence-test3-1',
            deployResult: {
                name: 'sequence-test3-1',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.5',
                parameters: [],
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }],
    actions: [{
        qname: 'sequence-test3/in-same-package',
        location: 'openwhisk-deploy/libs/deployer/test/sequences/fixtures/manifest-unordered.yaml',
        kind: 'nodejs:default',
        params: [],
        deployResult: {
            name: 'in-same-package',
            publish: false,
            annotations: [{key: 'exec', value: 'nodejs:6'}],
            version: '0.0.5',
            exec: {
                kind: 'nodejs:6',
                code: '/** * Returns params, or an empty string if no parameter values are provided */\nfunction main(params) {\n    return params || {}\n}\n',
                binary: false
            },
            parameters: [],
            limits: {timeout: 60000, memory: 256, logs: 10},
            namespace: 'org_openwhisk-deployer-test-space/sequence-test3'
        }
    },
        {
            qname: 'sequence-test3-1/in-other-package',
            location: 'openwhisk-deploy/libs/deployer/test/sequences/fixtures/manifest-unordered.yaml',
            kind: 'nodejs:default',
            params: [],
            deployResult: {
                name: 'in-other-package',
                publish: false,
                annotations: [{key: 'exec', value: 'nodejs:6'}],
                version: '0.0.5',
                exec: {
                    kind: 'nodejs:6',
                    code: '/**\n * Equivalent to unix cat command.\n * Return all the lines in an array. All other fields in the input message are stripped.\n * @param lines An array of strings.\n */\nfunction main(msg) {\n    var lines = msg.lines || [];\n    var retn = {lines: lines, payload: lines.join("\\n")};\n    console.log(\'cat: returning \' + JSON.stringify(retn));\n    return retn;\n}\n',
                    binary: false
                },
                parameters: [],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'org_openwhisk-deployer-test-space/sequence-test3-1'
            }
        },
        {
            qname: 'mysequence',
            location: '',
            kind: 'sequence',
            params: [],
            deployResult: {
                name: 'mysequence',
                publish: false,
                annotations: [{key: 'exec', value: 'sequence'}],
                version: '0.0.2',
                exec: {
                    kind: 'sequence',
                    components: ['/org_openwhisk-deployer-test-space/sequence-test3/in-same-package',
                        '/org_openwhisk-deployer-test-space/sequence-test3-1/in-other-package']
                },
                parameters: [{
                    key: '_actions',
                    value: ['/villard@us.ibm.com_openwhisk-deployer-test-space/sequence-test3/in-same-package',
                        '/villard@us.ibm.com_openwhisk-deployer-test-space/sequence-test3-1/in-other-package']
                }],
                limits: {timeout: 60000, memory: 256, logs: 10},
                namespace: 'org_openwhisk-deployer-test-space'
            }
        }]
}

test('sequence-unordered', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/sequences/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-unordered.yaml',
        force: true
    })
    //console.log(util.inspect(result, {depth: null}))

    diff.deepEqualModulo(t, result, sequenceUnorderedGold)
})

test('sequence-cycle', async t => {
    try {
        const result = await deployer.deploy(t.context.bx.ow, {
            basePath: 'test/sequences/fixtures',
            cache: t.context.tmpdir,
            location: 'manifest-cycle.yaml',
            force: true
        })
        t.fail()
    } catch (e) {
        t.deepEqual(e, 'Error: cyclic dependencies detected (sequence-test4/mysequence)')
        
    }

})
