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
const extra = require('../helpers/utils')

require('../helpers/setup')(test)

test('package-1', async t => {
    const packageName = 'packages-1'
    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force:true
    })

    t.truthy(result)
    const pkg = await ow.packages.get({packageName: packageName})
    t.true(pkg.name === packageName)
})

test('package with params', async t => {
    const packageName = 'packages-1-params'

    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-params.yaml',
        force:true
    })

    t.truthy(result)
    const pkg = await ow.packages.get({packageName})
    t.true(pkg.name === packageName)
})


test('package with annotations', async t => {
    const packageName = 'packages-1-annos'

    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)


    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-annotations.yaml',
        force: true
    })

    t.truthy(result)
    const pkg = await ow.packages.get({packageName})
    t.true(pkg.name === packageName)

})

test('package with bindings', async t => {
    const packageName = 'packages-1-binding'

    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-binding.yaml'
    })

    t.truthy(result)
    const pkg = await ow.packages.get({packageName})
    t.true(pkg.name === packageName)
})

test('shared package', async t => {
    const packageName = 'packages-1-publish'
    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(t.context.bx.ow, {
        basePath: 'test/packages/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-publish.yaml',
        force:true
    })

    t.truthy(result)
    const pkg = await ow.packages.get({packageName})
    t.true(pkg.name === packageName)
})