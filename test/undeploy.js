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

describe('testing undeploy', function () {
    this.timeout(5000);
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('undeploy an unmanaged action', async function () {
        const result = await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'unmanaged.yaml',
            force: true
        });
        let cat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
    
        await wskd.undeploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'unmanaged.yaml'
        });
        assert.equal(cat.name, 'cat');
        
        try {
            cat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
            assert.fail('cat should not be deployed');
        } catch (e) {
            assert.equal(e.statusCode, 404);
        }
    });


}); 