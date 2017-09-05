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
const deployer = require('..');

describe('nodejs action', function () {
    this.timeout(10000);
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('deploy-nodejs-action', async function () {
        const result = await deployer.deploy(ctx.ow, {
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'manifest.yaml',
            force: true 
        });
 
        const cat = await ctx.ow.actions.invoke({
            actionName: 'nodejs/cat',
            params: { lines: ['first', 'second'] },
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    });

    it('deploy-nodejs-action-params', async function () {
        const result = await deployer.deploy(ctx.ow, {
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'manifest-params.yaml',
            force: true 
        });

        const cat = await ctx.ow.actions.invoke({
            actionName: 'nodejs-with-param/cat-with-param',
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    });

    it('deploy-nodejs-action-annotations', async function () {
        const result = await deployer.deploy(ctx.ow, {
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'manifest-annotations.yaml',
            force: true
        });

        const action = await ctx.ow.actions.get({
            actionName: 'nodejs-with-annotation/cat-with-annotation',
            blocking: true
        });

        assert.deepEqual(action.annotations,
            [
                { key: 'myannokey', value: 'myannovalue' },
                { key: 'exec', value: 'nodejs:6' }])
    });

    it('deploy nodejs action in default package', async function () {
        const result = await deployer.deploy(ctx.ow, {
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'manifest-default-package.yaml',
            force: true
        });

        const cat = await ctx.ow.actions.invoke({
            actionName: 'nodejs-default-package',
            params: { lines: ['first', 'second'] },
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    });

});
