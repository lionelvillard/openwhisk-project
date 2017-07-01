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

test('echo rule', async t => {
    const ow = t.context.bx.ow
    await extra.deleteRules(t, ow, ['rules-1'])
    await extra.deleteTriggers(t, ow, ['rules-trigger-1'])

    const result = await deployer.deploy(ow, {
        basePath: 'test/rules/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml'
    })

    const activation = await ow.triggers.invoke({name: 'rules-trigger-1', params: {msg: 'Hello'}})

    const activationId = activation.activationId
    t.true(typeof activationId === 'string')

    const echo = await ow.activations.get({activationId})
    t.deepEqual(echo.response.result, {msg: 'Hello'})

    await extra.deleteRules(t, ow, ['rules-1'])
    await extra.deleteTriggers(t, ow, ['rules-trigger-1'])
})
