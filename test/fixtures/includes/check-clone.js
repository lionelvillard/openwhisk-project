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
const deployer = require('../../deployer')
const test = require('ava')

require('../helpers/setup')(test, 'test-check-clone')


const checkCloneGold = {
    includes: [
        {
            actions: [
                {
                    deployResult: true,
                    kind: 'nodejs:default',
                    // location: '/Users/villardl/Projects/whisk/openwhisk-deploy/libs/deployer/test-results/testbsGxdW/deps/incubator-openwhisk-catalog/packages/utils/cat.js',
                    params: [],
                    qname: 'utils/cat'
                }

            ],
            packages: [
                {

                    deployResult: true,
                    qname: 'utils',
                }
            ]
        }

    ]
}

test('check-clone', async t => {
    const result = await deployer.deploy(null, {
        basePath: t.context.tmpdir,
        manifest: `
            includes: 
              - location: github.com/lionelvillard/incubator-openwhisk-catalog/packages/utils
                version: master`
    })
    t.true(typeof result === 'object')
    t.true(result.hasOwnProperty('includes'))
    t.true(result.includes[0].hasOwnProperty('actions'))
    t.true(result.includes[0].actions[0].hasOwnProperty('location'))
    delete result.includes[0].actions[0].location


    t.deepEqual(checkCloneGold, result)
})