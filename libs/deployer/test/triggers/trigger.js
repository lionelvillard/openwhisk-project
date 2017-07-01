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


test('non-observable trigger', async t => {
    const ow = t.context.bx.ow
    await extra.deleteTriggers(t, ow, ['triggers-1'])

    const result = await deployer.deploy(ow, {
        basePath: 'test/triggers/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml'
    })

    await extra.deleteTriggers(t, ow, ['triggers-1'])

    t.pass()
})


test('alarm feed', async t => {
    const ow = t.context.bx.ow
    await extra.deleteFeeds(t, ow, [['/whisk.system/alarms/alarm', 'triggers-2']])

    const result = await deployer.deploy(ow, {
        basePath: 'test/triggers/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest-feed.yaml'
    })

    t.pass()

    await extra.deleteFeeds(t, ow, [['/whisk.system/alarms/alarm', 'triggers-2']])

})
