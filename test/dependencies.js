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
const assert = require('assert');
const utils = require('./helpers/utils');
const wskd = require('..');

describe('testing dependencies', function () {

    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('package utils in project namespace', async function () {
        await wskd.deploy.apply({
            ow: ctx.ow,
            cache: ctx.cacheDir,
            manifest: `
                dependencies: 
                  - location: git+https://github.com/lionelvillard/incubator-openwhisk-catalog.git/packages/utils/manifest.yaml`
        });

        const cat = await ctx.ow.actions.invoke({
            actionName: 'utils/cat',
            params: { lines: ['first', 'second'] },
            blocking: true
        });
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' });
    })

})
