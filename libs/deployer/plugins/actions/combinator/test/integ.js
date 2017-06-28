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
const deployer = require('../../../../deployer')
const util = require('util')

require('../../../../test/helpers/setup')(test)


test('try-catch', async t => {
    const ow = t.context.bx.ow
    const result = await deployer.deploy(ow, {
        basePath: 'plugins/actions/combinator/test/fixtures',
        cache: t.context.tmpdir,
        location: 'manifest.yaml',
        force: true
    })

    console.log(util.inspect(result, {depth: null}))
    // diff.deepEqualModulo(t, result, code1Gold)
    //
    // const echo = await ow.actions.invoke({
    //     actionName: 'code-action1/echo1',
    //     params: {lines: ['first', 'second']},
    //     blocking: true
    // })
    // t.deepEqual(echo.response.result, {lines: ['first', 'second']})
    t.pass()
})



