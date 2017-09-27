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

describe('testing rules', function () {
    this.timeout(10000);
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('deploy a rule', async function () {
        const result = await deployer.deploy.apply({
            ow: ctx.ow, 
            basePath: 'test/fixtures/rules/',
            cache: ctx.cacheDir,
            location: 'manifest.yaml',
            force: true
        });

        const activationId = await ctx.ow.triggers.invoke({name: 'rules-trigger', params: {msg:'hello'} });
        const r = await ctx.ow.activations.result(activationId);
        assert.deepStrictEqual(r, { result: { msg: 'hello' }, success: true, status: 'success' });
    }); 
});