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
import * as combinators from '../parser';
import { suite, test, slow, timeout } from 'mocha-typescript';
import * as assert from 'assert';
import * as wskd from 'openwhisk-deploy';

@suite
class integration {

    ctx;

    async before() {
        this.ctx = { ow: wskd.auth.initWsk() };
        await wskd.undeploy.all(this.ctx.ow);
    }

    after() {
    }

    @test
    async combinator() {
        await wskd.deploy.apply({
            ow: this.ctx.ow,
            location: 'test/combinator.yaml'
        });

        const trycatch = await this.ctx.ow.actions.get({ name: 'plugin-combinator-1/trycatch' });
        assert.deepStrictEqual(trycatch.parameters, [
            {
                "key": "$tryName",
                "value": "/_/plugin-combinator-1/safeToDelete"
            },
            {
                "key": "$catchName",
                "value": "/_/plugin-combinator-1/handleError"
            }
        ]);

    }
}