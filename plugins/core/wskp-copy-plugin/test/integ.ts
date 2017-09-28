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

@suite('Copy - Integration Tests')
class copyInteg {

    ctx;

    async before() {
        this.ctx = { ow: wskd.auth.initWsk() };
        await wskd.undeploy.all(this.ctx.ow);
    }

    @test('Copy remote cat code')
    async copy_eca() {
        await wskd.deploy.apply({
            ow: this.ctx.ow,
            location: 'test/copy-cat.yaml'
        });

        const cat = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy/mycat',
            params: { lines: ['first', 'second'] },
            blocking: true
        });
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' });
    }

    @test('Copy remote cat code - add parameters')
    async copy_cat_anno() {
        await wskd.deploy.apply({
            ow: this.ctx.ow,
            location: 'test/copy-cat-params.yaml'
        });

        const cat = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy/mycat2',
            blocking: true
        });
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' });
    }
}
