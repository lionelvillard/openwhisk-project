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
import * as combinators from '../web';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import * as wskd from 'openwhisk-deploy';
import * as rp from 'request-promise';
import * as fs from 'fs';

@suite
class WebIntegration {

    ctx;

    async before() {
        this.ctx = { ow: wskd.auth.initWsk() };
        await wskd.undeploy.all(this.ctx.ow);
    }

    after() {
    }

    @test
    async basicForm() {
        await wskd.deploy.apply({
            ow: this.ctx.ow,
            location: 'test/webactions.yaml'
        });

        const svg = await this.invokeWebAction('plugin-web/icon', {}, '');
        assert.deepEqual(svg, fs.readFileSync('test/icon.svg').toString());
        
        const png = await this.invokeWebAction('plugin-web/world', {}, '');
        assert.deepEqual(png.substr(1, 3), 'PNG');

    }


    async invokeWebAction(actionName, params, contentExt) {
        const action = await this.ctx.ow.actions.get({ actionName });
        const namespace = action.namespace;
        if (actionName.includes('/'))
            actionName = actionName.substring(actionName.indexOf('/') + 1);

        let query = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`);
        const url = `${this.ctx.ow.actions.client.options.api}web/${namespace}/${actionName}${contentExt}?${query}`;
        return await rp(url);
    }
}

