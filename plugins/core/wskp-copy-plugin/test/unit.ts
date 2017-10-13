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
import * as copy from '../copy';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import * as wskd from 'openwhisk-deploy';

@suite('Copy - Unit Tests')
class copyUnit {

    ctx;

    async before() {
        this.ctx = { ow: wskd.env.initWsk() };
    }

    @test('Copy remote eca code')
    async copy_eca() {
        const result = await copy.actionContributor(this.ctx, { namespace: '_' }, 'pkg', 'test', { copy: '/whisk.system/combinators/eca' });
        assert.ok(result)
        assert.equal(result[0].body.code.substr(0, 11), '// Licensed');
    }

    @test('Copy remote eca code - overwrite annotation ')
    async copy_eca_anno() {
        const result = await copy.actionContributor(this.ctx, { namespace: '_' }, 'pkg', 'test', { copy: '/whisk.system/combinators/eca', annotations: {description:'overwritten'} });
        assert.ok(result)
        assert.equal(result[0].body.annotations.description, 'overwritten');
    }
}
