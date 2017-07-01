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

test('plain nodejs action', async t => {
    const packageName = 'nodejs-action-1'
    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(ow, {
        basePath: 'test/actions/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force: true
    })

    const cat = await ow.actions.invoke({
        actionName: 'nodejs-action-1/cat',
        params: {lines: ['first', 'second']},
        blocking: true
    })
    t.deepEqual(cat.response.result, {lines: ['first', 'second'], payload: 'first\nsecond'})

    await extra.deletePackage(t, ow, packageName)
})

test('nodejs action with params', async t => {
    const packageName = 'nodejs-action-3'
    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(ow, {
        basePath: 'test/actions/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest-params.yaml',
        force: true
    })

    const echo = await ow.actions.invoke({
        actionName: 'nodejs-action-3/echo-with-param',
        blocking: true
    })
    t.deepEqual(echo.response.result, {msg: 'Hello'})

    await extra.deletePackage(t, ow, packageName)
})


test('nodejs action with annotations', async t => {
    const packageName = 'nodejs-action-2'
    const ow = t.context.bx.ow
    await extra.deletePackage(t, ow, packageName)

    const result = await deployer.deploy(ow, {
        basePath: 'test/actions/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest-annotations.yaml',
        force: true
    })

    const cat = await ow.actions.get({
        actionName: 'nodejs-action-2/cat-with-annotation'
    })

    t.deepEqual(cat.annotations,
        [{key: 'myannokey', value: 'myannovalue'},
            {key: 'exec', value: 'nodejs:6'}])
})