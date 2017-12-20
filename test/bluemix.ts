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
import { suite, test, slow, timeout, skip } from 'mocha-typescript';
import * as assert from 'assert';
import { init, bx } from '..';
import { exec } from 'child-process-promise';
import * as fs from 'fs-extra';

@suite('Bluemix Test Suite')
class BluemixSuite {

   static config;

    static async before() {
        await fs.remove('.workdir/.bluemix');
        await fs.mkdirs('.workdir/.bluemix');
        process.chdir('.workdir/.bluemix');

        BluemixSuite.config = init.newConfig(null, process.env.LOGGER_LEVEL);
        await init.init(BluemixSuite.config);
    }

    static async after() {
        process.chdir('../..');
        await fs.remove('.workdir/.bluemix');
    }

    @test('should list all bluemix spaces, automatic login with default endpoint, env.BLUEMIX_ORG, no spaces')
    async bluemixLogin() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        await exec('bx logout');

        const cred = {};
        const io = await bx.run(BluemixSuite.config, cred, 'account spaces');
        assert.ok(true);
    }

    @test('should automatically login to default endpoint, env.BLUEMIX_ORG, dev space')
    async bluemixSpace() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        await exec('bx logout');

        const cred = { space: 'dev' };
        const io = await bx.run(BluemixSuite.config, cred, 'target');
        assert.ok(true);
    }

    @test('should refresh .wskprops for dev space')
    async refreshwskprops() {
        if (process.env.LOCALWSK === 'true')
            return skip(this);

        await exec('bx logout');

        const cred = { space: 'dev' };
        const props = await bx.initWsk(BluemixSuite.config, cred);
        assert.ok(props);
    }
}
