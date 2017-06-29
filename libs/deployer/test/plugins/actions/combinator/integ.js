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
const deployer = require(`${process.cwd()}/deployer`)
const util = require('util')

require(`${process.cwd()}/test/helpers/setup`)(test)

test('all', async t => {
    const ow = t.context.bx.ow
    const result = await deployer.deploy(ow, {
        basePath: 'test/plugins/actions/combinator/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force: true
    })

    const echo = await ow.actions.invoke({
        actionName: 'plugin-combinator-1/eca',
        params: {delete: 'key1', key1: 'boo', key2: 'boo2'},
        blocking: true
    })

    t.deepEqual(echo.response.result,  {key2: 'boo2', delete: 'key1' })
    t.pass()
})



