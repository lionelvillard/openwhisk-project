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
import { init } from '..';
import * as fs from 'fs-extra';

@suite('git - ')
class DeploySuite {

    async before() {
        await fs.emptyDir('.workdir/.gittest');
        await fs.mkdirs('.workdir/.gittest');
        process.chdir('.workdir/.gittest');
    }

    @test('clone github repo, sha')
    async deployGitHubSha() {
        const config = init.newConfig('git+https://github.com/lionelvillard/incubator-openwhisk-catalog.git/packages/utils/manifest.yaml#8989d7e');
        await init.init(config);
        assert.deepStrictEqual(config.manifest.version, "1.0.0");
    }

    @test('clone github repo, tag')
    async deployGitHubTag() {
        const config = init.newConfig('git+https://github.com/lionelvillard/incubator-openwhisk-catalog.git/packages/utils/manifest.yaml#v1.0.0');
        await init.init(config);
        assert.deepStrictEqual(config.manifest.version, "1.0.0");
    }

    @test('clone github repo, checkout version 1.0.0 and then 1.0.1')
    async deployGitHubChangeVersion() {
        const config = init.newConfig('git+https://github.com/lionelvillard/incubator-openwhisk-catalog.git/packages/utils/manifest.yaml#v1.0.0');
        await init.init(config);
        assert.deepStrictEqual(config.manifest.version, "1.0.0");

        const config2 = init.newConfig('git+https://github.com/lionelvillard/incubator-openwhisk-catalog.git/packages/utils/manifest.yaml#v1.0.1');
        await init.init(config2);
        assert.deepStrictEqual(config2.manifest.version, "1.0.1");
    }

    async after() {
        process.chdir('../..');
        await fs.emptyDir('.workdir/.gittest');
    }
}
