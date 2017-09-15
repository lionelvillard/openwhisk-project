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

describe('nodejs action', function () {
    this.timeout(10000);
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    it('deploy-nodejs-action', async function () {
        const result = await wskd.deploy({
            ow: ctx.ow, 
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
        const result = await wskd.deploy({
            ow: ctx.ow, 
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
        const result = await wskd.deploy({
            ow: ctx.ow, 
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
        const result = await wskd.deploy({
            ow: ctx.ow, 
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

    it('deploy nodejs action with explicit kind', async function () {
        const result = await wskd.deploy({
            ow: ctx.ow, 
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'cat-with-kind.yaml',
            force: true
        });

        const cat = await ctx.ow.actions.invoke({
            actionName: 'nodejs/cat-with-kind',
            params: { lines: ['first', 'second'] },
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    });

    it('deploy web nodejs actions', async function () {
        await wskd.deploy({
            ow: ctx.ow, 
            basePath: 'test/fixtures/nodejs/',
            cache: ctx.cacheDir,
            location: 'webactions.yaml',
            force: true
        });
        const http = await utils.invokeWebAction(ctx, 'nodejs-webactions/http', { name: 'Jane'}, '.http');
        assert.deepEqual(JSON.parse(http).name, 'Jane');

        const json = await utils.invokeWebAction(ctx, 'nodejs-webactions/http', { name: 'Jane'}, '.json');
        assert.deepEqual(JSON.parse(json).body.name, 'Jane');
        
        const html = await utils.invokeWebAction(ctx, 'nodejs-webactions/html', {}, '.html');
        assert.deepEqual(html, '<body>Hello!</hello>');
        
        const svg = await utils.invokeWebAction(ctx, 'nodejs-webactions/svg', {}, '.svg');
        assert.deepEqual(svg, `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><text fill="rgba(81, 92, 217, 0.91)" font-family="Roboto" font-size="20" y="24" x="8">A</text></svg>`)
        
        const text = await utils.invokeWebAction(ctx, 'nodejs-webactions/text', {}, '.text');
        assert.deepEqual(text, 'A text');
        
        const png = await utils.invokeWebAction(ctx, 'nodejs-webactions/png', {}, '');
        assert.deepEqual(png.substr(1, 3), 'PNG');
    });
});
