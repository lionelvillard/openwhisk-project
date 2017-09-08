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
const utils = require('../helpers/utils');
const wskd = require('../..');
const { exec } = require('child-process-promise');
const fs = require('fs-extra');

describe('testing refresh', function () {
    const ctx = {};

    before(utils.before(ctx));
    after(utils.after(ctx));

    function assertNamespaceEmpty(json) {
        assert.equal(json.packages.length, 0);
        assert.equal(json.actions.length, 0);
        assert.equal(json.rules.length, 0);
        assert.equal(json.triggers.length, 0);
        assert.equal(json.apis.length, 0);
    }

    it('empty namespace', async function () {
        const result = await wskd.refresh.apply({
            ow: ctx.ow,
            target: 1 // raw
        });
        assertNamespaceEmpty(result);
    });

    it('data processing', async function () {
        this.timeout(30000);

        await wskd.deploy({
            ow: ctx.ow,
            basePath: 'test/fixtures/dataprocessing/',
            cache: ctx.cacheDir,
            location: 'openwhisk.yaml'
        });
        
        const json = await wskd.refresh.apply({
            ow: ctx.ow,
            target: 1 // raw
        });

        // sanity checks.
        assert.equal(json.packages.length, 1);
        assert.equal(json.packages[0].name, 'data-processing');
        assert.equal(json.actions.length, 3);

        const bash = await wskd.refresh.apply({
            ow: ctx.ow,
            target: 2 // bash
        });

        await wskd.undeploy.all(ctx.ow);
        const json2 = await wskd.refresh.apply({
            ow: ctx.ow,
            target: 1 // raw
        });
        assertNamespaceEmpty(json2);

        // apply script
        await fs.copy('test/fixtures/dataprocessing/', `${ctx.cacheDir}`);
        await fs.writeFile(`${ctx.cacheDir}/deploy.sh`, bash);
        await fs.chmod(`${ctx.cacheDir}/deploy.sh`, 0o755);
        
        const result = await exec('./deploy.sh', {cwd: ctx.cacheDir, shell: '/bin/bash'});
        assert.ok(!result.error);
        assert.equal(result.stderr, '');

        const writeTo = await ctx.ow.actions.get({name: 'data-processing/write-to-cloudant'});
        const writeFrom = await ctx.ow.actions.get({name: 'data-processing/write-from-cloudant'});
        const writeFromSeq = await ctx.ow.actions.get({name: 'data-processing/write-from-cloudant-sequence'});

        assert.equal(writeTo.name, 'write-to-cloudant');
        assert.equal(writeFrom.name, 'write-from-cloudant');
        assert.equal(writeFromSeq.name, 'write-from-cloudant-sequence');
    });


});