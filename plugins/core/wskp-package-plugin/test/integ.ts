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
import * as pkg from '../package';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import * as wskd from 'openwhisk-deploy';
import * as path from 'path';

@suite('Package - Integration Tests')
class integration {

    ctx;
    cache;

    async before() {
        this.cache = path.join(__dirname, '..', '..', '..', '..', '..', '.openwhisk', 'build', 'package-plugin'); 
        const config : wskd.IConfig = {};
        await wskd.init.init(config);
        await wskd.undeploy.all(config);
        this.ctx = { ow:config.ow };
    }

    after() {
    }

    @test('Zip nodejs action - all')
    async zip_nodejs() {
        await wskd.deploy.apply({
            ow: this.ctx.ow, 
            basePath: 'test/nodejs-zip',
            cache: this.cache,
            location: 'manifest.yaml',
            force: true
        });
    
        const cat = await this.ctx.ow.actions.invoke({
            actionName: 'nodejs-zip/cat',
            params: { lines: ['first', 'second'] },
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    }

    @test('Zip nodejs action - all - sugar')
    async zip_nodejs_sugar() {
        await wskd.deploy.apply({
            ow: this.ctx.ow, 
            basePath: 'test/nodejs-zip',
            cache: this.cache,
            location: 'sugar.yaml',
            force: true
        });
    
        const cat = await this.ctx.ow.actions.invoke({
            actionName: 'nodejs-zip-sugar/cat',
            params: { lines: ['first', 'second'] },
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    }

    @test('Zip nodejs action - follow links')
    async zip_nodejs_follow() {
        await wskd.deploy.apply({
            ow: this.ctx.ow, 
            basePath: 'test/nodejs-zip-symlinks',
            cache: this.cache,
            location: 'manifest.yaml',
            force: true
        });
    
        const cat = await this.ctx.ow.actions.invoke({
            actionName: 'nodejs-zip-symlinks/cat',
            params: { lines: ['first', 'second'] },
            blocking: true
        })
        assert.deepEqual(cat.response.result, { lines: ['first', 'second'], payload: 'first\nsecond' })
    }
 
}