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
class CopyInteg {

    ctx;

    async before() {
        const config: wskd.IConfig = {};
        await wskd.init.init(config);
        await wskd.undeploy.all(config);
        this.ctx = { ow: config.ow };
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


    @test('Copy within same project')
    async copy_same() {
        await wskd.deploy.apply({
            ow: this.ctx.ow,
            location: 'test/copy-local.yaml'
        });

        let action = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy-local/local',
            blocking: true
        });
        assert.deepEqual(action.response.result, { msg: 'base' });

        action = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy-local/local-copy',
            blocking: true
        });
        assert.deepEqual(action.response.result, { msg: 'base' });

        action = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy-local/local-copy-param',
            blocking: true
        });
        assert.deepEqual(action.response.result, { msg: 'local-copy-param' });

        action = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy-local/local-copy-of-copy',
            blocking: true
        });
        assert.deepEqual(action.response.result, { msg: 'local-copy-of-copy' });

        action = await this.ctx.ow.actions.invoke({
            actionName: 'plugin-copy-local2/local-copy-other-package',
            blocking: true
        });
        assert.deepEqual(action.response.result, { msg: 'local-copy-other-package' });
    }
}
