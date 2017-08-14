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
    {
        packages: [{
            qname: 'packages-utils',
            deployResult: {
                name: 'packages-utils',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.0',
                parameters: [],
                namespace: '_'
            }
        }]
    }


test('deploy-package', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, packageGold)
})

const packageParamGold =
    {
        packages: [{
            qname: 'packages-utils-params',
            deployResult: {
                name: 'packages-utils-params',
                binding: {},
                publish: false,
                annotations: [],
                version: '0.0.0',
                parameters: [{key: 'mykey', value: 'myvalue'}],
                namespace: '_'
            }
        }]
    }

test('deploy-package-params', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-params.yaml',
        force:true
    })
    //console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, packageParamGold)
})

const packageAnnoGold =
    {
        packages: [{
            qname: 'packages-utils-annos',
            deployResult: {
                name: 'packages-utils-annos',
                binding: {},
                publish: false,
                annotations: [{key: 'myannokey', value: 'myannovalue'}],
                version: '0.0.0',
                parameters: [],
                namespace: '_'
            }
        }]
    }

test('deploy-package-annotation', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-annotations.yaml',
        force: true
    })

//    console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, packageAnnoGold)

})

const packageBindingGold =
    {
        packages: [{
            qname: 'packages-utils-binding',
            deployResult: {
                name: 'packages-utils-binding',
                binding: {
                    name: 'utils',
                    namespace: 'whisk.system'
                },
                publish: false,
                annotations: [{
                    key: 'binding',
                    value: {
                        name: 'utils',
                        namespace: 'whisk.system'
                    }
                }],
                version: '0.0.0',
                parameters: [],
                namespace: '_'
            }
        }]
    }

test('deploy-package-binding', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-binding.yaml',
        force:true
    })

//    console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, packageBindingGold)

})

const packagePublishGold =
    {
        packages: [{
            qname: 'packages-utils-publish',
            deployResult: {
                name: 'packages-utils-publish',
                binding: {},
                publish: true,
                annotations: [],
                version: '0.0.0',
                parameters: [],
                namespace: '_'
            }
        }]
    }

test('deploy-package-publish', async t => {
    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-publish.yaml',
        force:true
    })

//    console.log(util.inspect(result, {depth: null}))
    diff.deepEqualModulo(t, result, packagePublishGold)
})