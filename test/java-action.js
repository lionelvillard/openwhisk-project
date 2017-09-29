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

describe('Java action', function () {
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('Hello', async function () {
        const result = await wskd.deploy.apply({
            ow: ctx.ow,
            basePath: 'test/fixtures/java/',
            cache: ctx.cacheDir,
            location: 'hello.yaml',
            force: true 
        });

        const hello = await ctx.ow.actions.invoke({
            actionName: 'java/hello',
            params: { name: 'titi' },
            blocking: true
        });
        assert.deepEqual(hello.response.result, { greeting: 'Hello titi!' });
    });

})