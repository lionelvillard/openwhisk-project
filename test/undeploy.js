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
    this.timeout(10000);
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('undeploy unmanaged action in manifest', async function () {
        const result = await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'unmanaged.yaml',
            force: true
        });
        let cat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
        assert.equal(cat.name, 'cat');

        await wskd.undeploy.apply({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'unmanaged.yaml'
        });

        try {
            cat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
            assert.fail('cat should have been undeployed');
        } catch (e) {
            assert.equal(e.statusCode, 404);
        }
    });

    it('undeploy managed action, same manifest', async function () {

        await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'unmanaged.yaml',
            force: true
        });

        await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'managed.yaml',
            force: true
        });
        let ucat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
        let mcat = await ctx.ow.actions.get({ name: 'nodejs-managed/cat' });

        assert.ok(ucat.annotations.length === 1); // exec
        assert.ok(mcat.annotations.length === 2);
        assert.ok(mcat.annotations[0].key === 'managed');

        await wskd.undeploy.apply({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'managed.yaml'
        });

        ucat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
        assert.equal(ucat.name, 'cat');

        try {
            mcat = await ctx.ow.actions.get({ name: 'nodejs-managed/cat' });
            assert.fail('cat should have been undeployed');
        } catch (e) {
            assert.equal(e.statusCode, 404);
        }
    });

    it('undeploy managed action, manifest without managed action', async function () {
        await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'unmanaged.yaml',
            force: true
        });

        await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'managed.yaml',
            force: true
        });
        let ucat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
        let mcat = await ctx.ow.actions.get({ name: 'nodejs-managed/cat' });

        assert.ok(ucat.annotations.length === 1); // exec
        assert.ok(mcat.annotations.length === 2);
        assert.ok(mcat.annotations[0].key === 'managed');

        await wskd.undeploy.apply({
            ow: ctx.ow,
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'managed-edited.yaml'
        });

        ucat = await ctx.ow.actions.get({ name: 'nodejs-unmanaged/cat' });
        assert.equal(ucat.name, 'cat');

        try {
            mcat = await ctx.ow.actions.get({ name: 'nodejs-managed/cat' });
            assert.fail('cat should have been undeployed');
        } catch (e) {
            assert.equal(e.statusCode, 404);
        }
    });

}); 