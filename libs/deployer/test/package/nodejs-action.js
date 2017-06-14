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

require('../helpers/setup')(test, 'test-nodejs-action')

test('deploy-nodejs-action', async t => {
    const result = await deployer.deploy(t.context.ow, {
        basePath: 'test/package/fixtures/nodejs-action',
        cache: t.context.tmpdir,
        location: 'manifest.yaml'
    })
    t.true(typeof result === 'object')
    t.deepEqual(result, JSON.parse('{"packages":[{"name":"utils"}],"actions":[{"name":"utils/cat"}]}'))
})