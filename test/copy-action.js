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
const deployer = require('../deploy');


describe('copy action', function () {
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('copy system cat action', async function () {
        const result = await deployer.deploy(ctx.ow, {
            basePath: 'test/fixtures/copy/',
            cache: ctx.cacheDir,
            location: 'manifest.yaml',
            force: true
        });

        const cat = await ctx.ow.actions.invoke({
            actionName: 'copy/cat-copy',
            params: {lines: ['first', 'second']},
            blocking: true
        })
        assert.deepEqual(cat.response.result, {lines: ['first', 'second'], payload: 'first\nsecond'})
    });



    it('copy user action', async function () {
        const result = await deployer.deploy(ctx.ow, {
            basePath: 'test/fixtures/copy/',
            cache: ctx.cacheDir,
            location: 'manifest-local.yaml',
            force: true
        });

        const cat = await ctx.ow.actions.invoke({
            actionName: 'copy-local/cat-copy',
            params: {lines: ['first', 'second']},
            blocking: true
        })
        assert.deepEqual(cat.response.result, {lines: ['first', 'second'], payload: 'first\nsecond'})
    });
})


