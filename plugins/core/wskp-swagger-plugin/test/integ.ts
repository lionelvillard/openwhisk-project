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
import * as swagger from '../index';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import * as wskd from 'openwhisk-deploy';
import * as rp from 'request-promise';

@suite
class integration {
    ctx;

    async before() {
        const config : wskd.IConfig = {};
        await wskd.init.init(config);
        await wskd.undeploy.all(config);
        this.ctx = { ow:config.ow };
    }

    @test
    async skillsroute() {
        const config = { ow: this.ctx.ow, basePath: '.', location: 'test/skills.yaml' };
        await wskd.deploy.apply(config);

        const routes = await this.ctx.ow.routes.list();
        assert(routes);
        assert(routes.apis);
        assert(routes.apis[0]);
        assert(routes.apis[0].value);

        const apidoc = routes.apis[0].value.apidoc;
        assert(apidoc);
        assert(apidoc.info);
        assert.strictEqual(apidoc.info.title, '/cap');

        const paths = apidoc.paths;
        const url = paths['/v1/skills'].get['x-openwhisk'].url;
        const skills = await rp(url);
        
        assert.deepStrictEqual(JSON.parse(skills), {
            "json": "list of skills"
        });
    }
}