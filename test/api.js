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

describe('API gateway', function () {
    this.timeout(10000);
    const ctx = {};
    
    before(utils.before(ctx));
    after(utils.after(ctx));


    it('hello world', async function() {
        await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/api',
            cache: ctx.cacheDir,
            location: 'api.yaml',
            force: true 
        });

        const all = await ctx.ow.routes.list();
        const apis = all.apis;
        assert.ok(apis);
        assert.ok(apis.length > 0);
        let foundHello;
        apis.forEach(api => {
            const info = api.value.apidoc.info;
            if (info.title === '/hello')
                foundHello = true;
        });
        
        assert.ok(foundHello);
    });
});