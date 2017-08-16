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

const default1 = {
    actions:
    [{
        qname: 'cat-in-default-package',
        location: '',
        kind: 'nodejs:default',
        params: [],
        deployResult:
        {
            name: 'cat-in-default-package',
            publish: false,
            annotations: [{ key: 'exec', value: 'nodejs:6' }],
            version: '0.0.0',
            exec:
            {
                kind: 'nodejs:6',
                code: '/**\n * Equivalent to unix cat command.\n * Return all the lines in an array. All other fields in the input message are stripped.\n * @param lines An array of strings.\n */\nfunction main(msg) {\n    var lines = msg.lines || [];\n    var retn = {lines: lines, payload: lines.join("\\n")};\n    console.log(\'cat: returning \' + JSON.stringify(retn));\n    return retn;\n}\n',
                binary: false
            },
            parameters: [],
            limits: { timeout: 60000, memory: 256, logs: 10 },
            namespace: '_'
        }
    }]
}

test('actions in default package', async t => {
    const ow = t.context.bx.ow
    const result = await deployer.deploy(ow, {
        basePath: 'test/actions/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force: true
    })

    //console.log(util.inspect(result, { depth: null }))
    diff.deepEqualModulo(t, result, default1)

    const cat = await ow.actions.invoke({
        actionName: 'cat-in-default-package',
        params: { lines: ['first', 'second'] },
        blocking: true
    })
    t.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: "first\nsecond" })
    t.pass()
})
