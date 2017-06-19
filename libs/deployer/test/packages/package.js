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

const packageGold =
    { packages:
        [ { qname: 'packages-utils',
            deployResult:
                { name: 'packages-utils',
                    binding: {},
                    publish: false,
                    annotations: [],
                    version: '0.0.2',
                    parameters: [],
                    namespace: 'org_openwhisk-deployer-test-space' } } ],
        actions: [] }


test('deploy-package', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml'
    })
//    console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, packageGold, result)
})

const packageParamGold =
    { packages:
        [ { qname: 'packages-utils-params',
            deployResult:
                { name: 'packages-utils-params',
                    binding: {},
                    publish: false,
                    annotations: [],
                    version: '0.0.2',
                    parameters: [ { key: 'mykey', value: 'myvalue' } ],
                    namespace: 'org_openwhisk-deployer-test-space' } } ],
        actions: [] }

test('deploy-package-params', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-params.yaml'
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, packageParamGold, result)
})

const packageAnnoGold =
    { packages:
        [ { qname: 'packages-utils-annos',
            deployResult:
                { name: 'packages-utils-annos',
                    binding: {},
                    publish: false,
                    annotations: [ { key: 'myannokey', value: 'myannovalue' } ],
                    version: '0.0.3',
                    parameters: [],
                    namespace: 'org_openwhisk-deployer-test-space' } } ],
        actions: [] }

test('deploy-package-annotation', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-annotations.yaml'
    })

//    console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, packageAnnoGold, result)

})